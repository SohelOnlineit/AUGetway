"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AdminProductReview, AdminReviewListPage, ReviewStatusPublic } from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";

const STATUSES: Array<{ value: "" | ReviewStatusPublic; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Published" },
  { value: "REJECTED", label: "Rejected" },
];

function statusLabel(status: ReviewStatusPublic) {
  if (status === "APPROVED") return "Published";
  if (status === "REJECTED") return "Rejected";
  return "Pending";
}

function statusTone(status: ReviewStatusPublic) {
  if (status === "APPROVED") return "is-success";
  if (status === "REJECTED") return "is-muted";
  return "is-amber";
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

export default function AdminReviewsPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const canWrite = can(permissions, "admin:reviews:write");
  const [page, setPage] = useState<AdminReviewListPage | null>(null);
  const [status, setStatus] = useState<"" | ReviewStatusPublic>("");
  const [rating, setRating] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [managing, setManaging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (status) params.set("status", status);
      if (rating) params.set("rating", rating);
      if (query) params.set("q", query);
      const result = await adminFetch<AdminReviewListPage>(`/reviews?${params.toString()}`);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        setReady(true);
        return;
      }
      setPage(result.data);
      setSelected([]);
      setError(null);
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, query, rating, reload, sessionError, status]);

  const rows = page?.items ?? [];
  const stats = page?.stats;
  const allChecked = rows.length > 0 && rows.every((row) => selected.includes(row.id));
  const average = useMemo(() => {
    if (!stats?.averageRating) return "—";
    return stats.averageRating.toFixed(1);
  }, [stats?.averageRating]);

  async function moderate(ids: string[], next: ReviewStatusPublic) {
    const results = await Promise.all(
      ids.map((id) =>
        adminFetch(`/reviews/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: next }),
        }),
      ),
    );
    const failed = results.find((result) => !result.ok);
    if (failed && !failed.ok) {
      setError(failed.message);
      return;
    }
    setManaging(null);
    setReload((value) => value + 1);
  }

  return (
    <AdminShell title="Reviews" permissions={permissions} bare>
      {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
      {!ready ? (
        <p className="mail-loading">{sessionError ? "" : "Loading reviews…"}</p>
      ) : (
        <div className="reviews-page">
          <header className="reviews-hero">
            <span className="reviews-hero-icon" aria-hidden>
              <span className="reviews-ring" />
              <ChatIcon />
            </span>
            <div>
              <h1>Customer reviews</h1>
              <p>Moderate product feedback, publish replies, and keep storefront ratings trustworthy.</p>
            </div>
            <div className="reviews-hero-actions">
              <Link href="/admin/products">← Products</Link>
              <button type="button" className={status === "PENDING" ? "is-on" : ""} onClick={() => setStatus(status === "PENDING" ? "" : "PENDING")}>
                View pending ({stats?.pending ?? 0})
              </button>
            </div>
          </header>

          <div className="reviews-stats">
            <button type="button" className={status === "" && rating === "" ? "is-on" : ""} onClick={() => { setStatus(""); setRating(""); }}>
              <span className="reviews-stat-icon" aria-hidden><ChatIcon /></span>
              <div>
                <span>Total</span>
                <strong>{stats?.total ?? 0}</strong>
                <em>Avg {average} / 5 published</em>
              </div>
            </button>
            <button type="button" className={status === "PENDING" ? "is-on is-amber" : "is-amber"} onClick={() => setStatus(status === "PENDING" ? "" : "PENDING")}>
              <span className="reviews-stat-icon" aria-hidden><BoltIcon /></span>
              <div>
                <span>Pending</span>
                <strong>{stats?.pending ?? 0}</strong>
                <em>Awaiting moderation</em>
              </div>
            </button>
            <button type="button" className={status === "APPROVED" ? "is-on is-success" : "is-success"} onClick={() => setStatus(status === "APPROVED" ? "" : "APPROVED")}>
              <span className="reviews-stat-icon" aria-hidden><CheckIcon /></span>
              <div>
                <span>Published</span>
                <strong>{stats?.published ?? 0}</strong>
                <em>Visible on the storefront</em>
              </div>
            </button>
            <button type="button" className={status === "REJECTED" ? "is-on is-amber" : "is-amber"} onClick={() => setStatus(status === "REJECTED" ? "" : "REJECTED")}>
              <span className="reviews-stat-icon" aria-hidden><FlagIcon /></span>
              <div>
                <span>Flagged</span>
                <strong>{stats?.rejected ?? 0}</strong>
                <em>{stats?.rejected ?? 0} rejected</em>
              </div>
            </button>
          </div>

          <section className="reviews-card">
            <header className="reviews-card-head">
              <span className="reviews-stat-icon" aria-hidden><ChatIcon /></span>
              <div>
                <h2>Review queue</h2>
                <p>{page?.total ?? 0} review{(page?.total ?? 0) === 1 ? "" : "s"} in this view</p>
              </div>
            </header>
            <div className="reviews-filters">
              <label>
                <span><SearchIcon /> Search</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer, product, or text..." />
              </label>
              <label>
                Status
                <FilterMenu label="Status" value={status} onChange={(value) => setStatus(value as "" | ReviewStatusPublic)} options={STATUSES} />
              </label>
              <label>
                Rating
                <FilterMenu
                  label="Rating"
                  value={rating}
                  onChange={setRating}
                  options={[
                    { value: "", label: "All ratings" },
                    { value: "5", label: "5 stars" },
                    { value: "4", label: "4 stars" },
                    { value: "3", label: "3 stars" },
                    { value: "2", label: "2 stars" },
                    { value: "1", label: "1 star" },
                  ]}
                />
              </label>
            </div>
            {canWrite && selected.length > 0 ? (
              <div className="reviews-bulk">
                <span>{selected.length} selected</span>
                <button type="button" onClick={() => void moderate(selected, "APPROVED")}>Publish</button>
                <button type="button" onClick={() => void moderate(selected, "REJECTED")}>Reject</button>
              </div>
            ) : null}
            <div className="reviews-table-wrap">
              <table className="reviews-table">
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? [] : rows.map((row) => row.id))} aria-label="Select reviews on this page" />
                    </th>
                    <th>Customer</th>
                    <th>Product</th>
                    <th>Review</th>
                    <th>Rating</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="reviews-empty">No reviews match this view.</td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <ReviewRow
                        key={row.id}
                        row={row}
                        selected={selected.includes(row.id)}
                        open={managing === row.id}
                        canWrite={canWrite}
                        onSelect={() => setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])}
                        onManage={() => setManaging((current) => current === row.id ? null : row.id)}
                        onModerate={(next) => void moderate([row.id], next)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AdminShell>
  );
}

function ReviewRow({
  row,
  selected,
  open,
  canWrite,
  onSelect,
  onManage,
  onModerate,
}: {
  row: AdminProductReview;
  selected: boolean;
  open: boolean;
  canWrite: boolean;
  onSelect: () => void;
  onManage: () => void;
  onModerate: (status: ReviewStatusPublic) => void;
}) {
  const name = row.authorDisplayName?.trim() || row.authorEmail.split("@")[0] || "Customer";
  return (
    <tr>
      <td>
        <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select review by ${name}`} />
      </td>
      <td>
        <div className="reviews-person">
          <span aria-hidden>{name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{name}</strong>
            <small>{row.authorEmail}</small>
          </div>
        </div>
      </td>
      <td>
        <Link href={`/${row.productSlug}`}><strong>{row.productTitle}</strong></Link>
        <small>/{row.productSlug}</small>
      </td>
      <td className="reviews-body">{row.body}</td>
      <td>
        <span className="reviews-stars" aria-label={`${row.rating} out of 5`}>
          {[1, 2, 3, 4, 5].map((star) => (
            <span key={star} className={star <= row.rating ? "is-on" : ""}>★</span>
          ))}
          <em>{row.rating}/5</em>
        </span>
      </td>
      <td><span className={`reviews-pill ${statusTone(row.status)}`}>{statusLabel(row.status)}</span></td>
      <td>{shortDate(row.createdAt)}</td>
      <td className="reviews-manage">
        {canWrite ? (
          <>
            <button type="button" onClick={onManage}>Manage</button>
            {open ? (
              <div>
                {row.status !== "APPROVED" ? <button type="button" onClick={() => onModerate("APPROVED")}>Publish</button> : null}
                {row.status !== "REJECTED" ? <button type="button" onClick={() => onModerate("REJECTED")}>Reject</button> : null}
                {row.status !== "PENDING" ? <button type="button" onClick={() => onModerate("PENDING")}>Mark pending</button> : null}
              </div>
            ) : null}
          </>
        ) : (
          <span>—</span>
        )}
      </td>
    </tr>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6h14v9H8l-3 3V6Z" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 3 6 13h6l-1 8 7-10h-6l1-8Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="m8.2 12.2 2.4 2.4 5.2-5.4" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4v16" />
      <path d="M6 5h11l-2 3 2 3H6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </svg>
  );
}
