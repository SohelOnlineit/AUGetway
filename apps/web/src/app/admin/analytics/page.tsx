"use client";

import { useEffect, useState } from "react";
import type { AdminAnalyticsLive, AdminAnalyticsSummary } from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";

export default function AdminAnalyticsPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [summary, setSummary] = useState<AdminAnalyticsSummary | null>(null);
  const [live, setLive] = useState<AdminAnalyticsLive | null>(null);
  const [days, setDays] = useState("7");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<AdminAnalyticsSummary>(
        `/analytics/summary?days=${encodeURIComponent(days)}`,
      );
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSummary(result.data);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [days, loading, sessionError]);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<AdminAnalyticsLive>("/analytics/live");
      if (cancelled || !result.ok) return;
      setLive(result.data);
    }
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loading, sessionError]);

  return (
    <AdminShell
      title="Visitor Analytics"
      lead="Privacy-conscious aggregates only — no emails, tokens, or chat text."
      permissions={permissions}
    >
      {sessionError || error ? (
        <p className="form-error">{sessionError || error}</p>
      ) : null}
      <section className="visitors-live" aria-live="polite">
        <span className="visitors-live-icon" aria-hidden="true">
          <span className="visitors-live-ring" />
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
            <path d="M3.5 19c.6-2.6 2.7-4 5.5-4s4.9 1.4 5.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="17" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M16 15.2c1.8.3 3.2 1.4 3.8 3.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <div>
          <p className="eyebrow">
            <span className="visitors-live-dot" /> Live
          </p>
          <h2>Visitors online</h2>
          <strong>{live ? live.online.toLocaleString("en-US") : "—"}</strong>
          <em>
            {live
              ? `People with the shop open in the last ${live.windowSeconds} seconds.`
              : "Checking who has the shop open…"}
          </em>
        </div>
      </section>
      <div className="admin-toolbar">
        <FilterMenu
          label="Date range"
          value={days}
          onChange={setDays}
          options={[
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" },
            { value: "90", label: "Last 90 days" },
          ]}
        />
      </div>
      {!summary ? <p>Loading…</p> : null}
      {summary ? (
        <div className="account-stack">
          <div className="admin-stat-grid">
            {Object.entries(summary.totals).map(([name, count]) => (
              <div key={name} className="account-stat">
                <p className="eyebrow">{name}</p>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
          <h2>Top paths (page_view)</h2>
          <div className="order-list">
            {summary.topPaths.length === 0 ? (
              <p className="empty-state">No page views in this window.</p>
            ) : (
              summary.topPaths.map((row) => (
                <div key={row.path} className="order-row">
                  <code>{row.path}</code>
                  <strong>{row.count}</strong>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
