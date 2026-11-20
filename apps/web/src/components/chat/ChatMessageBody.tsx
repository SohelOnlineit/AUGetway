"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CHAT_IMAGE_PATH = /^\/api\/content\/media\/[a-f0-9]{32}\.(webp|svg)$/i;

export function chatPreview(body: string, imageUrl?: string | null) {
  const text = body.trim();
  if (text) return text;
  if (imageUrl) return "Photo";
  return "";
}

export function ChatMessageBody({
  body,
  imageUrl,
}: {
  body: string;
  imageUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const photo = imageUrl && CHAT_IMAGE_PATH.test(imageUrl) ? imageUrl : null;
  return (
    <div className={`live-chat-bubble${photo ? " has-photo" : ""}`}>
      {photo ? (
        <button type="button" className="live-chat-photo-open" aria-label="View photo" onClick={() => setOpen(true)}>
          <img className="live-chat-photo" src={photo} alt="Shared photo" />
        </button>
      ) : null}
      {body.trim() ? <p>{body}</p> : null}
      {open && photo ? <PhotoViewer src={photo} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function PhotoViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="live-chat-photo-view" role="dialog" aria-modal="true" aria-label="Shared photo">
      <button type="button" className="live-chat-photo-view-backdrop" aria-label="Close photo" onClick={onClose} />
      <button ref={closeRef} type="button" className="live-chat-photo-view-close" onClick={onClose}>
        Close
      </button>
      <img src={src} alt="Shared photo" />
    </div>,
    document.body,
  );
}
