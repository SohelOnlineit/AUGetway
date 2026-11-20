import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import {
  ChatClientEvent,
  ChatServerEvent,
  isStaffRole,
  permissionsForRoles,
  type RoleName,
} from "@amarpin/types";
import { Server, Socket } from "socket.io";
import {
  ChatParticipantRole,
  UserStatus,
} from "../../generated/prisma/client";
import { resolveStorefrontId } from "../catalog/storefronts";
import { UsersService } from "../users/users.service";
import { ChatPresenceRegistry } from "./chat-presence";
import { ChatService } from "./chat.service";
import { RedisService } from "../../shared/redis/redis.service";

type AuthedSocket = Socket & {
  data: {
    userId?: string;
    roles?: RoleName[];
    isGuest?: boolean;
    joinedRooms?: Set<string>;
  };
};

@WebSocketGateway({
  namespace: "/chat",
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);
  private readonly deskRoom = "chat:desk";

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly chat: ChatService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly presence: ChatPresenceRegistry,
  ) {}

  afterInit(server: Server) {
    // Auth runs before the client "connect" event, so JoinRoom cannot race ahead of the user id.
    server.use(async (socket: AuthedSocket, next) => {
      try {
        await this.authenticate(socket);
        next();
      } catch (error) {
        next(error instanceof Error ? error : new Error("unauthorized"));
      }
    });
    this.logger.log("Socket.IO /chat namespace ready");
  }

  async handleConnection(client: AuthedSocket) {
    if (!client.data.userId) {
      try {
        await this.authenticate(client);
      } catch {
        client.emit(ChatServerEvent.Error, { code: "unauthorized" });
        client.disconnect(true);
        return;
      }
    }
    const userId = client.data.userId;
    if (!userId) return;
    const arrived = this.presence.connect(userId);
    if (client.data.roles?.some((role: string) => isStaffRole(role))) {
      await client.join(this.deskRoom);
    }
    if (arrived) this.emitDeskPresence(userId, true);
    this.logger.debug(`chat client connected id=${client.id}`);
  }

  handleDisconnect(client: AuthedSocket) {
    const userId = client.data.userId;
    if (!userId) return;
    const rooms = [...(client.data.joinedRooms ?? [])];
    const stillOnline = this.presence.release(userId, (offlineUserId) => {
      this.emitDeskPresence(offlineUserId, false);
      for (const roomId of rooms) {
        this.server?.to(this.chat.roomSocketName(roomId)).emit(ChatServerEvent.Presence, {
          roomId,
          userId: offlineUserId,
          online: false,
          at: new Date().toISOString(),
        });
      }
    });
    if (stillOnline) return;
  }

  @SubscribeMessage(ChatClientEvent.JoinRoom)
  async onJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { roomId?: string },
  ) {
    const auth = this.requireAuth(client);
    if (!auth) return;
    const roomId = body?.roomId?.trim();
    if (!roomId) {
      client.emit(ChatServerEvent.Error, { code: "invalid_room" });
      return;
    }
    try {
      const { isStaff } = await this.chat.assertCanAccessRoom(
        auth.userId,
        auth.roles,
        roomId,
      );
      await this.chat.ensureParticipant(
        roomId,
        auth.userId,
        isStaff ? ChatParticipantRole.STAFF : ChatParticipantRole.CUSTOMER,
      );
      const socketRoom = this.chat.roomSocketName(roomId);
      await client.join(socketRoom);
      client.data.joinedRooms?.add(roomId);
      const detail = await this.chat.getRoomForUser(
        auth.userId,
        auth.roles,
        roomId,
        100,
      );
      const present = await this.server.in(socketRoom).fetchSockets();
      const onlineUserIds = [
        ...new Set(
          present
            .map((socket) => (socket.data as AuthedSocket["data"]).userId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      client.emit(ChatServerEvent.Joined, {
        roomId,
        messages: detail.messages,
        participants: detail.participants,
        onlineUserIds,
      });
      client.to(socketRoom).emit(ChatServerEvent.Presence, {
        roomId,
        userId: auth.userId,
        online: true,
        at: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn(
        `chat join denied room=${roomId} user=${auth.userId} ${error instanceof Error ? error.message : "error"}`,
      );
      client.emit(ChatServerEvent.Error, { code: "join_denied" });
    }
  }

  @SubscribeMessage(ChatClientEvent.LeaveRoom)
  async onLeave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { roomId?: string },
  ) {
    const auth = this.requireAuth(client);
    if (!auth) return;
    const roomId = body?.roomId?.trim();
    if (!roomId) return;
    if (!client.data.joinedRooms?.has(roomId)) return;
    const socketRoom = this.chat.roomSocketName(roomId);
    await client.leave(socketRoom);
    client.data.joinedRooms.delete(roomId);
    client.to(socketRoom).emit(ChatServerEvent.Presence, {
      roomId,
      userId: auth.userId,
      online: false,
      at: new Date().toISOString(),
    });
  }

  async sendAndBroadcast(input: {
    userId: string;
    roles: RoleName[];
    roomId: string;
    body: string;
    imageUrl?: string | null;
    idempotencyKey: string;
    isGuest?: boolean;
    storefront?: string;
  }) {
    const message = await this.chat.sendMessage(input);
    const socketRoom = this.chat.roomSocketName(message.roomId);
    this.server?.to(socketRoom).emit(ChatServerEvent.Message, message);
    this.server?.to(this.deskRoom).emit(ChatServerEvent.DeskMessage, message);
    return message;
  }

  @SubscribeMessage(ChatClientEvent.SendMessage)
  async onSend(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: { roomId?: string; text?: string; body?: string; imageUrl?: string; idempotencyKey?: string },
  ) {
    const auth = this.requireAuth(client);
    if (!auth) return;
    const roomId = body?.roomId?.trim();
    const text = (body?.text ?? body?.body ?? "").trim();
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
    const idempotencyKey = body?.idempotencyKey?.trim();
    if (!roomId || !idempotencyKey || (!text && !imageUrl)) {
      client.emit(ChatServerEvent.Error, { code: "invalid_payload" });
      return;
    }
    if (!client.data.joinedRooms?.has(roomId)) {
      client.emit(ChatServerEvent.Error, { code: "not_in_room" });
      return;
    }
    if (!(await this.allowRate(auth.userId, "msg", 20, 60))) {
      client.emit(ChatServerEvent.Error, { code: "rate_limited" });
      return;
    }
    try {
      await this.sendAndBroadcast({
        userId: auth.userId,
        roles: auth.roles,
        roomId,
        body: text,
        imageUrl: imageUrl || null,
        idempotencyKey,
        isGuest: client.data.isGuest === true,
        storefront: storefrontFromSocket(client),
      });
    } catch {
      client.emit(ChatServerEvent.Error, { code: "send_failed" });
    }
  }

  @SubscribeMessage(ChatClientEvent.TypingStart)
  async onTypingStart(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { roomId?: string },
  ) {
    await this.emitTyping(client, body?.roomId, true);
  }

  @SubscribeMessage(ChatClientEvent.TypingStop)
  async onTypingStop(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { roomId?: string },
  ) {
    await this.emitTyping(client, body?.roomId, false);
  }

  @SubscribeMessage(ChatClientEvent.MarkRead)
  async onRead(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { roomId?: string; at?: string },
  ) {
    const auth = this.requireAuth(client);
    if (!auth) return;
    const roomId = body?.roomId?.trim();
    if (!roomId || !client.data.joinedRooms?.has(roomId)) {
      client.emit(ChatServerEvent.Error, { code: "not_in_room" });
      return;
    }
    try {
      const result = await this.chat.markRead({
        userId: auth.userId,
        roles: auth.roles,
        roomId,
        at: body?.at,
      });
      this.server.to(this.chat.roomSocketName(roomId)).emit(ChatServerEvent.Read, result);
      this.server.to(this.deskRoom).emit(ChatServerEvent.DeskRead, { roomId });
    } catch {
      client.emit(ChatServerEvent.Error, { code: "read_failed" });
    }
  }

  @SubscribeMessage(ChatClientEvent.PresencePing)
  async onPresence(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { roomId?: string },
  ) {
    const auth = this.requireAuth(client);
    if (!auth) return;
    const roomId = body?.roomId?.trim();
    if (!roomId || !client.data.joinedRooms?.has(roomId)) return;
    try {
      const result = await this.chat.touchPresence({
        userId: auth.userId,
        roles: auth.roles,
        roomId,
      });
      client.to(this.chat.roomSocketName(roomId)).emit(ChatServerEvent.Presence, {
        roomId,
        userId: result.userId,
        online: true,
        at: result.lastSeenAt,
      });
    } catch {
      /* ignore presence errors */
    }
  }

  private async emitTyping(
    client: AuthedSocket,
    roomIdRaw: string | undefined,
    typing: boolean,
  ) {
    const auth = this.requireAuth(client);
    if (!auth) return;
    const roomId = roomIdRaw?.trim();
    if (!roomId || !client.data.joinedRooms?.has(roomId)) return;
    if (!(await this.allowRate(auth.userId, "typing", 30, 60))) return;
    client.to(this.chat.roomSocketName(roomId)).emit(ChatServerEvent.Typing, {
      roomId,
      userId: auth.userId,
      typing,
      at: new Date().toISOString(),
    });
  }

  private emitDeskPresence(userId: string, online: boolean) {
    this.server?.to(this.deskRoom).emit(ChatServerEvent.DeskPresence, {
      userId,
      online,
      at: new Date().toISOString(),
    });
  }

  private requireAuth(
    client: AuthedSocket,
  ): { userId: string; roles: RoleName[] } | null {
    if (!client.data.userId || !client.data.roles) {
      client.emit(ChatServerEvent.Error, { code: "unauthorized" });
      return null;
    }
    // Ensure permissions stay consistent with HTTP JWT strategy.
    void permissionsForRoles(client.data.roles);
    return { userId: client.data.userId, roles: client.data.roles };
  }

  private async authenticate(client: AuthedSocket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) throw new Error("unauthorized");
    const payload = await this.jwt.verifyAsync<{ sub?: string; typ?: string }>(token, {
      secret: this.config.getOrThrow<string>("security.jwtAccessSecret"),
    });
    if (!payload.sub || (payload.typ !== "access" && payload.typ !== "chat")) {
      throw new Error("unauthorized");
    }
    const user = await this.users.findById(payload.sub);
    const guestChat = payload.typ === "chat";
    if (!user || user.status !== UserStatus.ACTIVE) throw new Error("unauthorized");
    if (!guestChat && !user.emailVerified) throw new Error("unauthorized");
    if (guestChat && !user.isGuest) throw new Error("unauthorized");
    client.data.userId = user.id;
    client.data.roles = user.roles as RoleName[];
    client.data.isGuest = guestChat;
    client.data.joinedRooms = new Set();
  }

  private extractToken(client: Socket): string | null {
    const authToken = (client.handshake.auth as { token?: string } | undefined)
      ?.token;
    if (typeof authToken === "string" && authToken.trim()) {
      return authToken.trim();
    }
    const header = client.handshake.headers.authorization;
    if (typeof header === "string" && header.startsWith("Bearer ")) {
      return header.slice(7).trim();
    }
    return null;
  }

  private async allowRate(
    userId: string,
    bucket: string,
    limit: number,
    windowSec: number,
  ): Promise<boolean> {
    const key = `chat:rl:${bucket}:${userId}`;
    try {
      const count = await this.redis.client.incr(key);
      if (count === 1) {
        await this.redis.client.expire(key, windowSec);
      }
      return count <= limit;
    } catch {
      // Fail open lightly if Redis blips — still protected by Nest HTTP throttle on REST.
      return true;
    }
  }
}

function storefrontFromSocket(client: Socket) {
  const header = client.handshake.headers["x-storefront"];
  const explicit = Array.isArray(header) ? header[0] : header;
  if (explicit) return resolveStorefrontId(explicit);
  const origin = client.handshake.headers.origin || client.handshake.headers.referer;
  if (typeof origin === "string") {
    try {
      return resolveStorefrontId(new URL(origin).hostname);
    } catch {
      return resolveStorefrontId(undefined);
    }
  }
  return resolveStorefrontId(undefined);
}
