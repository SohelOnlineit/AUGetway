"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { PublicOrderDetail, PublicPaymentIntent } from "@amarpin/types";
import { formatPrice } from "@/lib/catalog/format";

export default function PayOrderPage() {
  const params = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const invoiceId = searchParams.get("invoice_id") || searchParams.get("invoiceId");
  const returnedMethod = searchParams.get("payment_method") || searchParams.get("paymentMethod");
  const returnedTransaction =
    searchParams.get("transaction_id") || searchParams.get("transactionId") || searchParams.get("trx_id");
  const returnedPaid = searchParams.get("status") === "SUCCESS" || Boolean(invoiceId);
  const returnQuery = searchParams.toString();
  const idempotencyKey = useMemo(() => `pay-${params.orderId}`, [params.orderId]);
  const [order, setOrder] = useState<PublicOrderDetail | null>(null);
  const [intent, setIntent] = useState<PublicPaymentIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function openReceipt(orderNumber?: string) {
    const profile = await fetch("/api/account/profile");
    if (profile.ok) {
      router.replace(`/orders/${params.orderId}`);
      return;
    }
    const query = orderNumber ? `?order=${encodeURIComponent(orderNumber)}` : "";
    router.replace(`/order/thank-you${query}`);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const orderRes = await fetch(`/api/orders/${params.orderId}`);
      if (cancelled) return;
      if (orderRes.status === 401) {
        const next = `/checkout/pay/${params.orderId}${returnQuery ? `?${returnQuery}` : ""}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if (!orderRes.ok) {
        setError("Unable to load order for payment");
        return;
      }
      const orderPayload = (await orderRes.json()) as PublicOrderDetail;
      setOrder(orderPayload);

      if (invoiceId || returnedTransaction) {
        await fetch("/api/payments/uddoktapay/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            orderId: params.orderId,
            ...(invoiceId ? { invoiceId } : {}),
            ...(returnedMethod ? { paymentMethod: returnedMethod } : {}),
            ...(returnedTransaction ? { transactionId: returnedTransaction } : {}),
          }),
        });
      }
      if (orderPayload.status === "PAID" || orderPayload.status === "FULFILLED") {
        void openReceipt(orderPayload.orderNumber);
        return;
      }
      if (orderPayload.status !== "PENDING_PAYMENT") {
        setError(`This order cannot be paid while it is ${statusLabel(orderPayload.status)}.`);
        return;
      }

      const intentRes = await fetch("/api/payments/intents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId: params.orderId,
          idempotencyKey,
        }),
      });
      if (cancelled) return;
      if (!intentRes.ok) {
        const payload = (await intentRes.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const msg = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
        setError(msg || "Unable to start payment");
        return;
      }
      const created = (await intentRes.json()) as PublicPaymentIntent;
      if (created.provider === "UDDOKTAPAY") {
        const verifyRes = await fetch("/api/payments/uddoktapay/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            orderId: params.orderId,
            ...(invoiceId ? { invoiceId } : {}),
          }),
        });
        if (cancelled) return;
        if (verifyRes.ok) {
          const verified = (await verifyRes.json()) as PublicPaymentIntent;
          setIntent(verified);
          if (verified.status === "SUCCEEDED") {
            void openReceipt(orderPayload.orderNumber);
            return;
          }
          if (
            verified.checkoutUrl &&
            verified.status === "REQUIRES_CONFIRMATION" &&
            !returnedPaid
          ) {
            window.location.assign(verified.checkoutUrl);
          }
          return;
        }
      }
      setIntent(created);
      if (
        created.provider === "UDDOKTAPAY" &&
        created.checkoutUrl &&
        created.status === "REQUIRES_CONFIRMATION" &&
        !returnedPaid
      ) {
        window.location.assign(created.checkoutUrl);
        return;
      }
      if (created.provider === "UDDOKTAPAY" && !created.checkoutUrl && !invoiceId) {
        setError("The payment gateway did not return a checkout link. Try again from this page.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [idempotencyKey, invoiceId, params.orderId, returnQuery, returnedMethod, returnedPaid, returnedTransaction, router]);

  async function simulate(outcome: "success" | "failure") {
    if (!intent) return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/payments/sandbox/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paymentIntentId: intent.id,
        outcome,
      }),
    });
    setPending(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string | string[];
      } | null;
      const msg = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
      setError(msg || "Payment confirmation failed");
      return;
    }
    const next = (await response.json()) as PublicPaymentIntent;
    setIntent(next);
    if (next.status === "SUCCEEDED") {
      void openReceipt(order?.orderNumber);
    }
  }

  const openingGateway =
    !invoiceId &&
    intent?.provider === "UDDOKTAPAY" &&
    Boolean(intent.checkoutUrl) &&
    intent.status === "REQUIRES_CONFIRMATION";
  const sandbox = intent?.sandboxMode !== false && intent?.provider !== "UDDOKTAPAY";
  const gatewayName = intent?.provider === "UDDOKTAPAY" ? "bKash / Nagad / Rocket" : "Wallet";
  const itemCount = order?.items.reduce((sum, item) => sum + item.quantity, 0) ?? order?.itemCount ?? 0;

  return (
    <main className="checkout-page">
      <div className="checkout-topbar">
        <h1>
          <span>
            <CardIcon />
          </span>
          Pay order
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
          <span className="is-done">
            <b>
              <CheckIcon />
            </b>
            Checkout
          </span>
          <i />
          <span className="is-current">
            <b>3</b>
            Payment
          </span>
        </nav>
        <i />
        <Link href="/orders">
          <ArrowIcon />
          My orders
        </Link>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="checkout-grid">
        <div className="checkout-main">
          <section className="checkout-card checkout-summary">
            <header>
              <span>
                <BagIcon />
              </span>
              <div>
                <h2>Your order</h2>
                <p>{order ? order.orderNumber : "Loading your order…"}</p>
              </div>
              {order ? (
                <em>
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </em>
              ) : null}
            </header>
            {order?.items.map((item) => (
              <article key={item.id}>
                <div className="checkout-product">
                  <span>
                    <BagIcon />
                  </span>
                  <strong>
                    {item.titleSnapshot}
                    {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                  </strong>
                </div>
                <div className="checkout-amount">
                  <span>Amount</span>
                  <strong>{formatPrice(item.lineTotalMinor, order.currency)}</strong>
                </div>
              </article>
            ))}
            {!order ? <p className="checkout-loading">Preparing your payment…</p> : null}
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
            <ul>
              <li>
                <LockIcon /> Payment is confirmed by the gateway, not this page
              </li>
              <li>
                <MailIcon /> Codes are sent to your email after payment
              </li>
              <li>
                <BoltIcon /> Digital delivery starts as soon as payment is verified
              </li>
            </ul>
          </section>
        </div>

        <aside className="checkout-side">
          <section className="checkout-card checkout-summary">
            <header>
              <span>
                <CardIcon />
              </span>
              <div>
                <h2>Payment</h2>
                <p>{openingGateway ? "Opening the payment page…" : statusLabel(intent?.status ?? order?.status)}</p>
              </div>
            </header>
            <div className="checkout-pay-option is-on" aria-current="true">
              <span>
                <CardIcon />
              </span>
              <strong>{gatewayName}</strong>
              {sandbox ? <small>Test payment</small> : null}
              <em>Selected</em>
              {intent?.provider === "UDDOKTAPAY" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="checkout-pay-logos"
                  src="/images/checkout-payment-gateways.png"
                  alt="bKash, Nagad, Rocket, Upay, and bank transfer"
                />
              ) : null}
            </div>
            {order ? (
              <dl>
                <div>
                  <dt>Subtotal</dt>
                  <dd>{formatPrice(order.subtotalMinor, order.currency)}</dd>
                </div>
                {order.discountMinor > 0 ? (
                  <div className="is-discount">
                    <dt>Coupon{order.couponCode ? ` ${order.couponCode}` : ""}</dt>
                    <dd>−{formatPrice(order.discountMinor, order.currency)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Delivery</dt>
                  <dd className="is-free">Instant · Free</dd>
                </div>
                <div className="is-total">
                  <dt>Total amount</dt>
                  <dd>{formatPrice(order.totalMinor, order.currency)}</dd>
                </div>
              </dl>
            ) : null}
            {intent ? (
              <p className="checkout-hint">Pay before {formatBangladeshDateTime(intent.expiresAt)}.</p>
            ) : null}
            {intent?.checkoutUrl && intent.status === "REQUIRES_CONFIRMATION" && !returnedPaid ? (
              <button
                type="button"
                className="checkout-pay"
                onClick={() => {
                  if (intent.checkoutUrl) window.location.assign(intent.checkoutUrl);
                }}
              >
                <BoltIcon />
                {openingGateway ? "Opening gateway…" : `Pay ${order ? formatPrice(order.totalMinor, order.currency) : ""}`}
                <ArrowRightIcon />
              </button>
            ) : null}
            {intent?.sandboxMode && intent.status === "REQUIRES_CONFIRMATION" ? (
              <div className="sms-actions">
                <button type="button" className="checkout-pay" disabled={pending} onClick={() => void simulate("success")}>
                  <BoltIcon />
                  {pending ? "Confirming…" : "Simulate successful payment"}
                </button>
                <button type="button" className="sms-quiet" disabled={pending} onClick={() => void simulate("failure")}>
                  Simulate failure
                </button>
              </div>
            ) : null}
            {intent?.status === "FAILED" ? (
              <p className="form-error">Payment did not go through. You can try again from this order.</p>
            ) : null}
            <p className="checkout-hint">
              <Link href={`/orders/${params.orderId}`}>Order details</Link>
              {" · "}
              <Link href="/orders">All orders</Link>
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function statusLabel(status: string | undefined) {
  switch (status) {
    case "PENDING_PAYMENT":
    case "REQUIRES_CONFIRMATION":
      return "Waiting for payment";
    case "PAID":
    case "SUCCEEDED":
      return "Paid";
    case "FAILED":
      return "Payment failed";
    case "FULFILLED":
      return "Delivered";
    default:
      return status ? status.replaceAll("_", " ").toLowerCase() : "Waiting for payment";
  }
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

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M13 3.5 6.5 13H12l-1 7.5 6.5-9.5H12l1-7.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
