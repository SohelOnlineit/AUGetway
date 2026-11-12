"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Bucket = { amount: string; completed: number; total: number; successRate: number };
type Report = Record<string, Bucket>;
type CardKey = (typeof cards)[number][0];
type RangeKey = "today" | "this_week" | "this_month" | "this_year";

const cards = [
  ["today", "Today", "sun"],
  ["yesterday", "Yesterday", "moon"],
  ["this_week", "This Week", "week"],
  ["last_week", "Last Week", "back"],
  ["this_month", "This Month", "calendar"],
  ["last_month", "Last Month", "archive"],
  ["this_year", "This Year", "chart"],
  ["last_year", "Last Year", "history"],
] as const;

const filters: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Daily" },
  { key: "this_week", label: "Weekly" },
  { key: "this_month", label: "Monthly" },
  { key: "this_year", label: "Yearly" },
];

function stamp(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function period(key: CardKey) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let end = new Date(start);
  if (key === "yesterday") {
    start.setDate(start.getDate() - 1);
    end = new Date(start);
  } else if (key === "this_week" || key === "last_week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    if (key === "last_week") start.setDate(start.getDate() - 7);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else if (key === "this_month" || key === "last_month") {
    start.setDate(1);
    if (key === "last_month") start.setMonth(start.getMonth() - 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  } else if (key === "this_year" || key === "last_year") {
    start.setMonth(0, 1);
    if (key === "last_year") start.setFullYear(start.getFullYear() - 1);
    end = new Date(start.getFullYear(), 11, 31);
  }
  if (key === "today" || key === "yesterday") return stamp(start);
  return `${stamp(start)} – ${stamp(end)}`;
}

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

function Mark({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "sun") {
    return (
      <svg viewBox="0 0 24 24">
        <circle {...common} cx="12" cy="12" r="3.4" />
        <path {...common} d="M12 3.2v2.2M12 18.6v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M3.2 12h2.2M18.6 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
      </svg>
    );
  }
  if (name === "moon") return <svg viewBox="0 0 24 24"><path {...common} d="M16 4.2A7.2 7.2 0 1 0 19.8 15 6 6 0 0 1 16 4.2z" /></svg>;
  if (name === "week") return <svg viewBox="0 0 24 24"><rect {...common} x="4" y="5" width="16" height="15" rx="2" /><path {...common} d="M8 3.5V7M16 3.5V7M4 10h16M8 14h.01M12 14h.01M16 14h.01" /></svg>;
  if (name === "back") return <svg viewBox="0 0 24 24"><path {...common} d="M8 8H5.5A6.5 6.5 0 1 1 7 16" /><path {...common} d="M8 4.5 4.5 8 8 11.5" /></svg>;
  if (name === "calendar") return <svg viewBox="0 0 24 24"><rect {...common} x="4" y="5" width="16" height="15" rx="2" /><path {...common} d="M8 3.5V7M16 3.5V7M4 10h16" /></svg>;
  if (name === "archive") return <svg viewBox="0 0 24 24"><path {...common} d="M5 8h14v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" /><path {...common} d="M4 5h16v3H4zM10 12h4" /></svg>;
  if (name === "chart") return <svg viewBox="0 0 24 24"><path {...common} d="M4 19h16M7 16V9M12 16V6M17 16v-4" /></svg>;
  return <svg viewBox="0 0 24 24"><circle {...common} cx="12" cy="12" r="8" /><path {...common} d="M12 8v4.5l3 2" /></svg>;
}

export default function ReportsPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState<RangeKey>("this_month");
  const [focus, setFocus] = useState<CardKey>("this_month");

  useEffect(() => {
    api<Report>("/desk/reports")
      .then(setReport)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load"));
  }, []);

  const ready = report !== null;
  const picked = cards.find(([key]) => key === focus) ?? cards[4];
  const bucket = report?.[focus];
  const amount = Number(bucket?.amount ?? 0);
  const completed = bucket?.completed ?? 0;
  const total = bucket?.total ?? 0;
  const rate = bucket?.successRate ?? 0;
  const peak = Math.max(1, ...cards.map(([key]) => Number(report?.[key]?.amount ?? 0)));

  function choose(key: RangeKey) {
    setRange(key);
    setFocus(key);
  }

  function openCard(key: CardKey) {
    setFocus(key);
    if (key === "today" || key === "this_week" || key === "this_month" || key === "this_year") setRange(key);
  }

  return (
    <div className="fin">
      <header className="ogw-head fin-head">
        <div>
          <p className="ogw-kicker">Reports</p>
          <h2>Financial Reports</h2>
          <p>Paid volume, completed payments, and conversion for each period.</p>
        </div>
        <div className="fin-filters">
          {filters.map((filter) => (
            <button key={filter.key} className={range === filter.key ? "on" : ""} type="button" onClick={() => choose(filter.key)}>
              <span className={`fin-glyph fin-glyph--${filter.key === "today" ? "sun" : filter.key === "this_week" ? "week" : filter.key === "this_month" ? "calendar" : "chart"}`}>
                <Mark name={filter.key === "today" ? "sun" : filter.key === "this_week" ? "week" : filter.key === "this_month" ? "calendar" : "chart"} />
              </span>
              {filter.label}
            </button>
          ))}
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="fin-hero">
        <span className={`fin-ico lg ${picked[2]}`} aria-hidden="true"><Mark name={picked[2]} /></span>
        <div>
          <p className="fin-kicker">{picked[1]}</p>
          <Taka value={amount} ready={ready} />
          <p className="fin-when">{period(focus)}</p>
        </div>
        <div className="fin-metrics">
          <div>
            <b>{ready ? completed.toLocaleString("en-US") : "—"}</b>
            <span>Completed</span>
          </div>
          <div>
            <b>{ready ? total.toLocaleString("en-US") : "—"}</b>
            <span>Checkouts</span>
          </div>
          <div className="fin-rate">
            <svg className="fin-ring" viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="15" />
              <circle cx="18" cy="18" r="15" pathLength="100" strokeDasharray={`${ready ? rate : 0} 100`} />
            </svg>
            <div>
              <b>{ready ? `${rate}%` : "—"}</b>
              <span>Conversion</span>
            </div>
          </div>
        </div>
      </section>

      <div className="fin-grid">
        {cards.map(([key, label, icon], index) => {
          const row = report?.[key];
          const share = Math.round((Number(row?.amount ?? 0) / peak) * 100);
          return (
            <div className="fin-rise" key={key} style={{ animationDelay: `${index * 0.05}s` }}>
              <article className={focus === key ? `fin-card on ${icon}` : `fin-card ${icon}`}>
                <button type="button" onClick={() => openCard(key)} aria-pressed={focus === key}>
                  <span className={`fin-ico ${icon}`} aria-hidden="true"><Mark name={icon} /></span>
                  <span>
                    <h3>{label}</h3>
                    <strong><span className="taka">৳</span>{row?.amount ?? "0.00"}</strong>
                    <p className="done"><i />{row ? row.completed : 0} payments completed</p>
                    <span className="fin-bar" aria-hidden="true"><b style={{ width: ready ? `${share}%` : "0%" }} /></span>
                    <p className="rate">{row ? row.successRate : 0}% conversion rate</p>
                  </span>
                </button>
              </article>
            </div>
          );
        })}
      </div>
    </div>
  );
}
