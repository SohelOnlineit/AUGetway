"use client";

import { useRef, useState } from "react";
import type { PublicProfile } from "@amarpin/types";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function contentType(file: File) {
  const name = file.name.toLowerCase();
  if (file.type === "image/jpeg" || file.type === "image/jpg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (file.type === "image/png" || name.endsWith(".png")) return "image/png";
  if (file.type === "image/webp" || name.endsWith(".webp")) return "image/webp";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "image/gif";
  if (file.type === "image/avif" || name.endsWith(".avif")) return "image/avif";
  if (file.type === "image/bmp" || name.endsWith(".bmp")) return "image/bmp";
  if (file.type === "image/tiff" || name.endsWith(".tif") || name.endsWith(".tiff")) return "image/tiff";
  return "";
}

export function ProfilePhoto({
  profile,
  onUpdated,
  compact = false,
}: {
  profile: PublicProfile;
  onUpdated: (profile: PublicProfile) => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const letter = (profile.displayName || profile.email).trim().charAt(0).toUpperCase() || "A";

  async function upload(file: File) {
    const type = contentType(file);
    if (!type) {
      setError("Choose a JPEG, PNG, WebP, or GIF photo");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("Photo must be 8MB or smaller");
      return;
    }
    setPending(true);
    setError(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    const response = await fetch("/api/account/profile/photo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataBase64: btoa(binary), contentType: type }),
    });
    const payload = (await response.json().catch(() => null)) as PublicProfile | { message?: string } | null;
    setPending(false);
    if (!response.ok || !payload || !("avatarUrl" in payload)) {
      const message = payload && "message" in payload ? payload.message : null;
      setError(message || "Photo was not saved");
      return;
    }
    onUpdated(payload);
  }

  return (
    <div className="profile-photo">
      <button
        type="button"
        className="profile-avatar"
        aria-label={profile.avatarUrl ? "Change profile photo" : "Add profile photo"}
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" width={100} height={100} />
        ) : (
          <b>{letter}</b>
        )}
        <span className="profile-avatar-badge" aria-hidden>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      <div>
        {compact ? null : <strong>Profile photo</strong>}
        <p>{pending ? "Saving photo…" : compact ? "Your profile photo" : "100 × 100, saved as WebP"}</p>
        <button type="button" className="profile-photo-btn" disabled={pending} onClick={() => inputRef.current?.click()}>
          {profile.avatarUrl ? "Change photo" : "Add photo"}
        </button>
        {error ? <p className="form-error">{error}</p> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/tiff"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
