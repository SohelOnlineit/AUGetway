"use client";

import { useEffect, useRef } from "react";
import type { PublicChatMessage } from "@amarpin/types";
import { ChatServerEvent, createChatSocket, fetchSocketToken } from "@/lib/chat/socket";

export type StaffDeskEvent =
  | { type: "presence"; userId: string; online: boolean }
  | { type: "message"; message: PublicChatMessage }
  | { type: "read"; roomId: string };

/** Live updates for the staff room list: customer presence, new messages, and reads. */
export function useStaffDesk(enabled: boolean, onEvent: (event: StaffDeskEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let socket: ReturnType<typeof createChatSocket> | null = null;

    void (async () => {
      const token = await fetchSocketToken();
      if (!token || cancelled) return;
      socket = createChatSocket(token);
      if (cancelled) {
        socket.disconnect();
        return;
      }
      socket.on(ChatServerEvent.DeskPresence, (payload: { userId?: string; online?: boolean }) => {
        if (!payload?.userId) return;
        onEventRef.current({ type: "presence", userId: payload.userId, online: payload.online === true });
      });
      socket.on(ChatServerEvent.DeskMessage, (message: PublicChatMessage) => {
        if (!message?.roomId || !message.id) return;
        onEventRef.current({ type: "message", message });
      });
      socket.on(ChatServerEvent.DeskRead, (payload: { roomId?: string }) => {
        if (!payload?.roomId) return;
        onEventRef.current({ type: "read", roomId: payload.roomId });
      });
    })();

    return () => {
      cancelled = true;
      socket?.removeAllListeners();
      socket?.disconnect();
    };
  }, [enabled]);
}
