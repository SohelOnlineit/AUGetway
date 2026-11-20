"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { AccountOverview, OrderStatusPublic } from "@amarpin/types";
import { AccountShell, AccountState } from "@/components/account/AccountShell";
import { ProfilePhoto } from "@/components/account/ProfilePhoto";
import { formatPointsWorth } from "@/lib/points";

function taka(minor: number) {
  const major = minor / 100;
  const whole = Number.isInteger(major);
  const text = major.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  return (
    <>
      {text}
      <span className="home-card-taka">৳</span>
    </>
  );
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

function countOf(overview: AccountOverview, statuses: OrderStatusPublic[]) {
  return overview.orderStatusSummary
    .filter((row) => statuses.includes(row.status))
    .reduce((sum, row) => sum + row.count, 0);
}

function statusLabel(status: OrderStatusPublic) {
  if (status === "PENDING_PAYMENT") return "Pending";
  if (status === "PAID") return "Processing";
  if (status === "FULFILLED") return "Completed";
  if (status === "PARTIALLY_REFUNDED") return "Partial refund";
  if (status === "REFUNDED") return "Refunded";
  return "Cancelled";
}

function statusTone(status: OrderStatusPublic) {
  if (status === "FULFILLED") return "is-done";
  if (status === "CANCELLED" || status === "REFUNDED") return "is-muted";
  return "is-wait";
}

function accountLabel(status: string) {
  const text = status.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function DashboardScreen({ initial }: { initial: AccountOverview }) {
  const [overview, setOverview] = useState<AccountOverview | null>(initial);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyNumber(id: string, orderNumber: string) {
    try {
      await navigator.clipboard.writeText(orderNumber);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1600);
    } catch {
      setCopiedId(null);
    }
  }

  const totalOrders = overview
    ? overview.orderStatusSummary.reduce((sum, row) => sum + row.count, 0)
    : 0;
  const delivered = overview ? countOf(overview, ["FULFILLED"]) : 0;
  const welcomeName =
    overview?.profile.displayName?.trim() ||
    overview?.profile.email.split("@")[0] ||
    "there";

  return (
    <AccountShell title="My Dashboard" bare>
      <AccountState>
        {overview ? (
          <div className="cust-dash">
            <header className="cust-dash-hero">
              <ProfilePhoto
                compact
                profile={overview.profile}
                onUpdated={(profile) => setOverview({ ...overview, profile })}
              />
              <div>
                <h1>My Dashboard</h1>
                <p>
                  Welcome, {welcomeName}
                  <span> · {overview.profile.email}</span>
                </p>
              </div>
            </header>

            <div className="cust-dash-pills">
              <Link href="/products" className="cust-dash-pill">
                Store
              </Link>
              <span
                className={
                  overview.profile.emailVerified
                    ? "cust-dash-pill is-good"
                    : "cust-dash-pill is-wait"
                }
              >
                {overview.profile.emailVerified ? "Email verified" : "Email not verified"}
              </span>
              <span className="cust-dash-pill is-good">
                {overview.profile.status === "ACTIVE"
                  ? "Active Account"
                  : accountLabel(overview.profile.status)}
              </span>
            </div>

            {overview.pointsEnabled || overview.pointsBalance > 0 ? (
              <div className="cust-dash-points">
                <span className="cust-dash-points-icon" aria-hidden>
                  <svg className="cust-dash-points-star" viewBox="0 0 24 24" width="22" height="22" fill="none">
                    <path d="m12 2.5 2.4 5 5.5.8-4 3.9.9 5.5L12 15.2 7.2 17.7l.9-5.5-4-3.9 5.5-.8L12 2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <p className="cust-dash-label">Points</p>
                  <strong>{overview.pointsBalance.toLocaleString("en-US")}</strong>
                  <p>Worth {formatPointsWorth(overview.pointsBalance)} · 10 points = 1 taka</p>
                </div>
              </div>
            ) : null}

            <div className="cust-dash-stats">
              <Stat
                tone="gold"
                label="Wallet balance"
                value={taka(overview.wallet.balanceMinor)}
                meta="Top up or withdraw"
                icon="wallet"
              />
              <Stat
                tone="teal"
                label="Total orders"
                value={totalOrders.toLocaleString("en-US")}
                meta="All-time purchases"
                icon="box"
              />
              <Stat
                tone="gold"
                label="Total spent"
                value={taka(overview.totalSpentMinor ?? 0)}
                meta={
                  totalOrders > 0
                    ? `Across ${totalOrders.toLocaleString("en-US")} ${totalOrders === 1 ? "order" : "orders"}`
                    : "No purchases yet"
                }
                icon="receipt"
              />
              <Stat
                tone="green"
                label="Delivered"
                value={delivered.toLocaleString("en-US")}
                meta="Completed deliveries"
                icon="check"
              />
            </div>

            <section className="cust-dash-orders" aria-labelledby="recent-orders-title">
              <header className="cust-dash-orders-head">
                <span className="cust-dash-hero-icon" aria-hidden>
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
                <div>
                  <h2 id="recent-orders-title">Recent orders</h2>
                </div>
                <Link href="/orders" className="cust-dash-orders-all">
                  View all orders
                </Link>
              </header>

              {overview.recentOrders.length === 0 ? (
                <div className="cust-dash-empty">
                  <p>No orders yet</p>
                  <Link href="/products">Browse products</Link>
                </div>
              ) : (
                <ul className="cust-dash-order-list">
                  {overview.recentOrders.map((order) => (
                    <li key={order.id} className="cust-dash-order">
                      <span className="cust-dash-order-icon" aria-hidden>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                          <path
                            d="M6 7.5 7.2 5h9.6L18 7.5"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M5 7.5h14l-1 11.2a1 1 0 0 1-1 .8H7a1 1 0 0 1-1-.8L5 7.5Z"
                            stroke="currentColor"
                            strokeWidth="1.6"
                          />
                        </svg>
                      </span>
                      <div className="cust-dash-order-copy">
                        <p>
                          Order Number: <strong>{order.orderNumber.replace(/^UQ-/, "")}</strong>
                          <button
                            type="button"
                            className="cust-dash-copy"
                            aria-label={`Copy order ${order.orderNumber}`}
                            onClick={() => void copyNumber(order.id, order.orderNumber)}
                          >
                            {copiedId === order.id ? "Copied" : "Copy"}
                          </button>
                        </p>
                        <small>
                          {shortDate(order.createdAt)} · {order.itemCount}{" "}
                          {order.itemCount === 1 ? "item" : "items"}
                        </small>
                      </div>
                      <span className={`cust-dash-badge ${statusTone(order.status)}`}>
                        {statusLabel(order.status)}
                      </span>
                      <Link href={`/orders/${order.id}`} className="cust-dash-view">
                        View order
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </AccountState>
    </AccountShell>
  );
}

function Stat({
  tone,
  label,
  value,
  meta,
  icon,
}: {
  tone: "gold" | "teal" | "green";
  label: string;
  value: ReactNode;
  meta: string;
  icon: "wallet" | "box" | "receipt" | "check" | "pulse" | "shield" | "points";
}) {
  return (
    <div className={`cust-dash-stat is-${tone}`}>
      <span className="cust-dash-stat-icon" aria-hidden>
        <StatIcon name={icon} />
      </span>
      <div>
        <p className="cust-dash-label">{label}</p>
        <strong>{value}</strong>
        <p>{meta}</p>
      </div>
    </div>
  );
}

function StatIcon({ name }: { name: "wallet" | "box" | "receipt" | "check" | "pulse" | "shield" | "points" }) {
  if (name === "points") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="m12 3 2.2 4.6 5 .7-3.6 3.5.9 5.1L12 14.8 7.5 17l.9-5.1L4.8 8.3l5-.7L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "wallet") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 10h18" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="16.5" cy="14.5" r="1" fill="currentColor" />
      </svg>
    );
  }
  if (name === "box") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M4 8 12 4l8 4-8 4-8-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M4 8v8l8 4 8-4V8" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 12v8" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (name === "receipt") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M7 4h10v16l-2-1.2L13 20l-2-1.2L9 20l-2-1.2V4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9.5 9h5M9.5 12.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
        <path d="m8.5 12.2 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "pulse") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M3 12h4l2-4 3 8 2-4h7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
      <path d="M12 3.5 5 6.2v5.3c0 4.2 2.8 7.2 7 8.8 4.2-1.6 7-4.6 7-8.8V6.2L12 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
