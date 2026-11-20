"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PublicChatMessage, PublicChatRoomDetail } from "@amarpin/types";
import {
  ChatClientEvent,
  ChatServerEvent,
  createChatSocket,
  fetchSocketToken,
} from "@/lib/chat/socket";
import { playChatNotificationSound, shouldAlertChatMessage, silenceChatNotificationSound, unlockChatNotificationSound } from "@/lib/chat/notification-sound";
import { ChatCustomerInfoDialog } from "./ChatCustomerInfoDialog";
import { ChatMessageBody, chatPreview } from "./ChatMessageBody";
import { FabChatBubbleIcon } from "./FabChatBubbleIcon";
import { uploadChatImage } from "@/lib/chat/upload-chat-image";
import { useStaffDesk } from "@/components/chat/useStaffDesk";
import { formatBangladeshDate, formatBangladeshTime, isBangladeshToday } from "@/lib/datetime";

export type ChatDeskRoom = {
  id: string;
  status: string;
  ticketNumber: string | null;
  updatedAt: string;
  customerUserId?: string;
  customerEmail?: string;
  customerDisplayName?: string | null;
  customerOnline?: boolean;
  unreadCount?: number;
  lastMessage: {
    body: string;
    imageUrl?: string | null;
    senderIsStaff: boolean;
    createdAt: string;
  } | null;
};

type RoomRow = ChatDeskRoom;

function mobileChatLayout() {
  return window.matchMedia("(max-width: 800px)").matches;
}

function hiddenOn(pathname: string | null) {
  if (!pathname) return false;
  return (
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    pathname.startsWith("/admin/chat") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register")
  );
}

async function markChatAlertsRead() {
  const response = await fetch("/api/account/notifications", { cache: "no-store" });
  if (!response.ok) return;
  const rows = (await response.json().catch(() => [])) as { id?: string; kind?: string; readAt?: string | null }[];
  if (!Array.isArray(rows)) return;
  await Promise.all(
    rows
      .filter((row) => row.kind === "chat.message" && !row.readAt && row.id)
      .map((row) =>
        fetch(`/api/account/notifications/${row.id}/read`, { method: "PATCH" }),
      ),
  );
}

export function roomTitle(room: RoomRow) {
  const display = room.customerDisplayName?.trim();
  if (display) return display;
  if (room.customerEmail?.endsWith("@guests.amarpin.invalid")) return "Guest";
  if (room.customerEmail) return room.customerEmail.split("@")[0] || room.customerEmail;
  if (room.ticketNumber) return room.ticketNumber;
  return `Room ${room.id.slice(0, 6)}`;
}

/** First name when the display name has more than one word, otherwise the display name. */
export function customerHeaderName(room: RoomRow) {
  const display = room.customerDisplayName?.trim();
  if (!display) return roomTitle(room);
  return display.split(/\s+/).find(Boolean) || display;
}

export function roomListName(room: RoomRow) {
  return roomTitle(room).slice(0, 10);
}

function userIdFromToken(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: unknown };
    return typeof json.sub === "string" ? json.sub : null;
  } catch {
    return null;
  }
}

