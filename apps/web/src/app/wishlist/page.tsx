"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicWishlistItem } from "@amarpin/types";
import { AccountShell, AccountState } from "@/components/account/AccountShell";
import { formatPrice } from "@/lib/account/format";

export default function WishlistPage() {
  const router = useRouter();
  const [items, setItems] = useState<PublicWishlistItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/account/wishlist");
      if (cancelled) return;
      if (response.status === 401) {
        router.replace("/login?next=/wishlist");
        return;
      }
      if (!response.ok) {
        setError("Unable to load wishlist");
        setLoading(false);
        return;
      }
      setItems((await response.json()) as PublicWishlistItem[]);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function remove(itemId: string) {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/account/wishlist/${itemId}`, {
      method: "DELETE",
    });
    setPending(false);
    if (!response.ok) {
      setError("Could not remove wishlist item");
      return;
    }
    setItems((await response.json()) as PublicWishlistItem[]);
  }

  return (
    <AccountShell title="Wishlist" lead="Products you saved for later.">
      <AccountState
        loading={loading}
        error={error}
        empty={
          items && items.length === 0
            ? "Wishlist is empty. Save items from a product page."
            : null
        }
      >
        {items && items.length > 0 ? (
          <div className="order-list">
            {items.map((item) => (
              <article key={item.id} className="order-row">
                <div>
                  <Link href={`/${item.slug}`}>
                    <strong>{item.title}</strong>
                  </Link>
                  <p>
                    {formatPrice(item.priceMinor, item.currency)}
                    {item.available ? "" : " · unavailable"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void remove(item.id)}
                >
                  Remove
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </AccountState>
      {!loading && items && items.length === 0 ? (
        <p className="auth-links">
          <Link href="/products">Browse products</Link>
        </p>
      ) : null}
    </AccountShell>
  );
}
