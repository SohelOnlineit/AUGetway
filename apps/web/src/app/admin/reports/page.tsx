"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Bucket = { amount: string; completed: number; total: number; successRate: number };
type Report = Record<string, Bucket>;
type RangeKey = "today" | "this_week" | "this_month" | "this_year";

const cards = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["this_week", "This Week"],
  ["last_week", "Last Week"],
  ["this_month", "This Month"],
  ["last_month", "Last Month"],
  ["this_year", "This Year"],
  ["last_year", "Last Year"],
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

function period(key: RangeKey) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  if (key === "this_week") {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  } else if (key === "this_month") {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  } else if (key === "this_year") {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  }
  return `${stamp(start)} - ${stamp(end)}`;
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5V7M16 3.5V7M4 10h16" />
    </svg>
  );
}

export default function ReportsPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState<RangeKey>("this_month");

  useEffect(() => {
    api<Report>("/desk/reports")
      .then(setReport)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load"));
  }, []);

  return (
    <div className="fin">
      <header className="fin-head">
        <div>
          <h2>Financial Reports</h2>
          <p>Real-time transaction volume, gross revenue and conversion metrics</p>
        </div>
        <div className="fin-filters">
          {filters.map((filter) => (
            <button key={filter.key} className={range === filter.key ? "on" : ""} type="button" onClick={() => setRange(filter.key)}>
              <CalendarIcon />
              {filter.label}
            </button>
          ))}
        </div>
      </header>
      <div className="fin-period">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5l3 2" />
        </svg>
        <span>Financial Report Period:</span>
        <strong>{period(range)}</strong>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="fin-grid">
        {cards.map(([key, label]) => {
          const bucket = report?.[key];
          return (
            <article className="fin-card" key={key}>
              <h3>{label}</h3>
              <strong><span className="taka">৳</span>{bucket?.amount ?? "0.00"}</strong>
              <p className="done"><i />{bucket ? bucket.completed : 0} payments completed</p>
              <p className="rate">{bucket ? bucket.successRate : 0}% conversion rate</p>
              <span className="mark" aria-hidden="true"><CalendarIcon /></span>
            </article>
          );
        })}
      </div>
    </div>
  );
}
