"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddToWishlistButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function add() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/wishlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (response.status === 401) {
        router.push("/login?next=/wishlist");
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const msg = Array.isArray(payload?.message)
          ? payload.message.join(", ")
          : payload?.message;
        throw new Error(msg || "Could not save to wishlist");
      }
      router.push("/wishlist");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save to wishlist",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => void add()}
      >
        {pending ? "Saving…" : "Save to wishlist"}
      </button>
      {message ? <p className="form-error">{message}</p> : null}
    </div>
  );
}
