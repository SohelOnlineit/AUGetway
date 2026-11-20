"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { ChatCustomerInfoDialog } from "@/components/chat/ChatCustomerInfoDialog";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";
import { formatPointsWorth } from "@/lib/points";

type PointProduct = {
  id: string;
  title: string;
  imageUrl?: string | null;
  spendTaka: number;
  points: number;
};

type PointLeader = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  points: number;
};

type PointState = {
  enabled: boolean;
  products: PointProduct[];
  leaders: PointLeader[];
};

export default function AdminPointsPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [enabled, setEnabled] = useState(false);
  const [products, setProducts] = useState<PointProduct[]>([]);
  const [leaders, setLeaders] = useState<PointLeader[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [openLeader, setOpenLeader] = useState<PointLeader | null>(null);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<PointState>("/points");
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEnabled(result.data.enabled);
      setProducts(result.data.products);
      setLeaders(result.data.leaders ?? []);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, sessionError]);

  function updateProduct(id: string, patch: Partial<PointProduct>) {
    setProducts((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    const result = await adminFetch<PointState>("/points", {
      method: "PUT",
      body: JSON.stringify({
        enabled,
        products: products.map((product) => ({
          productId: product.id,
          spendTaka: Number(product.spendTaka) || 0,
          points: Math.round(Number(product.points) || 0),
        })),
      }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEnabled(result.data.enabled);
    setProducts(result.data.products);
    setLeaders(result.data.leaders ?? []);
    setError(null);
    setNotice(enabled ? "Points system saved." : "Points system is off.");
  }

  const writable = can(permissions, "admin:points:write");

  return (
    <AdminShell
      title="Points"
      lead="Each product can earn a different number of points. A customer gets the points when the order is paid."
      permissions={permissions}
    >
      {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
      {notice ? <p className="form-success">{notice}</p> : null}

      <section className="points-hero">
        <span className="points-hero-icon" aria-hidden>
          <svg className="points-hero-star" viewBox="0 0 24 24" width="26" height="26" fill="none">
            <path d="m12 2.2 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 15.6 6.8 18.4l1-5.9L3.5 8.4l5.9-.8L12 2.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <p>Loyalty</p>
          <h2>Award points on paid orders</h2>
          <p className="points-hero-note">Customers earn the points you enter when they spend the taka you enter. Every 10 points are worth 1 taka. Refunds take the matching points back.</p>
        </div>
        <button
          type="button"
          className={enabled ? "points-switch is-on" : "points-switch"}
          role="switch"
          aria-checked={enabled}
          aria-label="Award points on paid orders"
          disabled={!writable}
          onClick={() => setEnabled((value) => !value)}
        >
          <span />
        </button>
      </section>

      <section className="points-board" aria-labelledby="points-leaders-title">
        <header>
          <span className="points-board-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
              <path d="M7 4h10v3a5 5 0 0 1-10 0V4Z" stroke="currentColor" strokeWidth="1.6" />
              <path d="M7 6H4.5A2.5 2.5 0 0 0 7 10.5M17 6h2.5A2.5 2.5 0 0 1 17 10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M12 12v3M9 20h6l-1-5h-4l-1 5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <h2 id="points-leaders-title">Top customers</h2>
            <p>The 10 highest point balances</p>
          </div>
        </header>
        {leaders.length === 0 ? (
          <p className="points-empty">No customer has earned points yet.</p>
        ) : (
          <ol>
            {leaders.map((leader, index) => (
              <li key={leader.userId}>
                <span className={index < 3 ? `points-rank is-${index + 1}` : "points-rank"}>{index + 1}</span>
                <button
                  type="button"
                  className="points-leader-avatar"
                  aria-label={`${leader.name} details`}
                  onClick={() => setOpenLeader(leader)}
                >
                  {leader.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={leader.avatarUrl} alt="" width={42} height={42} />
                  ) : (
                    leader.name.trim().charAt(0).toUpperCase() || "?"
                  )}
                </button>
                <strong>{leader.name}</strong>
                <em>{leader.points.toLocaleString("en-US")}</em>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="points-catalog" aria-labelledby="points-catalog-title">
        <header>
          <div>
            <h2 id="points-catalog-title">Product points</h2>
            <p>Each product can earn a different amount.</p>
          </div>
          <button
            type="button"
            className={infoOpen ? "points-info is-open" : "points-info"}
            aria-expanded={infoOpen}
            aria-controls="points-info-note"
            onClick={() => setInfoOpen((open) => !open)}
          >
            i
          </button>
        </header>
        {infoOpen ? (
          <p id="points-info-note" className="points-info-note">
            Taka is how much the customer spends. Points is how many points that spend earns. 50 and 10 means 50 taka earns 10 points, and 49 taka earns the same share, rounded to the nearest point. A paid amount still earns at least 1 point. Every 10 points are worth 1 taka. Set either field to 0 to award nothing.
          </p>
        ) : null}
        <div className="points-rules">
          {products.map((product) => (
            <div key={product.id} className={product.points > 0 && product.spendTaka > 0 ? "points-rule is-live" : "points-rule"}>
              <div className="points-rule-name">
                <ProductThumb title={product.title} src={product.imageUrl} />
                <strong>{product.title}</strong>
              </div>
              <label>
                <span>Taka</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  aria-label={`${product.title} spend`}
                  value={product.spendTaka}
                  disabled={!writable}
                  onChange={(event) => updateProduct(product.id, { spendTaka: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>{product.points > 0 ? `Points · ${formatPointsWorth(product.points)}` : "Points"}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  aria-label={`${product.title} points`}
                  value={product.points}
                  disabled={!writable}
                  onChange={(event) => updateProduct(product.id, { points: Number(event.target.value) })}
                />
              </label>
            </div>
          ))}
        </div>
        {writable ? (
          <div className="points-catalog-save">
            <button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save points"}
            </button>
          </div>
        ) : null}
      </section>
      <ChatCustomerInfoDialog
        customerId={openLeader?.userId ?? null}
        open={openLeader !== null}
        onClose={() => setOpenLeader(null)}
        fallback={{ displayName: openLeader?.name, avatarUrl: openLeader?.avatarUrl }}
      />
    </AdminShell>
  );
}

function ProductThumb({ title, src }: { title: string; src?: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="points-thumb" aria-hidden>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        <em>{title.trim().slice(0, 1).toUpperCase()}</em>
      )}
    </span>
  );
}
