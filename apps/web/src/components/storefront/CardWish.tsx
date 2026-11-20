"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CardWish({ productId }: { productId: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function save(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (pending || saved) return;
    setPending(true);
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
      if (response.ok) setSaved(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className={saved ? "catalog-tile-wish is-on" : "catalog-tile-wish"}
      aria-label={saved ? "Saved to wishlist" : "Save to wishlist"}
      aria-pressed={saved}
      disabled={pending}
      onClick={(event) => void save(event)}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <path
          d="M12 19.2s-6.2-3.8-6.2-8.1A3.5 3.5 0 0 1 12 8.4a3.5 3.5 0 0 1 6.2 2.7c0 4.3-6.2 8.1-6.2 8.1Z"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
