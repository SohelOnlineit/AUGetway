"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { PublicOrderDetail, PublicRefundDetail } from "@amarpin/types";
import { AccountShell, AccountState } from "@/components/account/AccountShell";
import { formatPrice } from "@/lib/catalog/format";

const ELIGIBLE = new Set(["PAID", "FULFILLED", "PARTIALLY_REFUNDED"]);
const STEPS = ["Pending", "Paid", "Processing", "Delivered"] as const;

function statusLabel(order: PublicOrderDetail): string {
  if (order.status === "FULFILLED") return "Completed";
  if (order.status === "PAID" || order.status === "PARTIALLY_REFUNDED") return "Processing";
  if (order.status === "PENDING_PAYMENT") return "Pending";
  if (order.status === "CANCELLED") return "Cancelled";
  if (order.status === "REFUNDED") return "Refunded";
  return order.status;
}

function statusTone(order: PublicOrderDetail): string {
  if (order.status === "FULFILLED") return "is-green";
  if (order.status === "PAID" || order.status === "PARTIALLY_REFUNDED") return "is-brand";
  if (order.status === "PENDING_PAYMENT") return "is-amber";
  return "is-rose";
}

function trackerIndex(order: PublicOrderDetail): number {
  if (order.status === "CANCELLED" || order.status === "REFUNDED") return -1;
  if (order.status === "FULFILLED" || order.fulfillmentStatus === "COMPLETED") return 3;
  if (order.status === "PAID" || order.status === "PARTIALLY_REFUNDED") return 2;
  return 0;
}

function paymentMethod(order: PublicOrderDetail): string {
  return order.paymentMethod || (order.originChannel === "WALLET" ? "Wallet" : "—");
}

