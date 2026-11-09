"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { CheckoutCard } from "@uniqpay/types";

type Summary = {
  open: number;
  waiting: number;
  paid: number;
  methods: number;
  handsets: number;
  volume: string;
  currency: string;
};
type Bucket = { amount: string; completed: number; total: number; successRate: number };
type Handset = { lastSeenAt: string | null };

const bars = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["this_week", "This week"],
  ["last_week", "Last week"],
  ["this_month", "This month"],
] as const;

function money(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function useCount(target: number, ready: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!ready) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 700);
      setValue(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, ready]);
  return value;
}

function Taka({ value, ready }: { value: number; ready: boolean }) {
  const shown = useCount(value, ready);
  return (
    <strong>
      <span className="taka">৳</span>
      {ready ? money(shown) : "—"}
    </strong>
  );
}

function Count({ value, ready }: { value: number; ready: boolean }) {
  const shown = useCount(value, ready);
  return <strong>{ready ? Math.round(shown).toLocaleString("en-US") : "—"}</strong>;
}

function Icon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "wallet") return <svg viewBox="0 0 24 24"><path {...common} d="M4 8.5h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path {...common} d="M4 8.5 6 5h11l3 3.5M16 13.5h3" /></svg>;
  if (name === "sun") return <svg viewBox="0 0 24 24"><circle {...common} cx="12" cy="12" r="3.5" /><path {...common} d="M12 3.5v2M12 18.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3.5 12h2M18.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
  if (name === "calendar") return <svg viewBox="0 0 24 24"><rect {...common} x="4" y="5" width="16" height="15" rx="2" /><path {...common} d="M8 3.5V7M16 3.5V7M4 10h16" /></svg>;
  if (name === "chart") return <svg viewBox="0 0 24 24"><path {...common} d="M5 19V10M12 19V5M19 19v-7" /></svg>;
  if (name === "clock") return <svg viewBox="0 0 24 24"><circle {...common} cx="12" cy="12" r="8" /><path {...common} d="M12 8v4.5l3 2" /></svg>;
  if (name === "check") return <svg viewBox="0 0 24 24"><circle {...common} cx="12" cy="12" r="8" /><path {...common} d="m8.5 12.2 2.3 2.3 4.7-5" /></svg>;
  if (name === "card") return <svg viewBox="0 0 24 24"><rect {...common} x="3" y="6" width="18" height="12" rx="2" /><path {...common} d="M3 10h18" /></svg>;
  if (name === "people") return <svg viewBox="0 0 24 24"><path {...common} d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8.5 1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.5 19c.4-2.4 2.2-4 4.5-4s4.1 1.6 4.5 4M14 15c1.8 0 3.4 1.1 4 3" /></svg>;
  if (name === "file") return <svg viewBox="0 0 24 24"><path {...common} d="M7 3.5h7l5 5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" /><path {...common} d="M14 3.5V9h5M8 13h8M8 17h5" /></svg>;
  if (name === "link") return <svg viewBox="0 0 24 24"><path {...common} d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path {...common} d="M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" /></svg>;
  if (name === "key") return <svg viewBox="0 0 24 24"><circle {...common} cx="8" cy="14" r="3.2" /><path {...common} d="M11 14h9l-2 2M17 14l2-2" /></svg>;
  if (name === "phone") return <svg viewBox="0 0 24 24"><rect {...common} x="7" y="3" width="10" height="18" rx="2" /><path {...common} d="M11 18h2" /></svg>;
  return <svg viewBox="0 0 24 24"><path {...common} d="M5 19V10M12 19V5M19 19v-7" /></svg>;
}

