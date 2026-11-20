import { Logger } from "@nestjs/common";
import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { AppEvent } from "./events.types";

@WebSocketGateway({
  namespace: "/events",
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  afterInit() {
    this.logger.log("Socket.IO /events namespace ready");
  }

  handleConnection(client: Socket) {
    this.logger.debug(`events client connected: ${client.id}`);
  }

  @SubscribeMessage("ping")
  handlePing(@MessageBody() _body: unknown) {
    return {
      event: AppEvent.SystemPing,
      data: { at: new Date().toISOString() },
    };
  }

  broadcastSitePublished() {
    this.server.emit(AppEvent.SitePublished, {
      at: new Date().toISOString(),
    });
  }
}
