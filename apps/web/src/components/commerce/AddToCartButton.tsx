"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { trackStorefrontEvent } from "@/lib/analytics/client";

export function AddToCartButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function add() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/cart", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      if (response.status === 401 || response.status === 403) {
        router.push(`/login?next=/product`);
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const msg = Array.isArray(payload?.message)
          ? payload?.message.join(", ")
          : payload?.message;
        throw new Error(msg || "Could not add to cart");
      }
      trackStorefrontEvent({
        name: "add_to_cart",
        entityType: "product",
        entityId: productId,
      });
      router.push("/cart");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add to cart");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" className="primary-btn" disabled={pending} onClick={() => void add()}>
        {pending ? "Adding…" : "Add to cart"}
      </button>
      {message ? <p className="form-error">{message}</p> : null}
    </div>
  );
}