export default function OverviewPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [report, setReport] = useState<Record<string, Bucket> | null>(null);
  const [payments, setPayments] = useState<CheckoutCard[]>([]);
  const [counts, setCounts] = useState({ customers: 0, bills: 0, links: 0, keys: 0, online: 0 });
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([
      api<Summary>("/desk/summary"),
      api<Record<string, Bucket>>("/desk/reports"),
      api<CheckoutCard[]>("/desk/checkouts"),
      api<{ id: string }[]>("/desk/customers"),
      api<{ number: string }[]>("/desk/bills"),
      api<{ id: string }[]>("/desk/links"),
      api<{ id: string }[]>("/desk/keys"),
      api<Handset[]>("/desk/handsets"),
    ])
      .then(([nextSummary, nextReport, nextPayments, customers, bills, links, keys, handsets]) => {
        const now = Date.now();
        setSummary(nextSummary);
        setReport(nextReport);
        setPayments(nextPayments.slice(0, 6));
        setCounts({
          customers: customers.length,
          bills: bills.length,
          links: links.length,
          keys: keys.length,
          online: handsets.filter((row) => row.lastSeenAt && now - new Date(row.lastSeenAt).getTime() < 24 * 60 * 60 * 1000).length,
        });
        setReady(true);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load the dashboard"));
  }, []);

  const today = Number(report?.today?.amount ?? 0);
  const month = Number(report?.this_month?.amount ?? 0);
  const rate = report?.this_month?.successRate ?? 0;
  const peak = Math.max(1, ...bars.map(([key]) => Number(report?.[key]?.amount ?? 0)));
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const tiles = [
    ["Open checkouts", summary?.open ?? 0, "clock", "/admin/transactions"],
    ["Waiting", summary?.waiting ?? 0, "clock", "/admin/transactions"],
    ["Paid", summary?.paid ?? 0, "check", "/admin/transactions"],
    ["Gateways", summary?.methods ?? 0, "card", "/admin/gateways"],
    ["Customers", counts.customers, "people", "/admin/customers"],
    ["Invoices", counts.bills, "file", "/admin/invoices"],
    ["Payment links", counts.links, "link", "/admin/payment-links"],
    ["API keys", counts.keys, "key", "/admin/api-keys"],
    ["Devices online", counts.online, "phone", "/admin/sms-gateway"],
  ] as const;

  return (
    <div className="dash">
      <header className="dash-top">
        <div>
          <p className="dash-live"><i /> Live desk</p>
          <h2>Dashboard</h2>
          <p>{todayLabel}</p>
        </div>
        <Link className="btn" href="/admin/reports">Financial reports</Link>
      </header>
      {error ? <p className="error">{error}</p> : null}

      <section className="dash-hero">
        <article>
          <span className="dash-icon"><Icon name="wallet" /></span>
          <p>Paid volume</p>
          <Taka value={Number(summary?.volume ?? 0)} ready={ready} />
          <small>All completed payments</small>
        </article>
        <article>
          <span className="dash-icon"><Icon name="sun" /></span>
          <p>Today</p>
          <Taka value={today} ready={ready} />
          <small>{ready ? `${report?.today?.completed ?? 0} payments` : "Loading"}</small>
        </article>
        <article>
          <span className="dash-icon"><Icon name="calendar" /></span>
          <p>This month</p>
          <Taka value={month} ready={ready} />
          <small>{ready ? `${report?.this_month?.completed ?? 0} payments` : "Loading"}</small>
        </article>
        <article>
          <span className="dash-icon"><Icon name="chart" /></span>
          <p>Conversion</p>
          <strong>{ready ? `${rate}%` : "—"}</strong>
          <small>Paid out of this month's checkouts</small>
        </article>
      </section>

      <section className="dash-tiles">
        {tiles.map(([label, value, icon, href], index) => (
          <Link key={label} href={href} style={{ animationDelay: `${0.12 + index * 0.04}s` }}>
            <span className="dash-icon"><Icon name={icon} /></span>
            <Count value={value} ready={ready} />
            <p>{label}</p>
          </Link>
        ))}
      </section>

      <section className="dash-split">
        <article className="dash-panel">
          <header>
            <h3>Recent payments</h3>
            <Link href="/admin/transactions">View all</Link>
          </header>
          {payments.length === 0 ? <p className="dash-empty">{ready ? "No payments yet" : "Loading payments"}</p> : (
            <ul>
              {payments.map((row) => (
                <li key={row.publicId}>
                  <div>
                    <strong>{row.reference || row.publicId}</strong>
                    <small>{row.method?.label || "No gateway yet"}</small>
                  </div>
                  <span className={`pill ${row.status}`}>{row.status}</span>
                  <b><span className="taka">৳</span>{Number(row.payable).toFixed(2)}</b>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="dash-panel">
          <header>
            <h3>Volume</h3>
            <Link href="/admin/reports">Reports</Link>
          </header>
          <ul className="dash-bars">
            {bars.map(([key, label]) => {
              const amount = Number(report?.[key]?.amount ?? 0);
              const width = ready ? Math.max(amount > 0 ? 8 : 0, (amount / peak) * 100) : 0;
              return (
                <li key={key}>
                  <span>{label}</span>
                  <i><b style={{ width: `${width}%` }} /></i>
                  <em><span className="taka">৳</span>{ready ? money(amount) : "—"}</em>
                </li>
              );
            })}
          </ul>
        </article>
      </section>
    </div>
  );
}
