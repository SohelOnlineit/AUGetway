"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  AdminPage,
  AdminProductDetail,
  AdminProductListItem,
  AdminProductStatus,
} from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { productDropIndex } from "@/lib/catalog/product-drop";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";

const STATUS_OPTIONS = [
  { value: "live", label: "Active (hide archived)" },
  { value: "all", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived only" },
] as const;

const TYPE_LABEL: Record<AdminProductListItem["type"], string> = {
  LICENSE: "License",
  ACCOUNT: "Account",
  GIFTCARD: "Gift card",
  TOPUP: "Top-up",
  SUBSCRIPTION: "Subscription",
};

const STATUS_LABEL: Record<AdminProductStatus, string> = {
  ACTIVE: "Active",
  DRAFT: "Draft",
  ARCHIVED: "Archived",
};

export default function AdminProductsPage() {
  const { permissions, error: sessionError, loading: sessionLoading } =
    useAdminSession();
  const canWrite = can(permissions, "admin:catalog:write");
  const [rows, setRows] = useState<AdminProductListItem[]>([]);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("live");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminProductListItem | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const dragId = useRef<string | null>(null);
  const canReorder = canWrite && !query;

  useEffect(() => {
    if (sessionLoading || sessionError) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const items: AdminProductListItem[] = [];
      let page = 1;
      let total = 0;
      do {
        const result = await adminFetch<AdminPage<AdminProductListItem>>(
          `/products?page=${page}&pageSize=100${query ? `&q=${encodeURIComponent(query)}` : ""}`,
        );
        if (cancelled) return;
        if (!result.ok) {
          setError(result.message);
          setLoading(false);
          return;
        }
        items.push(...result.data.items);
        total = result.data.total;
        page += 1;
      } while (items.length < total);
      if (cancelled) return;
      setRows(items);
      setError(null);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [query, sessionError, sessionLoading]);

  useEffect(() => {
    if (!deleteTarget) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDeleteTarget(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteTarget]);

  const visible = useMemo(() => {
    if (status === "all") return rows;
    if (status === "live") return rows.filter((row) => row.status !== "ARCHIVED");
    return rows.filter((row) => row.status === status);
  }, [rows, status]);

  const stats = useMemo(() => {
    let active = 0;
    let lowStock = 0;
    let draftCount = 0;
    for (const row of visible) {
      if (row.status === "ACTIVE") active += 1;
      if (row.status === "DRAFT") draftCount += 1;
      if (row.stockAvailable < 5 && row.status !== "ARCHIVED") lowStock += 1;
    }
    return { total: visible.length, active, lowStock, draft: draftCount };
  }, [visible]);

  const filtersActive = Boolean(query || status !== "live");

  async function saveOrder(ordered: AdminProductListItem[], previous: AdminProductListItem[]) {
    setOrdering(true);
    const result = await adminFetch<{ ok: boolean }>("/products/order", {
      method: "PATCH",
      body: JSON.stringify({ ids: ordered.map((row) => row.id) }),
    });
    setOrdering(false);
    if (!result.ok) {
      setRows(previous);
      setError(result.message);
      return;
    }
    setError(null);
    setNotice("Homepage will show this order, with the top products first.");
    void fetch("/api/admin/clear-cache", { method: "POST" });
  }

  function dropProduct(targetId: string) {
    const fromId = dragId.current;
    dragId.current = null;
    setDropId(null);
    if (!canReorder || !fromId || fromId === targetId) return;
    const from = rows.findIndex((row) => row.id === fromId);
    const to = rows.findIndex((row) => row.id === targetId);
    if (from < 0 || to < 0) return;
    const previous = rows;
    const next = [...rows];
    const insertAt = productDropIndex(from, to);
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(insertAt, 0, moved);
    setRows(next);
    void saveOrder(next, previous);
  }

  async function mutate(
    row: AdminProductListItem,
    patch: { featured?: boolean; status?: AdminProductStatus },
  ) {
    const detail = await adminFetch<AdminProductDetail>(`/products/${row.id}`);
    if (!detail.ok) return detail;
    const product = detail.data;
    return adminFetch<AdminProductDetail>(`/products/${row.id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: product.title,
        slug: product.slug,
        description: product.description ?? undefined,
        shortDescription: product.shortDescription ?? undefined,
        sku: product.sku ?? undefined,
        status: patch.status ?? product.status,
        type: product.type,
        categoryId: product.category.id,
        brandId: product.brand?.id ?? null,
        priceMinor: product.priceMinor,
        compareAtMinor: product.compareAtMinor,
        currency: product.currency,
        featured: patch.featured ?? product.featured,
        sortOrder: product.sortOrder,
        seoTitle: product.seoTitle ?? undefined,
        seoDescription: product.seoDescription ?? undefined,
      }),
    });
  }

  async function onToggleFeatured(row: AdminProductListItem) {
    setBusyId(row.id);
    setNotice(null);
    const next = !row.featured;
    const result = await mutate(row, { featured: next });
    setBusyId(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setRows((current) =>
      current.map((item) => (item.id === row.id ? { ...item, featured: next } : item)),
    );
    setNotice(next ? `"${row.title}" marked as featured.` : `"${row.title}" removed from featured.`);
  }

  async function onDelete(row: AdminProductListItem) {
    setBusyId(row.id);
    setNotice(null);
    const result = await mutate(row, { status: "ARCHIVED" });
    setBusyId(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setRows((current) =>
      current.map((item) => (item.id === row.id ? { ...item, status: "ARCHIVED" } : item)),
    );
    setDeleteTarget(null);
    setNotice(`"${row.title}" archived.`);
  }

  return (
    <AdminShell title="All Products" permissions={permissions} bare>
      <div className="catalog-page">
        <header className="catalog-hero">
          <div className="catalog-hero-title">
            <span className="catalog-hero-icon" aria-hidden>
              <BoxIcon />
            </span>
            <h1>All Products</h1>
          </div>
          <div className="catalog-hero-actions">
            <Link href="/admin" className="catalog-ghost">
              ← Dashboard
            </Link>
            {canWrite ? (
              <Link href="/admin/products/new" className="primary-btn catalog-add">
                + Add product
              </Link>
            ) : null}
          </div>
        </header>

        {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
        {notice ? <p className="catalog-notice">{notice}</p> : null}

        <dl className="catalog-stats">
          <Stat
            tone="brand"
            label="In view"
            value={loading ? "…" : String(stats.total)}
            meta={filtersActive ? "Matching current filters" : "All catalog items"}
            icon={<BoxIcon />}
          />
          <Stat
            tone="success"
            label="Active"
            value={loading ? "…" : String(stats.active)}
            meta="Live on storefront"
            icon={<CheckIcon />}
          />
          <Stat
            tone="amber"
            label="Low stock"
            value={loading ? "…" : String(stats.lowStock)}
            meta="Under 5 units available"
            icon={<KeyIcon />}
          />
          <Stat
            tone="muted"
            label="Draft"
            value={loading ? "…" : String(stats.draft)}
            meta="Not published yet"
            icon={<EyeOffIcon />}
          />
        </dl>

        <form
          className="catalog-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(draft.trim());
          }}
        >
          <label className="sr-only" htmlFor="catalog-search">
            Search products
          </label>
          <input
            id="catalog-search"
            type="search"
            value={draft}
            placeholder="Title or SKU..."
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="primary-btn catalog-search">
            Search
          </button>
          {query ? (
            <button
              type="button"
              className="catalog-ghost"
              onClick={() => {
                setDraft("");
                setQuery("");
              }}
            >
              Clear
            </button>
          ) : null}
          <FilterMenu
            label="Filter by status"
            value={status}
            options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => setStatus(value as (typeof STATUS_OPTIONS)[number]["value"])}
          />
        </form>

        {loading || sessionLoading ? <p className="catalog-empty">Loading products…</p> : null}
        {!loading && !sessionLoading && visible.length === 0 ? (
          <p className="catalog-empty">
            {filtersActive ? "No products match your filters." : "No products yet."}
          </p>
        ) : null}

        <div className="catalog-list">
          {visible.map((row) => {
            const low = row.stockAvailable < 5 && row.status !== "ARCHIVED";
            const price = formatTaka(row.priceMinor);
            return (
              <article
                key={row.id}
                className={
                  `catalog-row catalog-row--${row.status.toLowerCase()}` +
                  (dropId === row.id ? " is-drop" : "")
                }
                draggable={canReorder && !ordering}
                onDragStart={(event) => {
                  if (startProductDrag(event, row.id)) dragId.current = row.id;
                }}
                onDragOver={(event) => {
                  if (!canReorder || !event.dataTransfer.types.includes("text/plain")) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropId((current) => (current === row.id ? current : row.id));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  dropProduct(row.id);
                }}
                onDragEnd={() => {
                  dragId.current = null;
                  setDropId(null);
                }}
              >
                <div className="catalog-row-main">
                  {canReorder ? (
                    <span className="catalog-grip" title="Drag up to show this product first on the homepage">
                      <GripIcon />
                    </span>
                  ) : null}
                  <span className="catalog-thumb" aria-hidden>
                    {row.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.imageUrl} alt="" />
                    ) : (
                      <BoxIcon />
                    )}
                  </span>
                  <div className="catalog-row-copy">
                    <div className="catalog-row-title">
                      <strong>{row.title}</strong>
                      <span className={`catalog-badge catalog-badge--${row.status.toLowerCase()}`}>
                        {STATUS_LABEL[row.status]}
                      </span>
                    </div>
                    <p>
                      {TYPE_LABEL[row.type]}
                      {" · "}
                      <span className="catalog-price">
                        {price}
                        <span className="home-card-taka">৳</span>
                      </span>
                      {" · Stock "}
                      <span className={low ? "catalog-stock-low" : undefined}>
                        {row.stockAvailable}
                        {low ? " low" : ""}
                      </span>
                    </p>
                    <p className="catalog-sku">
                      /{row.slug}
                      {row.sku ? ` · ${row.sku}` : ""}
                    </p>
                  </div>
                </div>
                <div className="catalog-row-actions">
                  {canWrite ? (
                    <button
                      type="button"
                      className={
                        row.featured
                          ? "catalog-action catalog-action--feature is-on"
                          : "catalog-action catalog-action--feature"
                      }
                      aria-pressed={row.featured}
                      disabled={busyId !== null}
                      onClick={() => void onToggleFeatured(row)}
                    >
                      <StarIcon filled={row.featured} />
                      Featured
                    </button>
                  ) : null}
                  <Link href={`/${row.slug}`} className="catalog-action" target="_blank">
                    <EyeIcon />
                    View
                  </Link>
                  {canWrite ? (
                    <Link href={`/admin/products/${row.id}`} className="catalog-action">
                      Edit
                    </Link>
                  ) : null}
                  {canWrite && row.status !== "ARCHIVED" ? (
                    <button
                      type="button"
                      className="catalog-action catalog-action--delete"
                      disabled={busyId !== null}
                      onClick={() => setDeleteTarget(row)}
                    >
                      {busyId === row.id ? "Archiving…" : "Delete"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
      {deleteTarget
        ? createPortal(
            <div className="variations-warn" role="presentation" onClick={() => setDeleteTarget(null)}>
              <div
                className="variations-warn-card"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="product-delete-title"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 id="product-delete-title">Delete {deleteTarget.title}?</h3>
                <p>This product will be hidden from the storefront. Existing orders stay in the catalog.</p>
                <div>
                  <button
                    type="button"
                    className="variations-cancel"
                    onClick={() => setDeleteTarget(null)}
                    disabled={busyId !== null}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="variations-warn-delete"
                    onClick={() => void onDelete(deleteTarget)}
                    disabled={busyId !== null}
                  >
                    {busyId === deleteTarget.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </AdminShell>
  );
}

function Stat({
  tone,
  label,
  value,
  meta,
  icon,
}: {
  tone: "brand" | "success" | "amber" | "muted";
  label: string;
  value: string;
  meta: string;
  icon: ReactNode;
}) {
  return (
    <div className={`catalog-stat catalog-stat--${tone}`}>
      <span className="catalog-stat-icon" aria-hidden>
        {icon}
      </span>
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
        <p>{meta}</p>
      </div>
    </div>
  );
}

function formatTaka(minor: number) {
  const amount = minor / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function startProductDrag(event: DragEvent, id: string) {
  const target = event.target as HTMLElement;
  if (target.closest("a, button, input")) {
    event.preventDefault();
    return false;
  }
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", `product:${id}`);
  return true;
}

function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="7" r="1.3" fill="currentColor" />
      <circle cx="15" cy="7" r="1.3" fill="currentColor" />
      <circle cx="9" cy="12" r="1.3" fill="currentColor" />
      <circle cx="15" cy="12" r="1.3" fill="currentColor" />
      <circle cx="9" cy="17" r="1.3" fill="currentColor" />
      <circle cx="15" cy="17" r="1.3" fill="currentColor" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 3.2 20 7.2v9.6l-8 4-8-4V7.2l8-4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M12 12.2 20 7.4M12 12.2 4 7.4M12 12.2V21" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.2 12.2 11 15l4.8-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="8.2" cy="12" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M11.4 12H20l-1.6 1.8L20 15.6h-2.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 12s2.8-5 8-5 8 5 8 5-2.8 5-8 5-8-5-8-5Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 19 19 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M3.5 12s3-6 8.5-6 8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="m12 3.6 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16l-4.8 2.5.9-5.4L4.2 9.3l5.4-.8L12 3.6Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
