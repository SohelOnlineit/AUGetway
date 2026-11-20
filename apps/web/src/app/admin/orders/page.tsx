"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AdminOrderListPage, OrderStatusPublic } from "@amarpin/types";
import { PINNED_ORDER_ORIGINS } from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";
import { isBangladeshToday } from "@/lib/datetime";

type Tab = "" | "PENDING_PAYMENT" | "PAID" | "FULFILLED" | "CANCELLED" | "REFUNDED" | "TRASH";
type DateFilter = "" | "today" | "7" | "30";

export default function AdminOrdersPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [data, setData] = useState<AdminOrderListPage | null>(null);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<Tab>("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [dates, setDates] = useState<DateFilter>("");
  const [channel, setChannel] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const canWrite = can(permissions, "admin:orders:write");

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (tab === "TRASH") params.set("view", "trash");
      else if (tab) params.set("status", tab);
      if (query) params.set("q", query);
      if (channel) params.set("origin", channel);
      const result = await adminFetch<AdminOrderListPage>(`/orders?${params.toString()}`);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setData(result.data);
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [channel, loading, page, query, reloadToken, sessionError, tab]);

  const rows = useMemo(() => {
    return (data?.items ?? []).filter((row) => {
      if (dates === "today" && !isBangladeshToday(row.createdAt)) return false;
      if (dates === "7" && ageDays(row.createdAt) > 7) return false;
      if (dates === "30" && ageDays(row.createdAt) > 30) return false;
      return true;
    });
  }, [data, dates, tab]);

  const stats = data?.stats;
  const allChecked = rows.length > 0 && rows.every((row) => selected.includes(row.id));

  async function applyBulk() {
    if (!bulk) {
      setNotice("Choose a bulk action, then Apply.");
      return;
    }
    const picked = rows.filter((row) => selected.includes(row.id));
    if (!picked.length) {
      setNotice("Select at least one order.");
      return;
    }
    const trashAction = bulk === "TRASH" || bulk === "RESTORE";
    const targets = trashAction ? picked : picked.filter((row) => row.status !== bulk);
    if (!targets.length) {
      setNotice("Selected orders are already that status.");
      return;
    }
    let done = 0;
    for (const row of targets) {
      const result = await adminFetch(`/orders/${row.id}/actions`, {
        method: "POST",
        body: JSON.stringify(
          trashAction
            ? { action: bulk === "TRASH" ? "MOVE_TO_TRASH" : "RESTORE" }
            : { action: "SET_STATUS", status: bulk },
        ),
      });
      if (!result.ok) {
        setError(result.message);
        if (done) setNotice(`Updated ${done} order${done === 1 ? "" : "s"} before an error.`);
        setReloadToken((value) => value + 1);
        return;
      }
      done += 1;
    }
    setSelected([]);
    setBulk("");
    setNotice(
      bulk === "TRASH"
        ? `Moved ${done} order${done === 1 ? "" : "s"} to trash.`
        : bulk === "RESTORE"
          ? `Restored ${done} order${done === 1 ? "" : "s"}.`
          : `Updated ${done} order${done === 1 ? "" : "s"}.`,
    );
    setReloadToken((value) => value + 1);
  }

  return (
    <AdminShell title="Orders" permissions={permissions} bare>
      <div className="orders-page">
        {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
        {notice ? <p className="form-success">{notice}</p> : null}
        <header className="orders-head">
          <h1>
            <span>
              <BagIcon />
            </span>
            Orders
          </h1>
          <div>
            <Link href="/admin">← Dashboard</Link>
            <button type="button" onClick={() => setNotice("New orders are created from storefront checkout.")}>
              Add order
            </button>
          </div>
        </header>

        <section className="orders-filters">
          <div className="orders-filters-date-origin-apply">
            <FilterMenu
              label="Date range"
              value={dates}
              options={[
                { value: "", label: "All dates" },
                { value: "today", label: "Today" },
                { value: "7", label: "Last 7 days" },
                { value: "30", label: "Last 30 days" },
              ]}
              onChange={(value) => setDates(value as DateFilter)}
            />
            <FilterMenu
              label="Origin"
              value={channel}
              options={[
                { value: "", label: "All origins" },
                ...(data?.origins?.length ? data.origins : [...PINNED_ORDER_ORIGINS]).map((origin) => ({
                  value: origin,
                  label: origin,
                })),
              ]}
              onChange={(value) => {
                setChannel(value);
                setPage(1);
              }}
            />
            <button type="button" onClick={() => { setPage(1); setReloadToken((value) => value + 1); }}>Apply</button>
          </div>
          <div className="orders-filters-search-bulk-apply">
            <label className="orders-search-field">
              <SearchIcon />
              <input value={search} placeholder="Order number" aria-label="Search by order number" onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
            </label>
            <button type="button" className="orders-search" onClick={() => setQuery(search.trim())}>Search</button>
            <FilterMenu
              label="Bulk action"
              value={bulk}
              disabled={!canWrite}
              options={
                tab === "TRASH"
                  ? [
                      { value: "", label: "Bulk Action" },
                      { value: "RESTORE", label: "Restore" },
                    ]
                  : [
                      { value: "", label: "Bulk Action" },
                      { value: "PENDING_PAYMENT", label: "Pending" },
                      { value: "PAID", label: "Paid" },
                      { value: "FULFILLED", label: "Completed" },
                      { value: "CANCELLED", label: "Cancelled" },
                      { value: "REFUNDED", label: "Refunded" },
                      { value: "TRASH", label: "Trash" },
                    ]
              }
              onChange={setBulk}
            />
            <button type="button" disabled={!canWrite} onClick={() => void applyBulk()}>
              Apply
            </button>
          </div>
        </section>

        <div className="orders-tabs">
          <TabButton label="All" count={stats?.all ?? 0} on={tab === ""} onClick={() => { setTab(""); setPage(1); }} />
          <TabButton label="Pending" count={stats?.pending ?? 0} on={tab === "PENDING_PAYMENT"} onClick={() => { setTab("PENDING_PAYMENT"); setPage(1); }} />
          <TabButton label="Paid" count={stats?.paid ?? 0} on={tab === "PAID"} onClick={() => { setTab("PAID"); setPage(1); }} />
          <TabButton label="Completed" count={stats?.completed ?? 0} on={tab === "FULFILLED"} onClick={() => { setTab("FULFILLED"); setPage(1); }} />
          <TabButton label="Cancelled" count={stats?.cancelled ?? 0} on={tab === "CANCELLED"} onClick={() => { setTab("CANCELLED"); setPage(1); }} />
          <TabButton label="Refunded" count={stats?.refunded ?? 0} on={tab === "REFUNDED"} onClick={() => { setTab("REFUNDED"); setPage(1); }} />
          <TabButton label="Trash" count={stats?.trash ?? 0} on={tab === "TRASH"} onClick={() => { setTab("TRASH"); setPage(1); setBulk(""); }} />
        </div>

        {query && looksLikeOrderNumber(query) && data ? <PaymentInfo payment={data.payment} /> : null}

        <div className="catalog-list">
          {rows.length === 0 ? <p className="orders-empty">No orders in this view.</p> : null}
          {rows.length > 0 ? (
            <div className="orders-cols-head">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() => setSelected(allChecked ? [] : rows.map((row) => row.id))}
                aria-label="Select orders"
              />
              <span>Order</span>
              <span>Customer</span>
              <span>Date</span>
              <span>Status</span>
              <span>Total</span>
              <span>Origin</span>
            </div>
          ) : null}
          {rows.map((row) => {
            const key = pillKey(row.status);
            return (
              <article key={row.id} className={`catalog-row orders-cols orders-row--${key}`}>
                <div className="orders-card-top">
                  <input
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    onChange={() =>
                      setSelected((current) =>
                        current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id],
                      )
                    }
                    aria-label={`Select ${row.orderNumber}`}
                  />
                  <div className="orders-col-order">
                    <div className="orders-order-main">
                      {row.productImageUrl ? (
                        <img className="orders-product-thumb" src={row.productImageUrl} alt="" />
                      ) : (
                        <span className="orders-product-thumb" aria-hidden="true" />
                      )}
                      <div className="orders-col-order-copy">
                        <div className="orders-order-line">
                          <span className="orders-order-tag">Order</span>
                          <Link href={`/admin/orders/${row.id}`}>#{orderLabel(row.orderNumber)}</Link>
                        </div>
                        <small className="orders-product-inline" title={row.productTitle ?? undefined}>
                          {clipProductName(row.productTitle)}
                        </small>
                      </div>
                    </div>
                    <div className="orders-product-line">
                      <span className="orders-field-label">Product</span>
                      <span className="orders-field-value orders-product-title" title={row.productTitle ?? undefined}>
                        {clipProductName(row.productTitle)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="orders-col-customer">
                  <span className="orders-field-label">Customer</span>
                  <span className="orders-field-value">
                    {row.customerName?.trim() || row.customerEmail.split("@")[0]}
                  </span>
                </div>
                <div className="orders-col-date">
                  <span className="orders-field-label">Date</span>
                  <span className="orders-field-value orders-field-value--date">
                    <Link href={`/admin/orders/${row.id}`} className="orders-eye" aria-label="View order">
                      <EyeIcon />
                    </Link>
                    <span>{ago(row.createdAt)}</span>
                  </span>
                </div>
                <div className="orders-col-status">
                  <span className="orders-field-label">Status</span>
                  <span className={`orders-pill orders-pill--${key} orders-field-value`}>
                    {statusLabel(row.status)}
                  </span>
                  {row.paymentMethod || row.transactionId ? (
                    <small className="orders-pay-id">
                      {[row.paymentMethod, row.transactionId].filter(Boolean).join(" · ")}
                    </small>
                  ) : null}
                </div>
                <div className="orders-col-total">
                  <span className="orders-field-label">Total</span>
                  <span className="orders-field-value">{taka(row.totalMinor)}</span>
                </div>
                <div className="orders-col-origin">
                  <span className="orders-field-label">Origin</span>
                  <span className="orders-field-value">{originLabel(row.origin)}</span>
                </div>
              </article>
            );
          })}
        </div>
        {data && data.total > data.pageSize ? (
          <div className="orders-pager">
            <button type="button" disabled={data.page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <span>Page {data.page}</span>
            <button type="button" disabled={data.page * data.pageSize >= data.total} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}

function looksLikeOrderNumber(value: string) {
  return /^#?(?:UQ-)?\d+$/i.test(value.trim());
}

function PaymentInfo({ payment }: { payment: AdminOrderListPage["payment"] }) {
  if (!payment) return <p className="orders-pay-miss">No payment found for that order number.</p>;
  return (
    <section className="orders-pay-card">
      <h2>Payment info</h2>
      <div className="orders-pay-grid">
        <div>
          <small>Order</small>
          <strong><Link href={`/admin/orders/${payment.orderId}`}>#{orderLabel(payment.orderNumber)}</Link></strong>
        </div>
        <div>
          <small>Order status</small>
          <strong>{statusLabel(payment.status)}</strong>
        </div>
        <div>
          <small>Amount</small>
          <strong>{taka(payment.totalMinor)}</strong>
        </div>
        <div>
          <small>Payment method</small>
          <strong>{payment.paymentMethod || "Not recorded"}</strong>
        </div>
        <div>
          <small>Transaction ID</small>
          <strong>{payment.transactionId || "—"}</strong>
        </div>
        <div>
          <small>Invoice</small>
          <strong>{payment.invoiceId || "—"}</strong>
        </div>
        <div>
          <small>Payment status</small>
          <strong>{payment.paymentStatus ? payment.paymentStatus.replaceAll("_", " ") : "No payment yet"}</strong>
        </div>
        <div>
          <small>Paid</small>
          <strong>{payment.paidAt ? new Date(payment.paidAt).toLocaleString() : "Not paid"}</strong>
        </div>
      </div>
    </section>
  );
}

function TabButton({ label, count, on, onClick }: { label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={on ? "is-on" : ""} onClick={onClick}>
      {label} <b>{count.toLocaleString("en-US")}</b>
    </button>
  );
}

function orderLabel(value: string) {
  return value.replace(/^#/, "").replace(/^UQ-/i, "");
}

function originLabel(origin: string) {
  if (!origin || origin === "DIRECT") return "Direct";
  if (origin === "WALLET") return "Wallet";
  return origin;
}

function clipProductName(value: string | null) {
  const name = value?.trim() ?? "";
  if (!name) return "—";
  return name.length > 25 ? `${name.slice(0, 25)}...` : name;
}

function statusLabel(status: OrderStatusPublic) {
  if (status === "PENDING_PAYMENT") return "Pending";
  if (status === "PAID") return "Paid";
  if (status === "FULFILLED") return "Completed";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "REFUNDED" || status === "PARTIALLY_REFUNDED") return "Refunded";
  return status;
}

function pillKey(status: OrderStatusPublic) {
  if (status === "PENDING_PAYMENT") return "pending";
  if (status === "PAID") return "paid";
  if (status === "FULFILLED") return "completed";
  if (status === "CANCELLED") return "cancelled";
  return "refunded";
}

function ageDays(value: string) {
  return (Date.now() - new Date(value).getTime()) / 86400000;
}

function ago(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function taka(minor: number) {
  const major = minor / 100;
  return `${Number.isInteger(major) ? major.toLocaleString("en-US") : major.toFixed(2)}৳`;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="11" cy="11" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16 16.5 20 20.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
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

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M2.5 12S6.5 6.5 12 6.5 21.5 12 21.5 12 17.5 17.5 12 17.5 2.5 12 2.5 12Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
