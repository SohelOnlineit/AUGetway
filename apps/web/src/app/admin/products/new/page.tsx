"use client";

import { AdminProductForm } from "@/components/admin/AdminProductForm";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { can } from "@/lib/admin/api";

export default function AdminNewProductPage() {
  const { permissions, error, loading } = useAdminSession();
  return (
    <AdminShell title="New product" permissions={permissions} bare>
      {loading ? <p>Loading…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {!loading && !can(permissions, "admin:catalog:write") ? (
        <p className="form-error">Missing admin:catalog:write</p>
      ) : null}
      {!loading && can(permissions, "admin:catalog:write") ? (
        <AdminProductForm mode="create" />
      ) : null}
    </AdminShell>
  );
}
