"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicChatRoomSummary } from "@amarpin/types";
import { AccountShell } from "@/components/account/AccountShell";
import { FabChatBubbleIcon } from "@/components/chat/FabChatBubbleIcon";
import {
  MessengerThread,
  type ChatDeskRoom,
} from "@/components/chat/LiveChatLauncher";

function toRoom(row: PublicChatRoomSummary): ChatDeskRoom {
  return {
    id: row.id,
    status: row.status,
    ticketNumber: row.ticketNumber,
    updatedAt: row.updatedAt,
    customerUserId: row.customerUserId,
    lastMessage: row.lastMessage,
  };
}

export default function CustomerLiveChatPage() {
  const router = useRouter();
  const [room, setRoom] = useState<ChatDeskRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pictureUploads, setPictureUploads] = useState(false);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem("uq_chat_sound");
    if (stored === "off") setSoundOn(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [list, access] = await Promise.all([
        fetch("/api/chat/rooms", { cache: "no-store" }),
        fetch("/api/chat/access", { cache: "no-store" }),
      ]);
      if (cancelled) return;
      if (list.status === 401) {
        router.replace("/login?next=/chat");
        return;
      }
      if (!list.ok) {
        setError("Unable to open live support");
        setReady(true);
        return;
      }
      const rooms = (await list.json()) as PublicChatRoomSummary[];
      let current =
        rooms.find((row) => row.status === "OPEN" && !row.ticketId) ??
        rooms.find((row) => row.status === "OPEN") ??
        null;
      if (!current) {
        const opened = await fetch("/api/chat/rooms", { method: "POST" });
        if (!opened.ok) {
          setError("Unable to open live support");
          setReady(true);
          return;
        }
        current = (await opened.json()) as PublicChatRoomSummary;
      }
      if (cancelled) return;
      setRoom(toRoom(current));
      const accessBody = (await access.json().catch(() => ({}))) as { pictureUploads?: boolean };
      setPictureUploads(access.ok && accessBody.pictureUploads === true);
      setError(null);
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <AccountShell title="Live Support" bare>
      <div className="chat-rooms-page">
        <header className="chat-rooms-bar">
          <div>
            <h1>
              <span className="chat-rooms-mark" aria-hidden>
                <FabChatBubbleIcon animated />
              </span>
              Live Support
            </h1>
            <p className="chat-rooms-lead">Chat with our team in real time.</p>
          </div>
          <Link href="/dashboard" className="chat-rooms-dash">
            ← Dashboard
          </Link>
        </header>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="chat-rooms-desk chat-rooms-desk--customer">
          {room ? (
            <MessengerThread
              room={room}
              viewerIsStaff={false}
              showClose={false}
              supportTitle="AuGetway Support"
              canUploadPhotos={pictureUploads}
              soundOn={soundOn}
              onToggleSound={() => {
                setSoundOn((value) => {
                  const next = !value;
                  window.localStorage.setItem("uq_chat_sound", next ? "on" : "off");
                  return next;
                });
              }}
              onClose={() => router.push("/dashboard")}
              onBack={() => router.push("/dashboard")}
              onMessage={() => undefined}
            />
          ) : (
            <div className="live-chat-thread-empty">
              <FabChatBubbleIcon className="live-chat-thread-mark" animated />
              <p>{ready ? "Starting your support chat…" : "Loading live support…"}</p>
            </div>
          )}
        </div>
      </div>
    </AccountShell>
  );
}
