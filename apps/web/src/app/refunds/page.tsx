"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicRefundListItem } from "@amarpin/types";
import { AccountShell, AccountState } from "@/components/account/AccountShell";
import { formatPrice } from "@/lib/catalog/format";

export default function RefundsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PublicRefundListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/refunds");
      if (cancelled) return;
      if (response.status === 401) {
        router.replace("/login?next=/refunds");
        return;
      }
      if (!response.ok) {
        setError("Unable to load refunds");
        setLoading(false);
        return;
      }
      setRows((await response.json()) as PublicRefundListItem[]);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <AccountShell
      title="Refunds"
      lead="Requests for your eligible paid orders only."
    >
      <AccountState
        loading={loading}
        error={error}
        empty={rows.length === 0 ? "No refund requests yet." : null}
      >
        <div className="order-list">
          {rows.map((row) => (
            <Link key={row.id} href={`/refunds/${row.id}`} className="order-row">
              <div>
                <strong>{row.orderNumber}</strong>
                <p>
                  {row.status} · {row.destination}
                </p>
              </div>
              <strong>{formatPrice(row.amountMinor, row.currency)}</strong>
            </Link>
          ))}
        </div>
      </AccountState>
    </AccountShell>
  );
}
