"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AdminCategory } from "@amarpin/types";
import { SeoFields } from "@/components/admin/SeoFields";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";

export default function AdminCategoriesPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const writable = can(permissions, "admin:catalog:write");
  const [rows, setRows] = useState<AdminCategory[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<AdminCategory[]>("/categories");
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRows(result.data);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, reloadToken, sessionError]);

  const stats = useMemo(() => {
    const active = rows.filter((row) => row.isActive).length;
    const products = rows.reduce((sum, row) => sum + row.productCount, 0);
    return { total: rows.length, active, hidden: rows.length - active, products };
  }, [rows]);

  async function create(event: FormEvent) {
    event.preventDefault();
    const result = await adminFetch<AdminCategory>("/categories", {
      method: "POST",
      body: JSON.stringify({ name, isActive: true }),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setName("");
    setError(null);
    setNotice("Category added.");
    setReloadToken((value) => value + 1);
  }

  async function saveRow(row: AdminCategory) {
    setBusyId(row.id);
    const result = await adminFetch<AdminCategory>(`/categories/${row.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: row.name,
        slug: row.slug,
        description: row.description,
        parentId: row.parentId,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        seoTitle: row.seoTitle,
        seoDescription: row.seoDescription,
        seoImageUrl: row.seoImageUrl,
        noindex: row.noindex,
      }),
    });
    setBusyId(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setNotice(`${result.data.name} saved.`);
    setRows((current) => current.map((item) => (item.id === row.id ? result.data : item)));
  }

  async function removeRow(row: AdminCategory) {
    const confirmed = window.confirm(`Delete “${row.name}”?`);
    if (!confirmed) return;
    setBusyId(row.id);
    const result = await adminFetch<{ deleted: true }>(`/categories/${row.id}`, {
      method: "DELETE",
    });
    setBusyId(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setNotice(`${row.name} deleted.`);
    setRows((current) => current.filter((item) => item.id !== row.id));
  }

  function patchRow(id: string, patch: Partial<AdminCategory>) {
    setRows((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  return (
    <AdminShell title="Categories" permissions={permissions} bare>
      <div className="categories-page">
        {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
        {notice ? <p className="categories-notice">{notice}</p> : null}

        <section className="categories-card">
          <header className="categories-head">
            <span aria-hidden>
              <LayersIcon />
            </span>
            <div>
              <h1>Product categories</h1>
              <p>Organize the shop. A category with products cannot be deleted until those products are moved.</p>
            </div>
          </header>

          <div className="categories-stats">
            <Stat label="Categories" value={String(stats.total)} />
            <Stat label="Active" value={String(stats.active)} />
            <Stat label="Hidden" value={String(stats.hidden)} />
            <Stat label="Products" value={String(stats.products)} />
          </div>

          {writable ? (
            <form className="categories-create" onSubmit={(event) => void create(event)}>
              <label>
                New category
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Gift cards, game top-up, subscriptions…"
                  required
                />
              </label>
              <button className="primary-btn" type="submit">
                Add category
              </button>
            </form>
          ) : null}
        </section>

        {rows.length === 0 ? (
          <section className="categories-empty">
            <strong>No categories yet</strong>
            <p>Add the first category above. Products are filed under a category when you create them.</p>
          </section>
        ) : (
          <div className="categories-list">
            {rows.map((row) => (
              <form
                key={row.id}
                className="category-card"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveRow(row);
                }}
              >
                <header>
                  <div>
                    <strong>{row.name || "Untitled category"}</strong>
                    <span>/{row.slug || "slug"}</span>
                  </div>
                  <em className={row.isActive ? "is-on" : ""}>{row.isActive ? "Active" : "Hidden"}</em>
                </header>

                <div className="category-grid">
                  <label>
                    Name
                    <input
                      value={row.name}
                      required
                      disabled={!writable}
                      onChange={(event) => patchRow(row.id, { name: event.target.value })}
                    />
                  </label>
                  <label>
                    Slug
                    <input
                      value={row.slug}
                      required
                      disabled={!writable}
                      onChange={(event) => patchRow(row.id, { slug: event.target.value })}
                    />
                  </label>
                  <label className="category-span">
                    Description
                    <textarea
                      value={row.description ?? ""}
                      rows={3}
                      disabled={!writable}
                      onChange={(event) =>
                        patchRow(row.id, { description: event.target.value || null })
                      }
                    />
                  </label>
                  <label className="category-check">
                    <input
                      type="checkbox"
                      checked={row.isActive}
                      disabled={!writable}
                      onChange={(event) => patchRow(row.id, { isActive: event.target.checked })}
                    />
                    Show this category on the store
                  </label>
                  <p>
                    {row.productCount} {row.productCount === 1 ? "product" : "products"}
                  </p>
                </div>

                <details className="category-seo">
                  <summary>Search listing</summary>
                  <SeoFields
                    title={row.seoTitle ?? ""}
                    description={row.seoDescription ?? ""}
                    imageUrl={row.seoImageUrl ?? ""}
                    noindex={row.noindex}
                    disabled={!writable}
                    onChange={(next) =>
                      patchRow(row.id, {
                        seoTitle: next.title || null,
                        seoDescription: next.description || null,
                        seoImageUrl: next.imageUrl || null,
                        noindex: next.noindex,
                      })
                    }
                  />
                </details>

                {writable ? (
                  <div className="category-actions">
                    <button className="primary-btn" type="submit" disabled={busyId === row.id}>
                      Save
                    </button>
                    <button
                      className="catalog-ghost"
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void removeRow(row)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </form>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="categories-stat">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3 3 8l9 5 9-5-9-5Zm-9 8 9 5 9-5M3 16l9 5 9-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
