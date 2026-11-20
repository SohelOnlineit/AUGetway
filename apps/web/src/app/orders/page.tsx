"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicOrderDetail, PublicOrderSummary } from "@amarpin/types";
import { AccountShell, AccountState } from "@/components/account/AccountShell";
import { formatPrice } from "@/lib/catalog/format";

function statusLabel(order: PublicOrderSummary): string {
  if (order.status === "FULFILLED") return "Completed";
  if (order.status === "PAID" || order.status === "PARTIALLY_REFUNDED") return "Processing";
  if (order.status === "PENDING_PAYMENT") return "Pending";
  if (order.status === "CANCELLED") return "Cancelled";
  if (order.status === "REFUNDED") return "Refunded";
  return order.status;
}

function statusTone(order: PublicOrderSummary): string {
  if (order.status === "FULFILLED") return "is-done";
  if (order.status === "PAID" || order.status === "PARTIALLY_REFUNDED") return "is-work";
  if (order.status === "PENDING_PAYMENT") return "is-wait";
  return "is-muted";
}

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function displayNumber(orderNumber: string) {
  return orderNumber.replace(/^UQ-/, "");
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<PublicOrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/orders");
      if (cancelled) return;
      if (response.status === 401) {
        router.replace("/login?next=/orders");
        return;
      }
      if (!response.ok) {
        setError("Unable to load orders");
        setLoading(false);
        return;
      }
      setOrders((await response.json()) as PublicOrderSummary[]);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <AccountShell title="My Order history" bare>
      <div className="my-orders">
        <header className="hist-head">
          <span className="hist-head-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
              <path
                d="M7 3.5h7.5L19 8v12.5H7V3.5Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path d="M14 3.8V8h4.2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10 12h6M10 15.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <h1>My Order history</h1>
          <Link href="/dashboard" className="hist-back">
            ← Dashboard
          </Link>
        </header>
        <AccountState loading={loading} error={error}>
          {orders && orders.length === 0 ? (
            <div className="hist-empty">
              <p>No orders yet.</p>
              <Link href="/products">Browse products</Link>
            </div>
          ) : null}
          {orders && orders.length > 0 ? (
            <div className="hist-list">
              {orders.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </div>
          ) : null}
        </AccountState>
      </div>
    </AccountShell>
  );
}

function OrderRow({ order }: { order: PublicOrderSummary }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [detail, setDetail] = useState<PublicOrderDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const wallet = order.originChannel === "WALLET";

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(order.orderNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || detail || detailLoading) return;
    setDetailLoading(true);
    setDetailError(null);
    const response = await fetch(`/api/orders/${order.id}`);
    if (!response.ok) {
      setDetailError("Couldn't load this order.");
      setDetailLoading(false);
      return;
    }
    setDetail((await response.json()) as PublicOrderDetail);
    setDetailLoading(false);
  }

  return (
    <article className={`hist-row ${open ? "is-open" : ""}`}>
      <div className="hist-row-main">
        <span className={`hist-mark ${wallet ? "is-wallet" : ""}`} aria-hidden>
          {wallet ? <BoltIcon /> : <BagIcon />}
        </span>
        <div className="hist-copy">
          <p>
            Order Number: <strong>{displayNumber(order.orderNumber)}</strong>
            <button
              type="button"
              className="hist-copy-btn"
              aria-label={copied ? "Copied" : `Copy order ${order.orderNumber}`}
              onClick={() => void copyNumber()}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
            <span className={`hist-badge ${statusTone(order)}`}>{statusLabel(order)}</span>
          </p>
          <small>
            {shortDate(order.createdAt)} · {order.itemCount}{" "}
            {order.itemCount === 1 ? "item" : "items"}
          </small>
        </div>
        <div className="hist-actions">
          <button
            type="button"
            className={`hist-expand ${open ? "is-open" : ""}`}
            aria-expanded={open}
            aria-label={open ? "Hide order details" : "Show order details"}
            onClick={() => void toggle()}
          >
            <ChevronIcon />
          </button>
          <Link href={`/orders/${order.id}`} className="hist-view">
            <EyeIcon />
            <span>View order</span>
          </Link>
        </div>
      </div>
      {open ? (
        <div className="hist-detail">
          {detailLoading ? <p>Loading…</p> : null}
          {detailError ? <p>{detailError}</p> : null}
          {detail ? (
            <>
              <ul>
                {detail.items.map((item) => (
                  <li key={item.id}>
                    <span>
                      {item.titleSnapshot}
                      <small> × {item.quantity}</small>
                    </span>
                    <strong>{formatPrice(item.lineTotalMinor, detail.currency)}</strong>
                  </li>
                ))}
              </ul>
              <footer>
                <span>Order total</span>
                <strong>{formatPrice(detail.totalMinor, detail.currency)}</strong>
              </footer>
              {detail.paymentMethod || detail.transactionId ? (
                <footer>
                  <span>{detail.paymentMethod ?? "Payment"}</span>
                  <strong>{detail.transactionId ?? "Paid"}</strong>
                </footer>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
      <path d="M6 7.5 7.2 5h9.6L18 7.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M5 7.5h14l-1 11.2a1 1 0 0 1-1 .8H7a1 1 0 0 1-1-.8L5 7.5Z" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
      <path d="M13 3 6 13h5l-1 8 8-11h-5l0-7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
      <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 16H5.5A1.5 1.5 0 0 1 4 14.5v-9A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
      <path d="m5 12.5 4.2 4.2L19 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
