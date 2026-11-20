import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtService } from "@nestjs/jwt";
import { UploadImageDto } from "../content/dto/upload.dto";
import { UploadsService } from "../content/uploads.service";
import { RoleProfilesService } from "../storefront/role-profiles.service";
import { SendChatMessageDto } from "./dto/send-chat-message.dto";
import { ChatAccessGuard } from "./chat-access.guard";
import { ChatGateway } from "./chat.gateway";
import { ChatService } from "./chat.service";

const CHAT_PHOTO_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

@Controller("chat")
@UseGuards(ChatAccessGuard)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
    private readonly uploads: UploadsService,
    private readonly roles: RoleProfilesService,
    private readonly jwt: JwtService,
  ) {}

  @Get("access")
  access(@CurrentUser() user: AuthenticatedUser) {
    return this.roles.chatPicturesEnabled(user.roles, user.isGuest === true).then((pictureUploads) => ({
      pictureUploads,
      guest: user.isGuest === true,
    }));
  }

  @Post("guest-token")
  async guestToken(@CurrentUser() user: AuthenticatedUser) {
    if (!user.isGuest) {
      throw new ForbiddenException("Guest token is only for visitors");
    }
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, roles: user.roles, typ: "chat" },
      { expiresIn: 60 * 60 },
    );
    return { accessToken };
  }

  @Get("rooms")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.listRoomsForUser(user.id);
  }

  @Post("rooms")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  open(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.openSupportRoom(user.id);
  }

  @Post("rooms/:id/messages")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.gateway.sendAndBroadcast({
      userId: user.id,
      roles: user.roles,
      roomId: id,
      body: dto.body ?? "",
      imageUrl: dto.imageUrl,
      idempotencyKey: dto.idempotencyKey,
      isGuest: user.isGuest === true,
    });
  }

  @Post("rooms/:id/images")
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  async uploadPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UploadImageDto,
  ) {
    const access = await this.chat.assertCanAccessRoom(user.id, user.roles, id);
    if (access.room.status !== "OPEN") {
      throw new BadRequestException("Chat room is closed");
    }
    if (!(await this.roles.chatPicturesEnabled(user.roles, user.isGuest === true))) {
      throw new ForbiddenException("Picture uploads are turned off for this role");
    }
    if (!CHAT_PHOTO_MIME.has(dto.contentType)) {
      throw new BadRequestException("Photo must be a JPEG, PNG, WebP, or GIF");
    }
    const raw = dto.dataBase64.includes(",")
      ? dto.dataBase64.split(",")[1]!
      : dto.dataBase64;
    let buffer: Buffer;
    try {
      buffer = Buffer.from(raw, "base64");
    } catch {
      throw new BadRequestException("Invalid base64 payload");
    }
    return this.uploads.saveChatPhoto(buffer, dto.contentType);
  }

  @Get("rooms/:id")
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.chat.getRoomForUser(user.id, user.roles, id);
  }

  @Get("rooms/:id/messages")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Query("before") before?: string,
    @Query("limit") limit?: string,
  ) {
    const parsed = limit ? Number.parseInt(limit, 10) : 50;
    return this.chat.listMessages(
      user.id,
      user.roles,
      id,
      before,
      Number.isFinite(parsed) ? parsed : 50,
    );
  }
}
