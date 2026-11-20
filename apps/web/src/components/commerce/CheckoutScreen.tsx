"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { PublicCart, PublicOrderDetail, PublicPaymentIntent, PublicProfile, PublicWallet } from "@amarpin/types";
import { trackStorefrontEvent } from "@/lib/analytics/client";
import { readTrafficOrigin } from "@/components/storefront/TrafficOrigin";
import { publishCartCount } from "@/lib/cart-count";

export function CheckoutScreen({
  initialCart,
  initialProfile,
  initialWallet,
}: {
  initialCart: PublicCart;
  initialProfile: PublicProfile | null;
  initialWallet: PublicWallet | null;
}) {
  const router = useRouter();
  const [cart, setCart] = useState<PublicCart | null>(initialCart);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [fullName, setFullName] = useState(initialProfile?.displayName?.trim() ?? "");
  const [mobile, setMobile] = useState(initialProfile?.phone?.trim() ?? "");
  const [email, setEmail] = useState(initialProfile?.email ?? "");
  const [note, setNote] = useState("");
  const [contactError, setContactError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [discountMinor, setDiscountMinor] = useState(0);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [wallet, setWallet] = useState<PublicWallet | null>(initialWallet);
  const [signedIn, setSignedIn] = useState(initialProfile != null);
  const [method, setMethod] = useState<"wallet" | "gateway">("gateway");
  const idempotencyKey = useMemo(() => createIdempotencyKey(), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [cartResponse, profileResponse, walletResponse] = await Promise.all([
        fetch("/api/cart"),
        fetch("/api/account/profile"),
        fetch("/api/wallet"),
      ]);
      if (cancelled) return;
      if (cartResponse.status === 401 || cartResponse.status === 403) {
        router.replace("/login?next=/checkout");
        return;
      }
      if (!cartResponse.ok) {
        setError("Unable to load cart for checkout");
        return;
      }
      const nextCart = (await cartResponse.json()) as PublicCart;
      setCart(nextCart);
      publishCartCount(nextCart.itemCount);
      if (profileResponse.ok) {
        setSignedIn(true);
        const profile = (await profileResponse.json()) as PublicProfile;
        setFullName(profile.displayName?.trim() ?? "");
        setMobile(profile.phone?.trim() ?? "");
        setEmail(profile.email ?? "");
      }
      if (walletResponse.ok) {
        setWallet((await walletResponse.json()) as PublicWallet);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    const saved = sessionStorage.getItem("uq_cart_coupon");
    if (!saved) return;
    setCouponCode(saved);
    void (async () => {
      const response = await fetch("/api/checkout/coupon-quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: saved }),
      });
      const payload = (await response.json().catch(() => ({}))) as { discountMinor?: number };
      if (!response.ok) return;
      setDiscountMinor(payload.discountMinor ?? 0);
      setCouponMessage("Coupon applied");
    })();
  }, []);

  const itemCount = cart?.itemCount ?? 0;
  const totalMinor = Math.max(0, (cart?.subtotalMinor ?? 0) - discountMinor);
  const walletBalance = wallet?.balanceMinor ?? 0;
  const balanceAfterPay = Math.max(0, walletBalance - totalMinor);
  const insufficientWallet = method === "wallet" && walletBalance < totalMinor;

  async function updateQuantity(itemId: string, quantity: number) {
    setBusyItem(itemId);
    setError(null);
    const response =
      quantity < 1
        ? await fetch(`/api/cart/items/${itemId}`, { method: "DELETE" })
        : await fetch(`/api/cart/items/${itemId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ quantity }),
          });
    setBusyItem(null);
    if (response.status === 401 || response.status === 403) {
      router.replace("/login?next=/checkout");
      return;
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
      const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
      setError(message || "Could not update the cart");
      return;
    }
    const nextCart = (await response.json()) as PublicCart;
    setCart(nextCart);
    publishCartCount(nextCart.itemCount);
  }

  async function checkCoupon() {
    setCouponMessage(null);
    const response = await fetch("/api/checkout/coupon-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: couponCode.trim() }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
      discountMinor?: number;
    };
    if (!response.ok) {
      setDiscountMinor(0);
      const message = Array.isArray(payload.message) ? payload.message.join(", ") : payload.message;
      setCouponMessage(message || "Coupon is not valid");
      return;
    }
    setDiscountMinor(payload.discountMinor ?? 0);
    setCouponMessage("Coupon applied");
  }

  async function placeOrder() {
    const name = fullName.trim();
    const phone = mobile.trim();
    const mail = email.trim();
    if (!name || !phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setContactError("Please fill in full name, mobile number, and email address before payment.");
      document.getElementById("checkout-contact")?.scrollIntoView({ block: "center" });
      return;
    }
    setContactError(null);
    setPending(true);
    setError(null);
    trackStorefrontEvent({ name: "checkout_start", path: "/checkout" });
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey,
        couponCode: couponCode.trim() || undefined,
        paymentMethod: method,
        originSource: readTrafficOrigin(),
        contactName: name,
        contactPhone: phone,
        contactEmail: mail,
      }),
    });
    setPending(false);
    if (response.status === 401 || response.status === 403) {
      router.replace("/login?next=/checkout");
      return;
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
      const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
      setError(message || "Checkout failed");
      return;
    }
    const order = (await response.json()) as PublicOrderDetail;
    if (order.status === "PAID" || order.status === "FULFILLED") {
      setPending(false);
      if (signedIn) router.replace(`/orders/${order.id}`);
      else {
        router.replace(
          `/order/thank-you?order=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent(mail)}`,
        );
      }
      return;
    }
    if (method === "gateway") {
      const intentRes = await fetch("/api/payments/intents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          idempotencyKey: `pay-${order.id}`,
        }),
      });
      if (!intentRes.ok) {
        const payload = (await intentRes.json().catch(() => null)) as { message?: string | string[] } | null;
        const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
        setPending(false);
        setError(message || "Unable to open the payment gateway");
        return;
      }
      const intent = (await intentRes.json()) as PublicPaymentIntent;
      if (intent.provider === "UDDOKTAPAY" && intent.checkoutUrl && intent.status === "REQUIRES_CONFIRMATION") {
        window.location.assign(intent.checkoutUrl);
        return;
      }
    }
    setPending(false);
    router.replace(`/checkout/pay/${order.id}`);
  }

  return (
    <main className="checkout-page">
      <div className="checkout-topbar">
        <h1>
          <span>
            <CardIcon />
          </span>
          Checkout
        </h1>
        <i />
        <nav aria-label="Checkout progress">
          <span className="is-done">
            <b>
              <CheckIcon />
            </b>
            Cart
          </span>
          <i />
          <span className="is-current">
            <b>2</b>
            Checkout
          </span>
          <i />
          <span>
            <b>3</b>
            Delivery
          </span>
        </nav>
        <i />
        <Link href="/cart">
          <ArrowIcon />
          Back to cart
        </Link>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {!cart ? <p className="checkout-loading">Loading checkout…</p> : null}
      {cart && cart.items.length === 0 ? (
        <section className="checkout-card">
          <h2>Your cart is empty</h2>
          <p>
            Add a product before checkout. <Link href="/cart">Back to cart</Link>
          </p>
        </section>
      ) : null}

      {cart && cart.items.length > 0 ? (
        <div className="checkout-grid">
          <div className="checkout-main">
            <section className="checkout-card" id="checkout-contact">
              <header>
                <span>
                  <UserIcon />
                </span>
                <div>
                  <h2>Contact information</h2>
                  <p>Where we send your gift card codes</p>
                </div>
              </header>
              <div className="checkout-fields">
                <label>
                  <span className="checkout-label">
                    Full name <span className="checkout-req">*</span>
                  </span>
                  <input
                    value={fullName}
                    autoComplete="name"
                    onChange={(event) => {
                      setFullName(event.target.value);
                      setContactError(null);
                    }}
                  />
                </label>
                <label>
                  <span className="checkout-label">
                    Mobile number <span className="checkout-req">*</span>
                  </span>
                  <input
                    value={mobile}
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="01XXXXXXXXX"
                    onChange={(event) => {
                      setMobile(event.target.value);
                      setContactError(null);
                    }}
                  />
                </label>
                <label className="checkout-span">
                  <span className="checkout-label">
                    Email address <span className="checkout-req">*</span>
                  </span>
                  <input
                    type="email"
                    value={email}
                    autoComplete="email"
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setContactError(null);
                    }}
                  />
                </label>
              </div>
              <p className="checkout-hint">
                {signedIn
                  ? "Gift card codes will be delivered to this email immediately after payment."
                  : "Checking out as a guest. Gift card codes will be delivered to this email after payment."}
              </p>
              {contactError ? <p className="form-error">{contactError}</p> : null}
            </section>

            <section className="checkout-card">
              <header>
                <span>
                  <NoteIcon />
                </span>
                <div>
                  <h2>Order notes</h2>
                  <p>Optional — visible on your order history</p>
                </div>
              </header>
              <label>
                Order note
                <textarea
                  rows={4}
                  maxLength={500}
                  value={note}
                  placeholder="Add any special instructions for this order…"
                  onChange={(event) => setNote(event.target.value.slice(0, 500))}
                />
              </label>
              <p className="checkout-count">{note.trim().length}/500 characters</p>
            </section>

            <section className="checkout-card checkout-secure">
              <header>
                <span>
                  <ShieldIcon />
                </span>
                <div>
                  <h2>Secure checkout</h2>
                  <p>Your order is protected</p>
                </div>
              </header>
              <p className="checkout-kicker">Buyer protection</p>
              <ul>
                <li>
                  <CheckIcon /> Secure wallet payment
                </li>
                <li>
                  <MailIcon /> Codes sent to your email instantly
                </li>
                <li>
                  <LockIcon /> Digital delivery — no refunds on delivered codes
                </li>
              </ul>
            </section>
          </div>

          <aside className="checkout-side">
            <section className="checkout-card checkout-summary">
              <header>
                <span>
                  <BagIcon />
                </span>
                <div>
                  <h2>Order summary</h2>
                  <p>
                    {cart.items.length} {cart.items.length === 1 ? "product" : "products"} in cart
                  </p>
                </div>
                <em>
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </em>
              </header>
              {cart.items.map((item) => (
                <article key={item.id}>
                  <div className="checkout-product">
                    <span>
                      {item.primaryImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.primaryImageUrl} alt="" />
                      ) : (
                        <BagIcon />
                      )}
                    </span>
                    <strong>{item.title}</strong>
                  </div>
                  <div className="checkout-package">
                    <span>
                      <TagIcon />
                      {item.packageName || item.title}
                    </span>
                    <b>{taka(item.unitPriceMinor)}</b>
                  </div>
                  <div className="checkout-amount">
                    <span>Amount</span>
                    <strong>{taka(item.lineTotalMinor)}</strong>
                  </div>
                  <div className="checkout-qty">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      disabled={busyItem === item.id}
                      onClick={() => void updateQuantity(item.id, item.quantity - 1)}
                    >
                      −
                    </button>
                    <b>{item.quantity}</b>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      disabled={busyItem === item.id || item.quantity >= Math.min(20, item.availableQuantity)}
                      onClick={() => void updateQuantity(item.id, item.quantity + 1)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="checkout-remove"
                      aria-label={`Remove ${item.title}`}
                      disabled={busyItem === item.id}
                      onClick={() => void updateQuantity(item.id, 0)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </article>
              ))}
              <dl>
                <div>
                  <dt>
                    Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"})
                  </dt>
                  <dd>{taka(cart.subtotalMinor)}</dd>
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
                  <dt>Total amount</dt>
                  <dd>{taka(totalMinor)}</dd>
                </div>
              </dl>
            </section>

            <section className="checkout-card">
              <header>
                <span>
                  <WalletIcon />
                </span>
                <div>
                  <h2>Payment method</h2>
                  <p>Choose Your Payment Method</p>
                </div>
              </header>
              {signedIn ? (
              <button
                type="button"
                className={`checkout-pay-option${method === "wallet" ? " is-on" : ""}`}
                aria-pressed={method === "wallet"}
                onClick={() => setMethod("wallet")}
              >
                <span className="checkout-wallet-mark">
                  <WalletBalanceIcon />
                </span>
                <strong>Wallet Balance</strong>
                <small className="checkout-pay-balance">
                  <span>
                    <span>Your balance</span>
                    <b>{wallet ? taka(walletBalance) : "…"}</b>
                  </span>
                  {wallet && !insufficientWallet ? (
                    <span>
                      <span>Balance after payment</span>
                      <b>{taka(balanceAfterPay)}</b>
                    </span>
                  ) : null}
                </small>
                {method === "wallet" ? <em>Selected</em> : null}
              </button>
              ) : null}
              <button
                type="button"
                className={`checkout-pay-option${method === "gateway" ? " is-on" : ""}`}
                aria-pressed={method === "gateway"}
                onClick={() => setMethod("gateway")}
              >
                <strong>bKash / Nagad / Rocket</strong>
                {method === "gateway" ? <em>Selected</em> : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="checkout-pay-logos"
                  src="/images/checkout-payment-gateways.png"
                  alt="bKash, Nagad, Rocket, Upay, and bank transfer"
                />
              </button>
              {insufficientWallet ? (
                <p className="checkout-balance-alert" role="alert">
                  Insufficient balance. You need {taka(totalMinor)} but have {taka(walletBalance)}.{" "}
                  <Link href="/wallet">Top up wallet</Link>
                </p>
              ) : null}
              <div className="checkout-coupon">
                <input
                  value={couponCode}
                  placeholder="Coupon code"
                  onChange={(event) => {
                    setCouponCode(event.target.value);
                    setDiscountMinor(0);
                    setCouponMessage(null);
                  }}
                />
                <button type="button" onClick={() => void checkCoupon()} disabled={!couponCode.trim()}>
                  Apply
                </button>
              </div>
              {couponMessage ? <p className="checkout-hint">{couponMessage}</p> : null}
            </section>

            <button type="button" className="checkout-pay" disabled={pending || insufficientWallet} onClick={() => void placeOrder()}>
              <BoltIcon />
              {pending ? "Placing order…" : <>Amount To Pay {taka(totalMinor)}</>}
              <ArrowRightIcon />
            </button>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 10h18" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="m6.5 12.2 3.2 3.2 7.8-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M14.5 6.5 8 12l6.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="m9.5 6.5 6.5 5.5-6.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.5 18.5c1.4-2.6 3.6-3.8 6.5-3.8s5.1 1.2 6.5 3.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6 6.5h12M6 11h8M6 15.5h5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3.5 19 6.2v5.4c0 4.2-2.8 6.8-7 8.4-4.2-1.6-7-4.2-7-8.4V6.2L12 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3.5" y="6" width="17" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m4.5 7.5 7.5 6 7.5-6" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="5.5" y="10.5" width="13" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
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

function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4.5 12.5 12 5h6.5v6.5l-7.5 7.5L4.5 12.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="15.2" cy="8.8" r="1" fill="currentColor" />
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

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3.5" y="6.5" width="17" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 10h17M15.5 14.2h2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function WalletBalanceIcon() {
  return (
    <svg className="checkout-wallet-art" viewBox="0 0 32 32" aria-hidden>
      <circle className="checkout-wallet-ring" cx="16" cy="16" r="13.1" fill="none" stroke="currentColor" strokeWidth="1.15" strokeDasharray="1.6 3.5" strokeLinecap="round" />
      <circle className="checkout-wallet-coin" cx="16" cy="16" r="8.6" />
      <image className="checkout-wallet-sign" href="/icons/bd-taka.png?v=white" x="11.15" y="9.35" width="9.7" height="13.3" />
      <path className="checkout-wallet-spark checkout-wallet-spark--a" d="M25.2 5.1l.55 1.45 1.5.5-1.5.5-.55 1.45-.5-1.45-1.45-.5 1.45-.5.5-1.45Z" />
      <path className="checkout-wallet-spark checkout-wallet-spark--b" d="M6.4 23.2l.35.95.95.35-.95.3-.35.95-.3-.95-.95-.3.95-.35.3-.95Z" />
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