function paymentStatus(order: PublicOrderDetail): string {
  if (order.status === "PENDING_PAYMENT") return "Pending";
  if (order.status === "CANCELLED") return "Cancelled";
  if (order.status === "REFUNDED") return "Refunded";
  if (order.paidAt || order.status === "PAID" || order.status === "FULFILLED") return "Paid";
  return statusLabel(order);
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const amountId = useId();
  const reasonId = useId();
  const [order, setOrder] = useState<PublicOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [amountMinor, setAmountMinor] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function loadOrder() {
    const response = await fetch(`/api/orders/${params.id}`);
    if (response.status === 401) {
      router.replace(`/login?next=/orders/${params.id}`);
      return;
    }
    if (response.status === 404) {
      setError("Order not found");
      setLoading(false);
      return;
    }
    if (!response.ok) {
      setError("Unable to load order");
      setLoading(false);
      return;
    }
    const data = (await response.json()) as PublicOrderDetail;
    setOrder(data);
    if (!amountMinor && data.refundSummary.refundableMinor > 0) {
      setAmountMinor(String(data.refundSummary.refundableMinor));
    }
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadOrder();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on id only
  }, [params.id, router]);

  async function requestRefund(event: FormEvent) {
    event.preventDefault();
    if (!order) return;
    const amount = Number.parseInt(amountMinor, 10);
    if (!Number.isInteger(amount) || amount < 1) {
      setFormError("Enter a valid amount in minor units");
      return;
    }
    if (reason.trim().length < 8) {
      setFormError("Reason must be at least 8 characters");
      return;
    }
    setPending(true);
    setFormError(null);
    const response = await fetch("/api/refunds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orderId: order.id,
        amountMinor: amount,
        reason: reason.trim(),
        idempotencyKey: `web-${order.id}-${amount}-${reason.trim().slice(0, 24)}`,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
      id?: string;
    };
    setPending(false);
    if (!response.ok) {
      const message = Array.isArray(payload.message)
        ? payload.message.join(", ")
        : payload.message || "Refund request failed";
      setFormError(message);
      return;
    }
    const created = payload as PublicRefundDetail;
    setReason("");
    await loadOrder();
    router.push(`/refunds/${created.id}`);
  }

  async function copyText(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600);
    } catch {
      /* ignore */
    }
  }

  const canRequest =
    order &&
    ELIGIBLE.has(order.status) &&
    order.refundSummary.refundableMinor > 0 &&
    !order.refundSummary.fullyRefunded;

  const cancelled = order?.status === "CANCELLED" || order?.status === "REFUNDED";
  const activeIdx = order ? trackerIndex(order) : -1;
  const itemCount = order?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return (
    <AccountShell title="Order status" bare>
      <AccountState loading={loading} error={error}>
        {order ? (
          <div className="order-page">
            {cancelled ? (
              <div className="order-pro-alert">
                This order was {statusLabel(order).toLowerCase()}. Contact support if you need help.
              </div>
            ) : null}

            <div className="order-pro-body">
              <div className="order-pro-main">
                <header className="order-pro-card order-pro-header">
                  <div className="order-pro-title-row">
                    <h1>Order No: {order.orderNumber.replace(/^UQ-/i, "")}</h1>
                    <button
                      type="button"
                      className={`order-pro-copy${copied === "order" ? " is-copied" : ""}`}
                      aria-label={copied === "order" ? "Copied" : `Copy order number ${order.orderNumber.replace(/^UQ-/i, "")}`}
                      onClick={() => void copyText(order.orderNumber.replace(/^UQ-/i, ""), "order")}
                    >
                      {copied === "order" ? "Copied" : "Copy"}
                    </button>
                    <span className={`order-pro-status ${statusTone(order)}`}>{statusLabel(order)}</span>
                  </div>
                  <p className="order-pro-meta">
                    Placed {formatBangladeshDateTime(order.createdAt)}
                    <span aria-hidden> · </span>
                    {itemCount} {itemCount === 1 ? "item" : "items"}
                  </p>
                </header>

                {cancelled ? null : (
                  <section className="order-pro-card order-pro-tracking" aria-label="Delivery tracking">
                    <header className="order-pro-section-head">
                      <span className="order-pro-icon" aria-hidden>
                        <TruckIcon />
                      </span>
                      <div>
                        <h2>Delivery tracking</h2>
                        <p>Follow your order from payment to delivery</p>
                      </div>
                    </header>
                    <div className="order-pro-steps">
                      {STEPS.map((label, index) => {
                        const done = activeIdx >= 0 && index < activeIdx;
                        const active = index === activeIdx;
                        return (
                          <span key={label} className="order-pro-step-wrap">
                            {index > 0 ? (
                              <span className={`order-pro-step-line${done || active ? " is-on" : ""}`} aria-hidden />
                            ) : null}
                            <span className={`order-pro-step${done ? " is-done" : ""}${active ? " is-active" : ""}`}>
                              <span className="order-pro-step-dot">{done || active ? "✓" : index + 1}</span>
                              <span>{label}</span>
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </section>
                )}

                <section className="order-pro-card">
                  <header className="order-pro-section-head">
                    <span className="order-pro-icon is-gold" aria-hidden>
                      <BoxIcon />
                    </span>
                    <div>
                      <h2>Order items</h2>
                      <p>
                        {order.items.length} {order.items.length === 1 ? "product" : "products"} · delivery codes and details
                      </p>
                    </div>
                  </header>
                  <div className="order-pro-items">
                    {order.items.map((item) => {
                      const codes = order.deliveries.filter((delivery) => delivery.orderItemId === item.id);
                      return (
                        <article key={item.id} className="order-pro-item">
                          <div className="order-pro-item-top">
                            <div>
                              <strong>{item.titleSnapshot}</strong>
                              <p>
                                {item.quantity} × {formatPrice(item.unitPriceMinor, order.currency)}
                              </p>
                              {(item.customerInputs ?? []).length ? (
                                <dl className="order-item-answers">
                                  {item.customerInputs.map((input, index) => (
                                    <div key={`${item.id}-${index}`}>
                                      <dt>{input.label}</dt>
                                      <dd>{input.value}</dd>
                                    </div>
                                  ))}
                                </dl>
                              ) : null}
                            </div>
                            <strong>{formatPrice(item.lineTotalMinor, order.currency)}</strong>
                          </div>
                          {codes.length ? (
                            <ul className="order-pro-codes">
                              {codes.map((delivery) => (
                                <li key={delivery.id} className="order-delivery-card">
                                  <div>
                                    <strong>{delivery.packageName || delivery.titleSnapshot}</strong>
                                    <p>Region: <b>{delivery.region || "—"}</b></p>
                                    <p>Redeem Code: <code>{delivery.code}</code></p>
                                  </div>
                                  <button
                                    type="button"
                                    className="order-pro-copy"
                                    onClick={() => void copyText(delivery.code, delivery.id)}
                                  >
                                    {copied === delivery.id ? "Copied" : "Copy"}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                  {order.status === "PAID" && order.deliveries.length === 0 ? (
                    <p className="order-pro-note">Payment received. Your gift card will appear here when it is delivered.</p>
                  ) : null}
                  {order.status === "CANCELLED" || order.status === "PENDING_PAYMENT" ? (
                    <p className="order-pro-note">Codes are not revealed for pending, unpaid, or cancelled orders.</p>
                  ) : null}
                </section>

                {order.status === "PENDING_PAYMENT" ? (
                  <section className="order-pro-card order-pro-pay">
                    <div>
                      <h2>Awaiting payment</h2>
                      <p>Complete payment to start delivery.</p>
                      <p className="order-pro-note">
                        Reservation expires {formatBangladeshDateTime(order.reservationExpiresAt)}
                      </p>
                    </div>
                    <Link className="primary-btn" href={`/checkout/pay/${order.id}`}>
                      Pay now
                    </Link>
                  </section>
                ) : null}

                {order.refunds.length > 0 ? (
                  <section className="order-pro-card">
                    <header className="order-pro-section-head">
                      <span className="order-pro-icon" aria-hidden>
                        <ReceiptIcon />
                      </span>
                      <div>
                        <h2>Refunds</h2>
                        <p>Requests on this order</p>
                      </div>
                    </header>
                    <div className="order-pro-items">
                      {order.refunds.map((refund) => (
                        <Link key={refund.id} href={`/refunds/${refund.id}`} className="order-pro-item">
                          <div className="order-pro-item-top">
                            <div>
                              <strong>{refund.status}</strong>
                              <p>{refund.reason}</p>
                            </div>
                            <strong>{formatPrice(refund.amountMinor, refund.currency)}</strong>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}

                {canRequest ? (
                  <form className="order-pro-card" onSubmit={(event) => void requestRefund(event)}>
                    <header className="order-pro-section-head">
                      <span className="order-pro-icon" aria-hidden>
                        <ReceiptIcon />
                      </span>
                      <div>
                        <h2>Request refund</h2>
                        <p>
                          Amount in minor units (paisa). Max refundable{" "}
                          {formatPrice(order.refundSummary.refundableMinor, order.currency)}.
                        </p>
                      </div>
                    </header>
                    {formError ? <p className="form-error">{formError}</p> : null}
                    <label htmlFor={amountId}>
                      Amount (minor)
                      <input
                        id={amountId}
                        type="number"
                        min={1}
                        max={order.refundSummary.refundableMinor}
                        value={amountMinor}
                        onChange={(event) => setAmountMinor(event.target.value)}
                        required
                      />
                    </label>
                    <label htmlFor={reasonId}>
                      Reason
                      <textarea
                        id={reasonId}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={3}
                        minLength={8}
                        required
                      />
                    </label>
                    <button type="submit" className="primary-btn" disabled={pending}>
                      {pending ? "Submitting…" : "Submit refund request"}
                    </button>
                  </form>
                ) : null}
              </div>

              <aside className="order-pro-aside">
                <section className="order-pro-card">
                  <header className="order-pro-section-head">
                    <span className="order-pro-icon" aria-hidden>
                      <ReceiptIcon />
                    </span>
                    <div>
                      <h2>Payment information</h2>
                      <p>
                        {paymentMethod(order)} · {paymentStatus(order)}
                      </p>
                    </div>
                  </header>
                  <ul className="order-pro-pay-list">
                    <li>
                      <span>Payment method</span>
                      <strong>{paymentMethod(order)}</strong>
                    </li>
                    <li>
                      <span>Payment status</span>
                      <strong>{paymentStatus(order)}</strong>
                    </li>
                    {order.transactionId ? (
                      <li>
                        <span>Transaction ID</span>
                        <strong>{order.transactionId}</strong>
                      </li>
                    ) : null}
                    {order.paidAt ? (
                      <li>
                        <span>Paid on</span>
                        <strong>{formatBangladeshDateTime(order.paidAt)}</strong>
                      </li>
                    ) : null}
                    <li>
                      <span>Subtotal</span>
                      <strong>{formatPrice(order.subtotalMinor, order.currency)}</strong>
                    </li>
                    {order.discountMinor > 0 ? (
                      <li>
                        <span>Coupon {order.couponCode ?? ""}</span>
                        <strong className="is-discount">−{formatPrice(order.discountMinor, order.currency)}</strong>
                      </li>
                    ) : null}
                    {order.refundSummary.refundedMinor > 0 ? (
                      <li>
                        <span>Refunded</span>
                        <strong>{formatPrice(order.refundSummary.refundedMinor, order.currency)}</strong>
                      </li>
                    ) : null}
                    <li className="is-total">
                      <span>Total</span>
                      <strong>{formatPrice(order.totalMinor, order.currency)}</strong>
                    </li>
                  </ul>
                </section>

                <section className="order-pro-card">
                  <header className="order-pro-section-head">
                    <span className="order-pro-icon" aria-hidden>
                      <FileIcon />
                    </span>
                    <div>
                      <h2>Activity timeline</h2>
                      <p>Order history</p>
                    </div>
                  </header>
                  <ol className="order-pro-timeline">
                    {order.fulfilledAt ? (
                      <li>
                        <span>Delivered</span>
                        <time>{formatBangladeshDateTime(order.fulfilledAt)}</time>
                      </li>
                    ) : null}
                    {order.paidAt ? (
                      <li>
                        <span>Payment received</span>
                        <time>{formatBangladeshDateTime(order.paidAt)}</time>
                      </li>
                    ) : null}
                    <li>
                      <span>Order placed</span>
                      <time>{formatBangladeshDateTime(order.createdAt)}</time>
                    </li>
                  </ol>
                </section>

                <p className="order-pro-links">
                  <Link href="/orders">All orders</Link>
                  <Link href="/refunds">Refunds</Link>
                  <Link href="/products">Continue shopping</Link>
                </p>
              </aside>
            </div>
          </div>
        ) : null}
      </AccountState>
    </AccountShell>
  );
}

function TruckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M3 8l9-5 9 5-9 5-9-5zm0 0v8l9 5 9-5V8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M7 3h10v18l-2-1.4L13 21l-2-1.4L9 21l-2-1.4L5 21V3h2zm2 5h6M9 12h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 17h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