export function roomStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function LiveChatLauncher() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [guestChat, setGuestChat] = useState(false);
  const [staff, setStaff] = useState(false);
  const [roleReady, setRoleReady] = useState(false);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [supportOnline, setSupportOnline] = useState(false);
  const [unread, setUnread] = useState(0);
  const openRef = useRef(open);
  const selfIdRef = useRef<string | null>(null);
  const soundOnRef = useRef(soundOn);
  const pathnameRef = useRef(pathname);
  const activeIdRef = useRef(activeId);
  openRef.current = open;
  soundOnRef.current = soundOn;
  pathnameRef.current = pathname;
  activeIdRef.current = activeId;

  useStaffDesk(staff && open, (event) => {
    if (event.type === "presence") {
      setRooms((prev) =>
        prev.map((room) =>
          room.customerUserId === event.userId ? { ...room, customerOnline: event.online } : room,
        ),
      );
      return;
    }
    if (event.type === "read") {
      setRooms((prev) =>
        prev.map((room) => (room.id === event.roomId ? { ...room, unreadCount: 0 } : room)),
      );
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
    setMounted(true);
    const stored = window.localStorage.getItem("uq_chat_sound");
    if (stored === "off") setSoundOn(false);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mounted) return;
    if (!open && !hiddenOn(pathname)) return;
    setUnread(0);
    void markChatAlertsRead();
  }, [mounted, open, pathname]);

  const chatHidden = hiddenOn(pathname);

  useEffect(() => {
    if (!mounted || chatHidden) return;
    let cancelled = false;
    let socket: ReturnType<typeof createChatSocket> | null = null;

    async function watch() {
      const profile = await fetch("/api/account/profile", { cache: "no-store" });
      if (!profile.ok || cancelled) return;
      const me = (await profile.json()) as { id?: string; roles?: string[] };
      if (!me.id) return;
      selfIdRef.current = me.id;
      const isStaff = (me.roles ?? []).some((role) => role === "ADMINISTRATOR" || role === "EDITOR");
      setLoggedIn(true);
      setStaff(isStaff);
      setRoleReady(true);
      const notes = await fetch("/api/account/notifications", { cache: "no-store" });
      if (notes.ok && !cancelled) {
        const rows = (await notes.json().catch(() => [])) as { kind?: string; readAt?: string | null }[];
        const count = Array.isArray(rows)
          ? rows.filter((row) => row.kind === "chat.message" && !row.readAt).length
          : 0;
        setUnread(count);
      }
      const loaded = await fetchRooms(isStaff);
      if (!loaded.ok || cancelled) return;
      const token = await fetchSocketToken();
      if (!token || cancelled) return;
      socket = createChatSocket(token);
      const roomIds = loaded.rooms.map((room) => room.id);
      socket.on("connect", () => {
        if (cancelled || !socket) return;
        for (const roomId of roomIds) socket.emit(ChatClientEvent.JoinRoom, { roomId });
      });
      socket.on(ChatServerEvent.Message, (message: PublicChatMessage) => {
        if (cancelled || openRef.current || hiddenOn(pathnameRef.current)) return;
        if (!message.senderUserId || message.senderUserId === selfIdRef.current) return;
        if (!shouldAlertChatMessage(message, false)) return;
        setUnread((count) => Math.min(99, count + 1));
        if (soundOnRef.current) playChatNotificationSound();
      });
    }

    void watch();
    return () => {
      cancelled = true;
      socket?.removeAllListeners();
      socket?.disconnect();
    };
  }, [mounted, chatHidden]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("live-chat-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("live-chat-open");
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const settingsResponse = await fetch("/api/storefront/live-chat", { cache: "no-store" });
      const settings = (await settingsResponse.json().catch(() => ({}))) as {
        guestChat?: boolean;
      };
      const profile = await fetch("/api/account/profile", { cache: "no-store" });
      if (cancelled) return;
      if (profile.status === 401) {
        setLoggedIn(false);
        setGuestChat(settings.guestChat === true);
        setStaff(false);
        setRoleReady(true);
        if (settings.guestChat !== true) {
          setRooms([]);
          setTotal(0);
          setLoading(false);
          setReady(true);
          return;
        }
        const opened = await fetch("/api/chat/rooms", { method: "POST" });
        if (cancelled) return;
        if (!opened.ok) {
          setError("Unable to start chat");
          setRooms([]);
          setLoading(false);
          setReady(true);
          return;
        }
        const room = (await opened.json()) as RoomRow;
        setRooms([room]);
        setTotal(1);
        setActiveId(room.id);
        setLoading(false);
        setReady(true);
        return;
      }
      const body = (await profile.json().catch(() => ({}))) as { roles?: string[] };
      const roles = body.roles ?? [];
      const isStaff = roles.includes("ADMINISTRATOR") || roles.includes("EDITOR");
      setLoggedIn(true);
      setGuestChat(false);
      setStaff(isStaff);
      setRoleReady(true);
      const loaded = await fetchRooms(isStaff);
      if (cancelled) return;
      if (!loaded.ok) {
        setError("Unable to load chats");
        setLoading(false);
        setReady(true);
        return;
      }
      let rooms = loaded.rooms;
      let total = loaded.total;
      if (!loaded.staff && rooms.length === 0) {
        const opened = await fetch("/api/chat/rooms", { method: "POST" });
        if (opened.ok) {
          const room = (await opened.json()) as RoomRow;
          rooms = [room];
          total = 1;
        }
      }
      if (cancelled) return;
      setStaff(loaded.staff);
      setRooms(rooms);
      setTotal(total);
      setActiveId((current) => {
        if (loaded.staff && mobileChatLayout()) return null;
        return current ?? rooms[0]?.id ?? null;
      });
      setLoading(false);
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!mounted || hiddenOn(pathname)) return null;

  const filtered = rooms.filter((room) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      roomTitle(room).toLowerCase().includes(q) ||
      (room.lastMessage?.body ?? "").toLowerCase().includes(q) ||
      (room.ticketNumber ?? "").toLowerCase().includes(q)
    );
  });
  const active = rooms.find((room) => room.id === activeId) ?? null;
  const conversation = staff ? active : active ?? rooms[0] ?? null;

  const popup =
    open &&
    createPortal(
      <div className="live-chat-root">
        <button
          type="button"
          className="live-chat-backdrop"
          aria-label="Close live support"
          onClick={() => setOpen(false)}
        />
        <div
          className={`live-chat-panel${roleReady && !staff ? " live-chat-panel--customer" : ""}${ready && !loggedIn && !guestChat ? " live-chat-panel--signin" : ""}`}
          role="dialog"
          aria-label={staff ? "Chats" : roleReady ? "Live support" : "Loading chats"}
        >
          <header className="live-chat-bar">
            <div className="live-chat-brand">
              <span className={`live-chat-brand-stage${roleReady && !staff ? " is-animated" : ""}`} aria-hidden>
                {roleReady && !staff ? (
                  <>
                    <span className="live-chat-brand-ring" />
                    <span className="live-chat-brand-glow" />
                  </>
                ) : null}
                <span className="live-chat-brand-icon">
                  <FabChatBubbleIcon animated={roleReady && !staff} />
                </span>
              </span>
              <span className="live-chat-brand-copy">
                <strong>{staff ? "Chats" : roleReady ? "Live Support" : "Chats"}</strong>
                {roleReady && !staff && ready && (loggedIn || guestChat) ? (
                  <span className={`live-chat-online${supportOnline ? " is-on" : ""}`}>
                    <i />
                    {supportOnline ? "Support online" : "Support offline"}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="live-chat-bar-actions">
              {loggedIn && staff ? (
                <Link
                  href="/admin/chat"
                  className="live-chat-dash"
                  onClick={() => setOpen(false)}
                >
                  Dashboard view
                </Link>
              ) : null}
              {roleReady && !staff && ready && (loggedIn || guestChat) ? (
                <button
                  type="button"
                  className={`live-chat-icon-btn${soundOn ? " is-on" : ""}`}
                  aria-label={soundOn ? "Mute chat sounds" : "Unmute chat sounds"}
                  onClick={() => {
                    const turningOn = !soundOn;
                    if (!turningOn) silenceChatNotificationSound();
                    void unlockChatNotificationSound().then(() => {
                      if (turningOn) playChatNotificationSound();
                    });
                    setSoundOn((value) => {
                      const next = !value;
                      window.localStorage.setItem("uq_chat_sound", next ? "on" : "off");
                      return next;
                    });
                  }}
                >
                  <SoundIcon muted={!soundOn} />
                </button>
              ) : null}
              <button type="button" className="live-chat-icon-btn" aria-label="Close chat" onClick={() => setOpen(false)}>
                <CloseIcon />
              </button>
            </div>
          </header>
          {!ready ? (
            <p className="live-chat-empty">Loading chats…</p>
          ) : !loggedIn && !guestChat ? (
            <GuestPrompt onClose={() => setOpen(false)} />
          ) : (
            <div className={`live-chat-split${roleReady && !staff ? " live-chat-split--customer" : ""}${activeId ? " live-chat-split--thread" : ""}`}>
              {staff ? (
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
                  <button
                    type="button"
                    className="live-chat-icon-btn live-chat-rooms-close"
                    aria-label="Close chat"
                    onClick={() => setOpen(false)}
                  >
                    <CloseIcon />
                  </button>
                </header>
                {searching ? (
                  <input
                    className="live-chat-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search rooms"
                    autoFocus
                  />
                ) : null}
                <div className="live-chat-room-list">
                  {loading ? <p className="live-chat-empty">Loading rooms…</p> : null}
                  {error ? <p className="form-error">{error}</p> : null}
                  {!loading && filtered.length === 0 ? (
                    <p className="live-chat-empty">No chat rooms yet.</p>
                  ) : null}
                  {filtered.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      className={`live-chat-room${room.id === activeId ? " is-active" : ""}${(room.unreadCount ?? 0) > 0 && room.id !== activeId ? " has-unread" : ""}`}
                      onClick={() => {
                        setActiveId(room.id);
                        setRooms((prev) =>
                          prev.map((row) => (row.id === room.id ? { ...row, unreadCount: 0 } : row)),
                        );
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
                            <span className="live-chat-unread">{room.unreadCount! > 99 ? "99+" : room.unreadCount}</span>
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
              ) : null}
              <section className="live-chat-thread">
                {conversation ? (
                  <MessengerThread
                    key={conversation.id}
                    room={conversation}
                    viewerIsStaff={staff}
                    hideHead={!staff}
                    canUploadPhotos={false}
                    soundOn={soundOn}
                    onToggleSound={() => {
                      setSoundOn((value) => {
                        const next = !value;
                        window.localStorage.setItem("uq_chat_sound", next ? "on" : "off");
                        return next;
                      });
                    }}
                    onClose={() => setOpen(false)}
                    onBack={() => setActiveId(null)}
                    onConnected={staff ? undefined : setSupportOnline}
                    onMessage={(message) => {
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
                    <p>{staff ? "Select a room to open the conversation." : error || "Starting your support chat…"}</p>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      {popup}
      <div className="live-chat-launcher">
        <div className={`live-chat-fab-wrap${open ? " is-open" : ""}${unread > 0 ? " has-alert" : ""}`}>
          <span className="live-chat-fab-aura" aria-hidden />
          <span className="live-chat-fab-halo" aria-hidden />
          <span className="live-chat-fab-halo live-chat-fab-halo--reverse" aria-hidden />
          <span className="live-chat-fab-orbit" aria-hidden>
            <span className="live-chat-fab-spark live-chat-fab-spark--1" />
            <span className="live-chat-fab-spark live-chat-fab-spark--2" />
            <span className="live-chat-fab-spark live-chat-fab-spark--3" />
          </span>
          <span className="live-chat-fab-orbit live-chat-fab-orbit--outer" aria-hidden>
            <span className="live-chat-fab-spark live-chat-fab-spark--4" />
            <span className="live-chat-fab-spark live-chat-fab-spark--5" />
            <span className="live-chat-fab-spark live-chat-fab-spark--6" />
          </span>
          <span className="live-chat-fab-ring" aria-hidden />
          <span className="live-chat-fab-ring live-chat-fab-ring--delayed" aria-hidden />
          <button
            type="button"
            className="live-chat-fab"
            aria-label={unread > 0 ? `Open live support, ${unread} unread` : "Open live support"}
            aria-expanded={open}
            onClick={() => {
              void unlockChatNotificationSound();
              setReady(false);
              if (mobileChatLayout()) setActiveId(null);
              setOpen(true);
            }}
          >
            <FabChatBubbleIcon className="live-chat-fab-icon" animated />
            <span className="live-chat-fab-hint">Chat</span>
          </button>
          {unread > 0 ? (
            <span className="live-chat-fab-badge">{unread > 99 ? "99+" : unread}</span>
          ) : null}
        </div>
      </div>
    </>
  );
}

function GuestPrompt({ onClose }: { onClose: () => void }) {
  return (
    <div className="live-chat-guest">
      <div className="live-chat-guest-stage" aria-hidden>
        <span className="live-chat-guest-ring" />
        <span className="live-chat-guest-ring live-chat-guest-ring--reverse" />
        <span className="live-chat-guest-glow" />
        <FabChatBubbleIcon className="live-chat-guest-icon" animated />
      </div>
      <h2>Sign in to chat</h2>
      <p>Log in or create an account to message our support team in real time.</p>
      <div className="live-chat-guest-actions">
        <Link href="/login?next=/" className="live-chat-send" onClick={onClose}>
          Sign in
        </Link>
        <Link href="/register" className="live-chat-ghost" onClick={onClose}>
          Create account
        </Link>
      </div>
    </div>
  );
}

export function MessengerThread({
  room,
  viewerIsStaff,
  canUploadPhotos,
  soundOn,
  onToggleSound,
  onClose,
  onBack,
  onMessage,
  hideHead = false,
  showClose = true,
  supportTitle = "AuGetway Support",
  onConnected,
}: {
  room: RoomRow;
  viewerIsStaff: boolean;
  canUploadPhotos: boolean;
  soundOn: boolean;
  onToggleSound: () => void;
  onClose: () => void;
  onBack: () => void;
  onMessage: (message: PublicChatMessage) => void;
  hideHead?: boolean;
  showClose?: boolean;
  supportTitle?: string;
  onConnected?: (online: boolean) => void;
}) {
  const [messages, setMessages] = useState<PublicChatMessage[]>([]);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [partyOnline, setPartyOnline] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const socketRef = useRef<ReturnType<typeof createChatSocket> | null>(null);
  const joinedRef = useRef(false);
  const selfIdRef = useRef<string | null>(null);
  const staffIdsRef = useRef<Set<string>>(new Set());
  const customerIdsRef = useRef<Set<string>>(new Set());
  const onlineIdsRef = useRef<Set<string>>(new Set());
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  useEffect(() => {
    onConnectedRef.current?.(partyOnline);
  }, [partyOnline]);

  useEffect(() => {
    let cancelled = false;
    let socket: ReturnType<typeof createChatSocket> | null = null;
    let ping: number | null = null;
    setPartyOnline(false);
    onlineIdsRef.current = new Set();
    joinedRef.current = false;

    function rememberParticipants(
      participants: PublicChatRoomDetail["participants"] | undefined,
    ) {
      const staffIds = new Set<string>();
      const customerIds = new Set<string>();
      for (const participant of participants ?? []) {
        if (participant.role === "STAFF") staffIds.add(participant.userId);
        else customerIds.add(participant.userId);
      }
      staffIdsRef.current = staffIds;
      customerIdsRef.current = customerIds;
    }

    function publishOnline() {
      const selfId = selfIdRef.current;
      const others = [...onlineIdsRef.current].filter((id) => id !== selfId);
      const support = others.some(
        (id) => staffIdsRef.current.has(id) || !customerIdsRef.current.has(id),
      );
      const customer = others.some(
        (id) => customerIdsRef.current.has(id) || !staffIdsRef.current.has(id),
      );
      setPartyOnline(viewerIsStaff ? customer : support);
    }

    async function connect() {
      const response = await fetch(`/api/chat/rooms/${room.id}`, { cache: "no-store" });
      if (!cancelled && response.ok) {
        const detail = (await response.json()) as PublicChatRoomDetail;
        setMessages(detail.messages ?? []);
        rememberParticipants(detail.participants);
      }
      const token = await fetchSocketToken();
      if (cancelled) return;
      if (!token) {
        setError("Unable to connect to live chat");
        return;
      }
      selfIdRef.current = userIdFromToken(token);
      socket = createChatSocket(token);
      socketRef.current = socket;
      socket.on("connect", () => {
        if (cancelled || !socket) return;
        socket.emit(ChatClientEvent.JoinRoom, { roomId: room.id });
      });
      socket.on("disconnect", () => {
        if (cancelled) return;
        joinedRef.current = false;
        onlineIdsRef.current = new Set();
        setPartyOnline(false);
      });
      socket.on(
        ChatServerEvent.Joined,
        (payload: {
          messages?: PublicChatMessage[];
          participants?: PublicChatRoomDetail["participants"];
          onlineUserIds?: string[];
        }) => {
          if (cancelled) return;
          setError(null);
          rememberParticipants(payload.participants);
          if (Array.isArray(payload.onlineUserIds)) {
            onlineIdsRef.current = new Set(payload.onlineUserIds);
          } else {
            const freshAfter = Date.now() - 60_000;
            const seeded = new Set<string>();
            for (const participant of payload.participants ?? []) {
              if (!participant.lastSeenAt) continue;
              if (new Date(participant.lastSeenAt).getTime() >= freshAfter) seeded.add(participant.userId);
            }
            onlineIdsRef.current = seeded;
          }
          publishOnline();
          joinedRef.current = true;
          if (viewerIsStaff) {
            socket?.emit(ChatClientEvent.MarkRead, { roomId: room.id, at: new Date().toISOString() });
          }
          if (!Array.isArray(payload.messages)) return;
          setMessages((prev) => {
            const pending = prev.filter((row) => row.id.startsWith("local:"));
            const server = payload.messages ?? [];
            return [
              ...server,
              ...pending.filter(
                (row) =>
                  !server.some(
                    (saved) =>
                      saved.senderUserId === row.senderUserId &&
                      saved.body === row.body &&
                      (saved.imageUrl ?? null) === (row.imageUrl ?? null),
                  ),
              ),
            ];
          });
        },
      );
      socket.on(
        ChatServerEvent.Presence,
        (payload: { roomId?: string; userId?: string; online?: boolean }) => {
          if (cancelled || payload.roomId !== room.id || !payload.userId) return;
          if (payload.online) onlineIdsRef.current.add(payload.userId);
          else onlineIdsRef.current.delete(payload.userId);
          publishOnline();
        },
      );
      socket.on(ChatServerEvent.Message, (message: PublicChatMessage) => {
        if (cancelled || message.roomId !== room.id) return;
        setMessages((prev) => {
          if (prev.some((row) => row.id === message.id)) return prev;
          const pendingIndex = prev.findIndex(
            (row) =>
              row.id.startsWith("local:") &&
              row.senderUserId === message.senderUserId &&
              row.body === message.body &&
              (row.imageUrl ?? null) === (message.imageUrl ?? null),
          );
          if (pendingIndex === -1) return [...prev, message];
          const next = prev.slice();
          next.splice(pendingIndex, 1, message);
          return next;
        });
        onMessage(message);
        if (viewerIsStaff) {
          socket?.emit(ChatClientEvent.MarkRead, { roomId: room.id, at: new Date().toISOString() });
        }
        const mine = selfIdRef.current
          ? message.senderUserId === selfIdRef.current
          : message.senderIsStaff === viewerIsStaff;
        if (!mine && soundRef.current && shouldAlertChatMessage(message, true)) playChatNotificationSound();
      });
      socket.on(ChatServerEvent.Error, (payload: { code?: string }) => {
        if (cancelled) return;
        if (payload?.code === "send_failed" || payload?.code === "not_in_room") {
          setMessages((prev) => {
            let index = -1;
            for (let i = prev.length - 1; i >= 0; i -= 1) {
              if (prev[i]?.id.startsWith("local:")) {
                index = i;
                break;
              }
            }
            if (index === -1) return prev;
            return prev.filter((_, item) => item !== index);
          });
          setError("Message was not sent");
          return;
        }
        if (payload?.code === "rate_limited") setError("Too many messages. Wait a moment.");
        else if (payload?.code === "join_denied") setError("Unable to open this chat");
        else setError("Chat connection failed");
      });
      ping = window.setInterval(() => {
        socket?.emit(ChatClientEvent.PresencePing, { roomId: room.id });
      }, 20000);
    }

    void connect();
    return () => {
      cancelled = true;
      if (ping) window.clearInterval(ping);
      socket?.emit(ChatClientEvent.LeaveRoom, { roomId: room.id });
      socket?.removeAllListeners();
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [room.id, viewerIsStaff]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <>
      <header className="live-chat-thread-head" hidden={hideHead}>
        {viewerIsStaff ? (
          <button type="button" className="live-chat-icon-btn live-chat-back" aria-label="Back to rooms" onClick={onBack}>
            <BackIcon />
          </button>
        ) : null}
        {viewerIsStaff && room.customerUserId ? (
          <button
            type="button"
            className="live-chat-profile-btn"
            aria-label="View customer profile"
            onClick={() => setInfoOpen(true)}
          >
            <span className="live-chat-avatar" aria-hidden>
              {customerHeaderName(room).slice(0, 1).toUpperCase()}
            </span>
            <span className="live-chat-thread-title">
              <strong>{customerHeaderName(room)}</strong>
              <span className={`live-chat-online${partyOnline ? " is-on" : ""}`}>
                <i />
                {partyOnline ? "1 Online" : "Offline"}
              </span>
            </span>
          </button>
        ) : (
          <>
            <span className="live-chat-avatar live-chat-avatar--support" aria-hidden>
              <FabChatBubbleIcon animated />
            </span>
            <span className="live-chat-thread-title">
              <strong>{viewerIsStaff ? customerHeaderName(room) : supportTitle}</strong>
              <span className={`live-chat-online${partyOnline ? " is-on" : ""}`}>
                <i />
                {viewerIsStaff
                  ? partyOnline
                    ? "1 Online"
                    : "Offline"
                  : partyOnline
                    ? "Our team is online"
                    : "Leave a message and we will reply"}
              </span>
            </span>
          </>
        )}
        <div className="live-chat-thread-tools">
          <button
            type="button"
            className={`live-chat-icon-btn${soundOn ? " is-on" : ""}`}
            aria-label={soundOn ? "Mute chat sounds" : "Unmute chat sounds"}
            onClick={() => {
              const turningOn = !soundOn;
              if (!turningOn) silenceChatNotificationSound();
              void unlockChatNotificationSound().then(() => {
                if (turningOn) playChatNotificationSound();
              });
              onToggleSound();
            }}
          >
            <SoundIcon muted={!soundOn} />
          </button>
          {showClose ? (
            <button type="button" className="live-chat-icon-btn" aria-label="Close chat" onClick={onClose}>
              <CloseIcon />
            </button>
          ) : null}
        </div>
      </header>
      <p className="live-chat-sla">Average Response Time: &lt; 15 minutes</p>
      <div className="live-chat-log">
        {messages.map((message) => {
          const alignRight = viewerIsStaff ? message.senderIsStaff : !message.senderIsStaff;
          return (
            <div key={message.id} className={`live-chat-bubble-row${alignRight ? " is-mine" : " is-theirs"}`}>
              {alignRight ? null : viewerIsStaff && !message.senderIsStaff && room.customerUserId ? (
                <button
                  type="button"
                  className="live-chat-avatar live-chat-avatar--sm"
                  aria-label="View customer profile"
                  onClick={() => setInfoOpen(true)}
                >
                  {(message.senderDisplayName || roomTitle(room) || "C").slice(0, 1).toUpperCase()}
                </button>
              ) : (
                <span className="live-chat-avatar live-chat-avatar--sm" aria-hidden>
                  {(message.senderIsStaff ? "S" : message.senderDisplayName || "C").slice(0, 1).toUpperCase()}
                </span>
              )}
              <div>
                {alignRight ? null : (
                  <span className="live-chat-sender">
                    {viewerIsStaff && !message.senderIsStaff && room.customerUserId ? (
                      <button type="button" className="live-chat-customer-name-btn" onClick={() => setInfoOpen(true)}>
                        {message.senderDisplayName || "Customer"}
                      </button>
                    ) : message.senderIsStaff ? (
                      "Support"
                    ) : (
                      message.senderDisplayName || "Customer"
                    )}
                  </span>
                )}
                <ChatMessageBody body={message.body} imageUrl={message.imageUrl} />
                <time>{roomStamp(message.createdAt)}</time>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {viewerIsStaff ? (
        <ChatCustomerInfoDialog
          customerId={room.customerUserId ?? null}
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          fallback={{ displayName: roomTitle(room), email: room.customerEmail }}
        />
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      {photoPreview ? (
        <div className="live-chat-photo-draft">
          <img src={photoPreview} alt="" />
          <button
            type="button"
            onClick={() => {
              setPhoto(null);
              setPhotoPreview((current) => {
                if (current) URL.revokeObjectURL(current);
                return null;
              });
            }}
          >
            Remove photo
          </button>
        </div>
      ) : null}
      <form
        className="live-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          const body = text.trim();
          if ((!body && !photo) || sending || room.status !== "OPEN") return;
          const idempotencyKey = `web-${room.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const localId = `local:${idempotencyKey}`;
          setError(null);
          void unlockChatNotificationSound();
          void (async () => {
            let imageUrl: string | undefined;
            if (photo) {
              setSending(true);
              const uploaded = await uploadChatImage(room.id, photo);
              setSending(false);
              if (!uploaded.ok) {
                setError(uploaded.message);
                return;
              }
              imageUrl = uploaded.path;
            }
            const optimistic: PublicChatMessage = {
              id: localId,
              roomId: room.id,
              senderUserId: selfIdRef.current ?? "me",
              senderDisplayName: null,
              senderIsStaff: viewerIsStaff,
              body,
              imageUrl: imageUrl ?? null,
              createdAt: new Date().toISOString(),
            };
            setMessages((prev) => (prev.some((row) => row.id === localId) ? prev : [...prev, optimistic]));
            onMessage(optimistic);
            setText("");
            setPhoto(null);
            setPhotoPreview((current) => {
              if (current) URL.revokeObjectURL(current);
              return null;
            });
            const socket = socketRef.current;
            if (socket?.connected && joinedRef.current) {
              socket.emit(ChatClientEvent.SendMessage, {
                roomId: room.id,
                body,
                imageUrl,
                idempotencyKey,
              });
              return;
            }
            const response = await fetch(`/api/chat/rooms/${room.id}/messages`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ body, imageUrl, idempotencyKey }),
            });
            const payload = (await response.json().catch(() => null)) as PublicChatMessage | { message?: string } | null;
            if (!response.ok || !payload || !("id" in payload)) {
              setMessages((prev) => prev.filter((row) => row.id !== localId));
              const message = payload && "message" in payload ? payload.message : null;
              setError(message || "Message was not sent");
              setText((current) => current || body);
              return;
            }
            setMessages((prev) => {
              if (prev.some((row) => row.id === payload.id)) return prev.filter((row) => row.id !== localId);
              return prev.map((row) => (row.id === localId ? payload : row));
            });
            onMessage(payload);
          })().catch(() => {
            setMessages((prev) => prev.filter((row) => row.id !== localId));
            setError("Message was not sent");
            setSending(false);
          });
        }}
      >
        {canUploadPhotos ? (
        <>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            if (!file) return;
            setPhoto(file);
            setPhotoPreview((current) => {
              if (current) URL.revokeObjectURL(current);
              return URL.createObjectURL(file);
            });
          }}
        />
        <button
          type="button"
          className="live-chat-photo-btn"
          aria-label="Attach photo"
          disabled={sending || room.status !== "OPEN"}
          onClick={() => photoInputRef.current?.click()}
        >
          <PhotoIcon />
        </button>
        </>
        ) : null}
        <input
          type="text"
          enterKeyHint="send"
          inputMode="text"
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
          placeholder={
            room.status === "OPEN"
              ? canUploadPhotos
                ? "Type a message or send a photo..."
                : "Type a message..."
              : "This chat is closed"
          }
          maxLength={2000}
          disabled={room.status !== "OPEN" || sending}
          onFocus={() => {
            void unlockChatNotificationSound();
          }}
        />
        <button
          type="submit"
          className="live-chat-send"
          aria-disabled={!text.trim() && !photo}
          disabled={sending || room.status !== "OPEN"}
        >
          Send
        </button>
      </form>
    </>
  );
}

async function fetchRooms(staff: boolean): Promise<
  { ok: true; rooms: RoomRow[]; total: number; staff: boolean } | { ok: false }
> {
  if (staff) {
    const response = await fetch("/api/admin/chat/rooms?page=1&pageSize=50", { cache: "no-store" });
    if (response.ok) {
      const page = (await response.json()) as { items?: RoomRow[]; total?: number };
      const rooms = page.items ?? [];
      return { ok: true, rooms, total: page.total ?? rooms.length, staff: true };
    }
  }
  const response = await fetch("/api/chat/rooms", { cache: "no-store" });
  if (!response.ok) return { ok: false };
  const rooms = (await response.json()) as RoomRow[];
  return { ok: true, rooms, total: rooms.length, staff: false };
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path d="M14 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="M8 16l3-3 2 2 3-4 4 5" />
    </svg>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path d="M4 10h3l5-4v12l-5-4H4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {muted ? (
        <path d="M16 10l4 4M20 10l-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M16 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}
