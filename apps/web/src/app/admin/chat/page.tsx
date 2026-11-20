"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AdminChatRoomListItem, AdminPage, PublicChatMessage } from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { FabChatBubbleIcon } from "@/components/chat/FabChatBubbleIcon";
import { chatPreview } from "@/components/chat/ChatMessageBody";
import {
  MessengerThread,
  roomStamp,
  roomListName,
  roomTitle,
  type ChatDeskRoom,
} from "@/components/chat/LiveChatLauncher";
import { useStaffDesk } from "@/components/chat/useStaffDesk";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";

function toRoom(row: AdminChatRoomListItem): ChatDeskRoom {
  return {
    id: row.id,
    status: row.status,
    ticketNumber: row.ticketNumber,
    updatedAt: row.updatedAt,
    customerUserId: row.customerUserId,
    customerEmail: row.customerEmail,
    customerDisplayName: row.customerDisplayName,
    customerOnline: row.customerOnline,
    unreadCount: row.unreadCount,
    lastMessage: row.lastMessage,
  };
}

function AdminChatRoomsPage() {
  const params = useSearchParams();
  const requested = params.get("room");
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [rooms, setRooms] = useState<ChatDeskRoom[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(requested);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pictureUploads, setPictureUploads] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  useStaffDesk(ready && !sessionError, (event) => {
    if (event.type === "presence") {
      setRooms((prev) =>
        prev.map((room) =>
          room.customerUserId === event.userId ? { ...room, customerOnline: event.online } : room,
        ),
      );
      return;
    }
    if (event.type === "read") {
      setRooms((prev) => prev.map((room) => (room.id === event.roomId ? { ...room, unreadCount: 0 } : room)));
      return;
    }
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== event.message.roomId) return room;
        const fromCustomer = event.message.senderUserId === room.customerUserId;
        const viewing = room.id === activeIdRef.current;
        return {
          ...room,
          updatedAt: event.message.createdAt,
          customerOnline: fromCustomer ? true : room.customerOnline,
          lastMessage: {
            body: event.message.body,
            imageUrl: event.message.imageUrl,
            senderIsStaff: event.message.senderIsStaff,
            createdAt: event.message.createdAt,
          },
          unreadCount: viewing || !fromCustomer ? 0 : Math.min(99, (room.unreadCount ?? 0) + 1),
        };
      }),
    );
  });

  useEffect(() => {
    const stored = window.localStorage.getItem("uq_chat_sound");
    if (stored === "off") setSoundOn(false);
  }, []);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const [list, access] = await Promise.all([
        adminFetch<AdminPage<AdminChatRoomListItem>>("/chat/rooms?page=1&pageSize=100"),
        fetch("/api/chat/access", { cache: "no-store" }),
      ]);
      if (cancelled) return;
      if (!list.ok) {
        setError(list.message);
        setReady(true);
        return;
      }
      const next = list.data.items.map(toRoom);
      setRooms(next);
      setTotal(list.data.total);
      setActiveId((current) => current ?? requested ?? next[0]?.id ?? null);
      const accessBody = (await access.json().catch(() => ({}))) as { pictureUploads?: boolean };
      setPictureUploads(access.ok && accessBody.pictureUploads === true);
      setError(null);
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, requested, sessionError]);

  const filtered = rooms.filter((room) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      roomTitle(room).toLowerCase().includes(q) ||
      (room.customerEmail ?? "").toLowerCase().includes(q) ||
      (room.lastMessage?.body ?? "").toLowerCase().includes(q) ||
      (room.ticketNumber ?? "").toLowerCase().includes(q)
    );
  });
  const active = rooms.find((room) => room.id === activeId) ?? null;

  return (
    <AdminShell title="Chat rooms" permissions={permissions} bare>
      <div className="chat-rooms-page">
        <header className="chat-rooms-bar">
          <h1>
            <span className="chat-rooms-mark" aria-hidden>
              <FabChatBubbleIcon />
            </span>
            Chat rooms
          </h1>
          <Link href="/admin" className="chat-rooms-dash">
            ← Dashboard
          </Link>
        </header>
        {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
        <div className="chat-rooms-desk">
          <div className={`live-chat-split${activeId ? " live-chat-split--thread" : ""}`}>
            <aside className="live-chat-rooms">
              <header className="live-chat-rooms-head">
                <p>Rooms ({total})</p>
                <button
                  type="button"
                  className="live-chat-icon-btn"
                  aria-label="Search rooms"
                  aria-pressed={searching}
                  onClick={() => setSearching((value) => !value)}
                >
                  <SearchIcon />
                </button>
              </header>
              {searching ? (
                <input
                  className="live-chat-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Name, email or message"
                  autoFocus
                />
              ) : null}
              <div className="live-chat-room-list">
                {!ready ? <p className="live-chat-empty">Loading rooms…</p> : null}
                {ready && filtered.length === 0 ? <p className="live-chat-empty">No chat rooms yet.</p> : null}
                {filtered.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    className={`live-chat-room${room.id === activeId ? " is-active" : ""}${(room.unreadCount ?? 0) > 0 && room.id !== activeId ? " has-unread" : ""}`}
                    onClick={() => {
                      setActiveId(room.id);
                      setRooms((prev) => prev.map((row) => (row.id === room.id ? { ...row, unreadCount: 0 } : row)));
                    }}
                  >
                    <span className="live-chat-avatar" aria-hidden>
                      {roomTitle(room).slice(0, 1).toUpperCase()}
                      <span
                        className={`live-chat-presence${room.customerOnline ? " is-on" : ""}`}
                        title={room.customerOnline ? "Online" : "Offline"}
                      />
                    </span>
                    <span className="live-chat-room-copy">
                      <span className="live-chat-room-top">
                        <strong title={roomTitle(room)}>{roomListName(room)}</strong>
                        {(room.unreadCount ?? 0) > 0 && room.id !== activeId ? (
                          <span className="live-chat-unread">{(room.unreadCount ?? 0) > 99 ? "99+" : room.unreadCount}</span>
                        ) : null}
                        <span className={`live-chat-status live-chat-status--${room.status.toLowerCase()}`}>
                          {room.status === "OPEN" ? "Open" : "Closed"}
                        </span>
                      </span>
                      <span className="live-chat-preview">
                        {room.lastMessage
                          ? chatPreview(room.lastMessage.body, room.lastMessage.imageUrl) || room.ticketNumber || "No messages yet"
                          : room.ticketNumber || "No messages yet"}
                      </span>
                      <span className="live-chat-room-meta">
                        <span>Support</span>
                        <span>{roomStamp(room.lastMessage?.createdAt || room.updatedAt)}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </aside>
            <section className="live-chat-thread">
              {active ? (
                <MessengerThread
                  key={active.id}
                  room={active}
                  viewerIsStaff
                  canUploadPhotos={pictureUploads}
                  soundOn={soundOn}
                  onToggleSound={() => {
                    setSoundOn((value) => {
                      const next = !value;
                      window.localStorage.setItem("uq_chat_sound", next ? "on" : "off");
                      return next;
                    });
                  }}
                  onClose={() => setActiveId(null)}
                  onBack={() => setActiveId(null)}
                  onMessage={(message: PublicChatMessage) => {
                    setRooms((prev) =>
                      prev.map((room) =>
                        room.id === message.roomId
                          ? {
                              ...room,
                              updatedAt: message.createdAt,
                              lastMessage: {
                                body: message.body,
                                imageUrl: message.imageUrl,
                                senderIsStaff: message.senderIsStaff,
                                createdAt: message.createdAt,
                              },
                            }
                          : room,
                      ),
                    );
                  }}
                />
              ) : (
                <div className="live-chat-thread-empty">
                  <FabChatBubbleIcon className="live-chat-thread-mark" />
                  <p>{ready ? "Select a room to open the conversation." : "Loading rooms…"}</p>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function AdminChatRoomsRoute() {
  return (
    <Suspense fallback={null}>
      <AdminChatRoomsPage />
    </Suspense>
  );
}
