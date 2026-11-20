"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { PublicChatMessage } from "@amarpin/types";
import {
  ChatClientEvent,
  ChatServerEvent,
  createChatSocket,
  fetchSocketToken,
} from "@/lib/chat/socket";
import type { Socket } from "socket.io-client";
import { ChatCustomerInfoDialog } from "./ChatCustomerInfoDialog";
import { ChatMessageBody } from "./ChatMessageBody";
import { uploadChatImage } from "@/lib/chat/upload-chat-image";

type ConnState = "connecting" | "connected" | "disconnected" | "error";

export function ChatPanel({
  roomId,
  initialMessages = [],
  viewerIsStaff = false,
  customerUserId = null,
  customerEmail,
}: {
  roomId: string;
  initialMessages?: PublicChatMessage[];
  viewerIsStaff?: boolean;
  customerUserId?: string | null;
  customerEmail?: string;
}) {
  const inputId = useId();
  const [messages, setMessages] = useState<PublicChatMessage[]>(() => initialMessages);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [canUploadPhotos, setCanUploadPhotos] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/chat/access", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { pictureUploads?: boolean };
        if (!cancelled) setCanUploadPhotos(response.ok && body.pictureUploads === true);
      })
      .catch(() => {
        if (!cancelled) setCanUploadPhotos(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let socket: Socket | null = null;
    let typingTimer: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      setConn("connecting");
      setError(null);
      const token = await fetchSocketToken();
      if (cancelled) return;
      if (!token) {
        setConn("error");
        setError("Unable to authenticate chat session");
        return;
      }
      socket = createChatSocket(token);
      socketRef.current = socket;

      socket.on("connect", () => {
        if (cancelled) return;
        setConn("connected");
        socket?.emit(ChatClientEvent.JoinRoom, { roomId });
      });
      socket.on("disconnect", () => {
        if (cancelled) return;
        setConn("disconnected");
      });
      socket.on("reconnect_attempt", () => {
        if (cancelled) return;
        setConn("connecting");
      });
      socket.on("connect_error", () => {
        if (cancelled) return;
        setConn("error");
        setError("Chat connection failed");
      });

      socket.on(ChatServerEvent.Joined, (payload: { messages?: PublicChatMessage[] }) => {
        if (cancelled) return;
        if (Array.isArray(payload.messages) && payload.messages.length > 0) {
          setMessages(payload.messages);
        }
        socket?.emit(ChatClientEvent.MarkRead, {
          roomId,
          at: new Date().toISOString(),
        });
      });

      socket.on(ChatServerEvent.Message, (message: PublicChatMessage) => {
        if (cancelled || message.roomId !== roomId) return;
        setMessages((prev) => {
          if (prev.some((row) => row.id === message.id)) return prev;
          return [...prev, message];
        });
        socket?.emit(ChatClientEvent.MarkRead, {
          roomId,
          at: new Date().toISOString(),
        });
      });

      socket.on(
        ChatServerEvent.Typing,
        (payload: { roomId: string; userId: string; typing: boolean }) => {
          if (cancelled || payload.roomId !== roomId) return;
          if (payload.typing) {
            setTypingUserId(payload.userId);
            if (typingTimer) clearTimeout(typingTimer);
            typingTimer = setTimeout(() => setTypingUserId(null), 2500);
          } else {
            setTypingUserId(null);
          }
        },
      );

      socket.on(ChatServerEvent.Error, (payload: { code?: string }) => {
        if (cancelled) return;
        if (payload.code === "unauthorized") {
          setError("Chat session expired — refresh the page");
          setConn("error");
        } else if (payload.code === "rate_limited") {
          setError("Sending too fast — wait a moment");
        } else if (payload.code === "join_denied") {
          setError("You cannot join this chat room");
          setConn("error");
        }
      });
    }

    void connect();
    return () => {
      cancelled = true;
      if (typingTimer) clearTimeout(typingTimer);
      if (socket) {
        socket.emit(ChatClientEvent.LeaveRoom, { roomId });
        socket.removeAllListeners();
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function onTypingChange(value: string) {
    setText(value);
    const socket = socketRef.current;
    if (!socket || conn !== "connected") return;
    socket.emit(
      value.trim()
        ? ChatClientEvent.TypingStart
        : ChatClientEvent.TypingStop,
      { roomId },
    );
  }

  function clearPhoto() {
    setPhoto(null);
    setPhotoPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if ((!body && !photo) || pending) return;
    const socket = socketRef.current;
    if (!socket || conn !== "connected") {
      setError("Not connected — wait for reconnect");
      return;
    }
    setPending(true);
    setError(null);
    let imageUrl: string | undefined;
    if (photo) {
      const uploaded = await uploadChatImage(roomId, photo);
      if (!uploaded.ok) {
        setError(uploaded.message);
        setPending(false);
        return;
      }
      imageUrl = uploaded.path;
    }
    socket.emit(ChatClientEvent.SendMessage, {
      roomId,
      body,
      imageUrl,
      idempotencyKey: `web-${roomId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    });
    socket.emit(ChatClientEvent.TypingStop, { roomId });
    setText("");
    clearPhoto();
    setPending(false);
  }

  return (
    <div className="account-stack">
      <p className="muted-note">
        Status:{" "}
        <strong>
          {conn === "connecting"
            ? "Connecting…"
            : conn === "connected"
              ? "Connected"
              : conn === "disconnected"
                ? "Disconnected — reconnecting…"
                : "Error"}
        </strong>
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="live-chat-log chat-message-list">
        {messages.length === 0 ? (
          <p className="empty-state">No messages yet. Say hello.</p>
        ) : (
          messages.map((message) => {
            const alignRight = viewerIsStaff ? message.senderIsStaff : !message.senderIsStaff;
            return (
              <div key={message.id} className={`live-chat-bubble-row${alignRight ? " is-mine" : " is-theirs"}`}>
                <div>
                  <span className="live-chat-sender">
                    {viewerIsStaff && !message.senderIsStaff && customerUserId ? (
                      <button type="button" className="live-chat-customer-name-btn" onClick={() => setInfoOpen(true)}>
                        {message.senderDisplayName || "Customer"}
                      </button>
                    ) : message.senderIsStaff ? (
                      "Support"
                    ) : (
                      message.senderDisplayName || "Customer"
                    )}
                  </span>
                  <ChatMessageBody body={message.body} imageUrl={message.imageUrl} />
                  <time>{formatBangladeshDateTime(message.createdAt)}</time>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      {viewerIsStaff ? (
        <ChatCustomerInfoDialog
          customerId={customerUserId}
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          fallback={{ email: customerEmail }}
        />
      ) : null}
      {typingUserId ? <p className="muted-note">Someone is typing…</p> : null}
      {canUploadPhotos && photoPreview ? (
        <div className="live-chat-photo-draft">
          <img src={photoPreview} alt="" />
          <button type="button" onClick={clearPhoto}>
            Remove photo
          </button>
        </div>
      ) : null}
      <form className="account-stack" onSubmit={(e) => void send(e)}>
        <label htmlFor={inputId}>
          Message
          <textarea
            id={inputId}
            value={text}
            enterKeyHint="send"
            onChange={(e) => onTypingChange(e.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return;
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
            rows={3}
            maxLength={2000}
            disabled={conn === "error"}
            placeholder={canUploadPhotos ? "Write a message, or attach a photo" : "Write a message"}
          />
        </label>
        <div className="sec-ed-row">
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
            disabled={pending || conn !== "connected"}
            onClick={() => photoInputRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <rect x="4" y="5" width="16" height="14" rx="2" />
              <circle cx="9" cy="10" r="1.4" />
              <path d="M8 16l3-3 2 2 3-4 4 5" />
            </svg>
          </button>
          </>
          ) : null}
          <button
            type="submit"
            className="primary-btn"
            aria-disabled={!text.trim() && !photo}
            disabled={pending || conn !== "connected"}
          >
            {photo ? "Send photo" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
