"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicCart } from "@amarpin/types";
import { publishCartCount } from "@/lib/cart-count";

const COUPON_KEY = "uq_cart_coupon";

export function CartScreen({ initial }: { initial: PublicCart }) {
  const router = useRouter();
  const [cart, setCart] = useState<PublicCart | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [discountMinor, setDiscountMinor] = useState(0);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [voucherMessage, setVoucherMessage] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem(COUPON_KEY);
    if (saved) setCouponCode(saved);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/cart");
      if (cancelled) return;
      if (response.status === 401 || response.status === 403) {
        router.replace("/login?next=/cart");
        return;
      }
      if (!response.ok) {
        setError("Unable to load cart");
        return;
      }
      const next = (await response.json()) as PublicCart;
      setCart(next);
      publishCartCount(next.itemCount);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function updateQuantity(itemId: string, quantity: number) {
    setPendingId(itemId);
    setError(null);
    const response =
      quantity < 1
        ? await fetch(`/api/cart/items/${itemId}`, { method: "DELETE" })
        : await fetch(`/api/cart/items/${itemId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ quantity }),
          });
    setPendingId(null);
    if (response.status === 401 || response.status === 403) {
      router.replace("/login?next=/cart");
      return;
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
      const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
      setError(message || "Could not update the cart");
      return;
    }
    const next = (await response.json()) as PublicCart;
    setCart(next);
    publishCartCount(next.itemCount);
  }

  async function applyCoupon() {
    const code = couponCode.trim();
    if (!code) return;
    setQuoting(true);
    setCouponMessage(null);
    const response = await fetch("/api/checkout/coupon-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
      discountMinor?: number;
      code?: string;
    };
    setQuoting(false);
    if (!response.ok) {
      setDiscountMinor(0);
      sessionStorage.removeItem(COUPON_KEY);
      const message = Array.isArray(payload.message) ? payload.message.join(", ") : payload.message;
      setCouponMessage(message || "Coupon is not valid");
      return;
    }
    setDiscountMinor(payload.discountMinor ?? 0);
    sessionStorage.setItem(COUPON_KEY, payload.code || code);
    setCouponMessage("Coupon applied");
  }

  function applyVoucher() {
    if (!voucherCode.trim()) return;
    setVoucherMessage("Voucher codes are not applied from this cart.");
  }

  const lines = cart?.items.length ?? 0;
  const units = cart?.itemCount ?? 0;
  const subtotal = cart?.subtotalMinor ?? 0;
  const total = Math.max(0, subtotal - discountMinor);

  return (
    <main className="cart-screen">
      <div className="cart-bar">
        <h1>
          <span>
            <CartIcon />
          </span>
          Your cart
        </h1>
        <Link href="/dashboard">← Dashboard</Link>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {!cart ? <p className="cart-loading">Loading cart…</p> : null}

      {cart && cart.items.length === 0 ? (
        <section className="cart-card">
          <header>
            <span>
              <CartIcon />
            </span>
            <div>
              <h2>Cart items</h2>
              <p>Your shopping cart is empty</p>
            </div>
          </header>
          <p className="cart-empty">
            Browse products and add gift cards or digital items to get started.{" "}
            <Link href="/products">Browse products</Link>
          </p>
        </section>
      ) : null}

      {cart && cart.items.length > 0 ? (
        <div className="cart-layout">
          <div className="cart-main">
            <section className="cart-card">
              <header>
                <span>
                  <ReceiptIcon />
                </span>
                <div>
                  <h2>Cart overview</h2>
                  <p>
                    {units} {units === 1 ? "item" : "items"} ready for checkout
                  </p>
                </div>
              </header>
              <div className="cart-stats">
                <article>
                  <span>
                    <CartIcon />
                  </span>
                  <small>Products</small>
                  <strong>{lines}</strong>
                  <em>Unique line items</em>
                </article>
                <article>
                  <span>
                    <TagIcon />
                  </span>
                  <small>Quantity</small>
                  <strong>{units}</strong>
                  <em>Total units in cart</em>
                </article>
                <article>
                  <span>
                    <BoltIcon />
                  </span>
                  <small>Total</small>
                  <strong>{taka(subtotal)}</strong>
                  <em>Estimated checkout amount</em>
                </article>
              </div>
            </section>

            <section className="cart-card">
              <header>
                <span>
                  <CartIcon />
                </span>
                <div>
                  <h2>Cart items</h2>
                  <p>Review products, quantities, and delivery details</p>
                </div>
              </header>
              {cart.items.map((item) => {
                const max = Math.max(item.quantity, Math.min(20, item.availableQuantity));
                return (
                  <article key={item.id} className="cart-item">
                    <div className="cart-product">
                      <span>
                        {item.primaryImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.primaryImageUrl} alt="" />
                        ) : (
                          <BagIcon />
                        )}
                      </span>
                      <Link href={`/${item.slug}`}>{item.title}</Link>
                    </div>
                    <div className="cart-package">
                      <span>
                        <TagIcon />
                        {item.packageName || item.title}
                      </span>
                      <b>{taka(item.unitPriceMinor)}</b>
                    </div>
                    {item.region ? <p className="cart-region">REGION : {item.region}</p> : null}
                    <div className="cart-amount">
                      <span>Amount</span>
                      <b>{taka(item.lineTotalMinor)}</b>
                    </div>
                    <div className="cart-qty">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        disabled={pendingId === item.id || item.quantity <= 1}
                        onClick={() => void updateQuantity(item.id, item.quantity - 1)}
                      >
                        −
                      </button>
                      <b>{item.quantity}</b>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        disabled={pendingId === item.id || item.quantity >= max}
                        onClick={() => void updateQuantity(item.id, item.quantity + 1)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="is-remove"
                        aria-label={`Remove ${item.title}`}
                        disabled={pendingId === item.id}
                        onClick={() => void updateQuantity(item.id, 0)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          </div>

          <aside className="cart-side">
            <section className="cart-card cart-summary">
              <header>
                <span>
                  <ReceiptIcon />
                </span>
                <div>
                  <h2>Order summary</h2>
                  <p>
                    {lines} {lines === 1 ? "product" : "products"} in cart
                  </p>
                </div>
                <em>
                  {units} {units === 1 ? "item" : "items"}
                </em>
              </header>
              <dl>
                <div>
                  <dt>
                    Subtotal ({units} {units === 1 ? "item" : "items"})
                  </dt>
                  <dd>{taka(subtotal)}</dd>
                </div>
                {discountMinor > 0 ? (
                  <div className="is-discount">
                    <dt>Coupon</dt>
                    <dd>−{taka(discountMinor)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Delivery</dt>
                  <dd className="is-free">Instant · Free</dd>
                </div>
                <div className="is-total">
                  <dt>Total</dt>
                  <dd>{taka(total)}</dd>
                </div>
              </dl>
            </section>

            <section className="cart-card">
              <header>
                <span>
                  <TagIcon />
                </span>
                <div>
                  <h2>Discounts</h2>
                  <p>Add discount codes</p>
                </div>
              </header>
              <div className="cart-code">
                <input
                  value={couponCode}
                  placeholder="Coupon code"
                  aria-label="Coupon code"
                  onChange={(event) => {
                    setCouponCode(event.target.value);
                    setDiscountMinor(0);
                    setCouponMessage(null);
                    sessionStorage.removeItem(COUPON_KEY);
                  }}
                />
                <button type="button" disabled={quoting || !couponCode.trim()} onClick={() => void applyCoupon()}>
                  Apply
                </button>
              </div>
              <div className="cart-code">
                <input
                  value={voucherCode}
                  placeholder="Voucher code"
                  aria-label="Voucher code"
                  onChange={(event) => {
                    setVoucherCode(event.target.value);
                    setVoucherMessage(null);
                  }}
                />
                <button type="button" disabled={!voucherCode.trim()} onClick={applyVoucher}>
                  Apply
                </button>
              </div>
              {couponMessage ? <p className="cart-loading">{couponMessage}</p> : null}
              {voucherMessage ? <p className="cart-loading">{voucherMessage}</p> : null}
            </section>

            <section className="cart-card">
              <header>
                <span>
                  <CardIcon />
                </span>
                <div>
                  <h2>Checkout</h2>
                  <p>Choose payment and continue</p>
                </div>
              </header>
              <Link className="cart-proceed" href="/checkout">
                Proceed to checkout
              </Link>
            </section>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

function taka(minor: number) {
  const major = minor / 100;
  const text = Number.isInteger(major) ? String(major) : major.toFixed(2);
  return (
    <>
      {text}
      <span className="home-card-taka">৳</span>
    </>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M5 7h14l-1.2 9.2a1.6 1.6 0 0 1-1.6 1.3H7.8a1.6 1.6 0 0 1-1.6-1.3L5 7Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.5 7V6a3.5 3.5 0 0 1 7 0v1" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M7 4.5h10v15l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2V4.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9.5 9h5M9.5 12.5h5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4.5 12.5 12 5h6.5v6.5l-7.5 7.5L4.5 12.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="15.2" cy="8.8" r="1" fill="currentColor" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M13 3.5 6.5 13H12l-1 7.5 6.5-9.5H12l1-7.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6.5 8.5h11l-.8 10.2a1.5 1.5 0 0 1-1.5 1.3H8.8a1.5 1.5 0 0 1-1.5-1.3L6.5 8.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M5 8h14M9 8V5.8h6V8M8 8l.7 11h6.6L16 8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 10h18" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
