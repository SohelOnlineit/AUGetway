"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AdminBrand } from "@amarpin/types";
import { SeoFields } from "@/components/admin/SeoFields";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";

export default function AdminBrandsPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [rows, setRows] = useState<AdminBrand[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<AdminBrand[]>("/brands");
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

  async function create(event: FormEvent) {
    event.preventDefault();
    const result = await adminFetch<AdminBrand>("/brands", {
      method: "POST",
      body: JSON.stringify({ name, isActive: true }),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setName("");
    setNotice("Brand added.");
    setReloadToken((value) => value + 1);
  }

  async function saveRow(row: AdminBrand) {
    const result = await adminFetch<AdminBrand>(`/brands/${row.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: row.name,
        slug: row.slug,
        description: row.description,
        logoUrl: row.logoUrl,
        isActive: row.isActive,
        seoTitle: row.seoTitle,
        seoDescription: row.seoDescription,
        seoImageUrl: row.seoImageUrl,
        noindex: row.noindex,
      }),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setNotice(`${row.name} SEO saved.`);
    setRows((current) => current.map((item) => (item.id === row.id ? result.data : item)));
  }

  return (
    <AdminShell title="Brands" permissions={permissions}>
      {sessionError || error ? (
        <p className="form-error">{sessionError || error}</p>
      ) : null}
      {notice ? <p className="muted-note">{notice}</p> : null}
      {can(permissions, "admin:catalog:write") ? (
        <form className="admin-toolbar" onSubmit={(e) => void create(e)}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New brand name"
            required
          />
          <button className="primary-btn" type="submit">
            Add
          </button>
        </form>
      ) : null}
      <div className="order-list">
        {rows.map((row) => (
          <form
            key={row.id}
            className="order-row account-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void saveRow(row);
            }}
          >
            <div>
              <strong>{row.name}</strong>
              <p>
                {row.slug} · {row.isActive ? "active" : "inactive"} ·{" "}
                {row.productCount} products
              </p>
            </div>
            <SeoFields
              title={row.seoTitle ?? ""}
              description={row.seoDescription ?? ""}
              imageUrl={row.seoImageUrl ?? ""}
              noindex={row.noindex}
              disabled={!can(permissions, "admin:catalog:write")}
              onChange={(next) =>
                setRows((current) =>
                  current.map((item) =>
                    item.id === row.id
                      ? {
                          ...item,
                          seoTitle: next.title || null,
                          seoDescription: next.description || null,
                          seoImageUrl: next.imageUrl || null,
                          noindex: next.noindex,
                        }
                      : item,
                  ),
                )
              }
            />
            {can(permissions, "admin:catalog:write") ? (
              <button className="primary-btn" type="submit">
                Save SEO
              </button>
            ) : null}
          </form>
        ))}
      </div>
    </AdminShell>
  );
}
