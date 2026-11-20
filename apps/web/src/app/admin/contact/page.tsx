"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  AdminContactListItem,
  AdminPage,
  ContactInquiryStatusPublic,
} from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";

export default function AdminContactListPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [rows, setRows] = useState<AdminContactListItem[]>([]);
  const [status, setStatus] = useState<"" | ContactInquiryStatusPublic>("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const result = await adminFetch<AdminPage<AdminContactListItem>>(
        `/contact?${params.toString()}`,
      );
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRows(result.data.items);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, q, sessionError, status]);

  return (
    <AdminShell
      title="Contact inbox"
      lead="Public contact form submissions. Reply delivery status is never faked as sent without a provider."
      permissions={permissions}
    >
      {sessionError || error ? (
        <p className="form-error">{sessionError || error}</p>
      ) : null}
      <div className="admin-toolbar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, subject"
        />
        <FilterMenu
          label="Inquiry status"
          value={status}
          onChange={(value) => setStatus(value as "" | ContactInquiryStatusPublic)}
          options={[
            { value: "", label: "All" },
            { value: "NEW", label: "NEW" },
            { value: "READ", label: "READ" },
            { value: "REPLIED", label: "REPLIED" },
            { value: "CLOSED", label: "CLOSED" },
          ]}
        />
      </div>
      <div className="order-list">
        {rows.map((row) => (
          <Link key={row.id} href={`/admin/contact/${row.id}`} className="order-row">
            <div>
              <strong>{row.subject}</strong>
              <p>
                {row.status} · {row.name} · {row.email}
              </p>
            </div>
            <span>{formatBangladeshDateTime(row.createdAt)}</span>
          </Link>
        ))}
        {rows.length === 0 && !loading ? (
          <p className="empty-state">Inbox empty.</p>
        ) : null}
      </div>
    </AdminShell>
  );
}
