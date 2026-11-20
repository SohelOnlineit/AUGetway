"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicChatRoomDetail } from "@amarpin/types";
import { AccountShell, AccountState } from "@/components/account/AccountShell";
import { ChatPanel } from "@/components/chat/ChatPanel";

export default function ChatRoomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [room, setRoom] = useState<PublicChatRoomDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(`/api/chat/rooms/${params.id}`);
      if (cancelled) return;
      if (response.status === 401) {
        router.replace(`/login?next=/chat/${params.id}`);
        return;
      }
      if (response.status === 404) {
        setError("Chat room not found");
        setLoading(false);
        return;
      }
      if (!response.ok) {
        setError("Unable to load chat room");
        setLoading(false);
        return;
      }
      setRoom((await response.json()) as PublicChatRoomDetail);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.id, router]);

  return (
    <AccountShell title="Chat room" lead="Authenticated live support chat.">
      <AccountState loading={loading} error={error}>
        {room ? (
          <div className="account-stack">
            <ul className="meta">
              <li>
                Room: <code>{room.id}</code>
              </li>
              <li>
                Status: <strong>{room.status}</strong>
              </li>
              {room.ticketId ? (
                <li>
                  Ticket:{" "}
                  <Link href={`/tickets/${room.ticketId}`}>
                    {room.ticketNumber}
                  </Link>
                </li>
              ) : null}
            </ul>
            <ChatPanel
              key={room.id}
              roomId={room.id}
              initialMessages={room.messages}
            />
            <p className="auth-links">
              <Link href="/chat">All chats</Link>
              {" · "}
              <Link href="/tickets">Tickets</Link>
            </p>
          </div>
        ) : null}
      </AccountState>
    </AccountShell>
  );
}
