"use client";

import { io, type Socket } from "socket.io-client";
import {
  ChatClientEvent,
  ChatServerEvent,
  type PublicChatMessage,
} from "@amarpin/types";

export function getChatSocketUrl(): string {
  const api =
    process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api";
  // Socket.IO attaches to the HTTP origin, not the /api prefix.
  return api.replace(/\/api\/?$/, "");
}

export async function fetchSocketToken(): Promise<string | null> {
  const response = await fetch("/api/auth/socket-token", { cache: "no-store" });
  if (response.ok) {
    const payload = (await response.json()) as { accessToken?: string };
    if (payload.accessToken) return payload.accessToken;
  }
  const guest = await fetch("/api/chat/guest-token", { method: "POST" });
  if (!guest.ok) return null;
  const payload = (await guest.json()) as { accessToken?: string };
  return payload.accessToken ?? null;
}

export function createChatSocket(token: string): Socket {
  return io(`${getChatSocketUrl()}/chat`, {
    auth: { token },
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 12,
    reconnectionDelay: 800,
  });
}

export {
  ChatClientEvent,
  ChatServerEvent,
  type PublicChatMessage,
};
