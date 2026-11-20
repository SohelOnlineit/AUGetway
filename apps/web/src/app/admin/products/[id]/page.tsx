"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminProductDetail } from "@amarpin/types";
import { AdminProductForm } from "@/components/admin/AdminProductForm";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";

export default function AdminEditProductPage() {
  const params = useParams<{ id: string }>();
  const { permissions, error: sessionError, loading: sessionLoading } =
    useAdminSession();
  const [product, setProduct] = useState<AdminProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionLoading || sessionError) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<AdminProductDetail>(
        `/products/${params.id}`,
      );
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setProduct(result.data);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.id, sessionError, sessionLoading]);

  return (
    <AdminShell title="Edit product" permissions={permissions} bare>
      {sessionError || error ? (
        <p className="form-error">{sessionError || error}</p>
      ) : null}
      {sessionLoading || !product ? <p>Loading…</p> : null}
      {product && can(permissions, "admin:catalog:write") ? (
        <AdminProductForm key={product.id} mode="edit" initial={product} />
      ) : null}
      {product && !can(permissions, "admin:catalog:write") ? (
        <pre className="admin-pre">{JSON.stringify(product, null, 2)}</pre>
      ) : null}
    </AdminShell>
  );
}
