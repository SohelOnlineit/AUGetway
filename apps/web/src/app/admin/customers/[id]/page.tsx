"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminCustomerDetail } from "@amarpin/types";
import { CustomerEditor } from "@/components/admin/CustomerEditor";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";

export default function AdminCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [customer, setCustomer] = useState<AdminCustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    void (async () => {
      const result = await adminFetch<AdminCustomerDetail>(`/customers/${params.id}`);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCustomer(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, params.id, sessionError]);

  return (
    <AdminShell title="Customer" permissions={permissions} bare>
      <div className="customers-page">
        {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
        {customer ? (
          <CustomerEditor customer={customer} onClose={() => router.push("/admin/customers")} onSaved={setCustomer} />
        ) : (
          <p className="customer-editor-help">Loading customer…</p>
        )}
      </div>
    </AdminShell>
  );
}
