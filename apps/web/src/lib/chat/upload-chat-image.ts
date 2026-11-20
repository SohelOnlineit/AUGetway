const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function contentType(file: File) {
  const name = file.name.toLowerCase();
  if (file.type === "image/jpeg" || file.type === "image/jpg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (file.type === "image/png" || name.endsWith(".png")) return "image/png";
  if (file.type === "image/webp" || name.endsWith(".webp")) return "image/webp";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "image/gif";
  return "";
}

export async function uploadChatImage(
  roomId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  const type = contentType(file);
  if (!type) return { ok: false, message: "Choose a JPEG, PNG, WebP, or GIF photo" };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, message: "Photo must be 8MB or smaller" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }

  const response = await fetch(`/api/chat/rooms/${roomId}/images`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataBase64: btoa(binary), contentType: type }),
  });
  const payload = (await response.json().catch(() => null)) as { path?: string; message?: string } | null;
  if (!response.ok || !payload?.path) {
    return { ok: false, message: payload?.message || "Photo was not uploaded" };
  }
  return { ok: true, path: payload.path };
}
