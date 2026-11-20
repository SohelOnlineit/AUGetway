"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AdminCoupon, AdminPage } from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";

export default function AdminCouponsPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [rows, setRows] = useState<AdminCoupon[]>([]);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<AdminPage<AdminCoupon>>(
        "/coupons?page=1&pageSize=50",
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
  }, [loading, reload, sessionError]);

  async function create(event: FormEvent) {
    event.preventDefault();
    const result = await adminFetch<AdminCoupon>("/coupons", {
      method: "POST",
      body: JSON.stringify({
        code,
        discountType: "PERCENT",
        percent,
        isActive: true,
      }),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCode("");
    setReload((v) => v + 1);
  }

  return (
    <AdminShell
      title="Coupons"
      lead="Discounts are calculated on the server at checkout. Holds release when a pending order is cancelled or expires."
      permissions={permissions}
    >
      {sessionError || error ? (
        <p className="form-error">{sessionError || error}</p>
      ) : null}
      {can(permissions, "admin:coupons:write") ? (
        <form className="admin-toolbar" onSubmit={(e) => void create(e)}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="CODE"
            required
          />
          <input
            type="number"
            min={1}
            max={100}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
          />
          <button className="primary-btn" type="submit">
            Add percent coupon
          </button>
        </form>
      ) : null}
      <div className="order-list">
        {rows.map((row) => (
          <div key={row.id} className="order-row">
            <div>
              <strong>{row.code}</strong>
              <p>
                {row.discountType} {row.percent ?? row.amountMinor} ·{" "}
                {row.isActive ? "active" : "inactive"} · held {row.heldCount} ·
                used {row.consumedCount}
              </p>
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
