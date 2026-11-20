"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type OfficialGateway = {
  id: string;
  provider: string;
  label: string;
  mode: "sandbox" | "live";
  active: boolean;
  username: string;
  merchantId: string;
  merchantNumber: string;
  hasPassword: boolean;
  hasAppKey: boolean;
  hasAppSecret: boolean;
  hasPublicKey: boolean;
  hasPrivateKey: boolean;
};

type ManualGateway = {
  id: string;
  label: string;
  accountNumber: string;
  active: boolean;
  sortOrder: number;
};

const choices = [
  {
    href: "/admin/official-gateways",
    name: "Official Gateway",
    detail: "bKash, Nagad and Rocket merchant APIs",
    tone: "official",
    icon: "shield",
  },
  {
    href: "/admin/gateways/manual",
    name: "Manual Gateway",
    detail: "Account numbers matched from SMS",
    tone: "manual",
    icon: "card",
  },
] as const;

function Icon({ name }: { name: "shield" | "card" | "card-hero" | "key" | "alert" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "shield") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path {...common} d="M12 3.5 19 6.2v5.3c0 4.2-2.8 7.2-7 8.9-4.2-1.7-7-4.7-7-8.9V6.2z" />
        <path {...common} d="m9 12 2 2 4-4.2" />
      </svg>
    );
  }
  if (name === "key") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle {...common} cx="8" cy="14" r="3.2" />
        <path {...common} d="M11 14h9l-2 2M17 14l2-2" />
      </svg>
    );
  }
  if (name === "alert") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle {...common} cx="12" cy="12" r="8" />
        <path {...common} d="M12 8v5M12 16.5h.01" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect {...common} x="3" y="6" width="18" height="12" rx="2" />
      <path {...common} d="M3 10h18" />
    </svg>
  );
}

function apiReady(row: OfficialGateway) {
  if (row.provider === "bkash") return Boolean(row.username && row.hasPassword && row.hasAppKey && row.hasAppSecret);
  if (row.provider === "nagad") return Boolean(row.merchantId && row.merchantNumber && row.hasPublicKey && row.hasPrivateKey);
  if (row.provider === "rocket") return Boolean(row.merchantId && row.hasPassword);
  if (row.provider === "upay" || row.provider === "banglaqr") return Boolean(row.merchantId && row.hasAppKey && row.hasAppSecret);
  return false;
}

function hasAccount(row: ManualGateway) {
  return row.accountNumber.split(/[\s,;]+/).filter(Boolean).length > 0;
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

function Count({ value, ready }: { value: number; ready: boolean }) {
  const shown = useCount(value, ready);
  return <>{ready ? Math.round(shown).toLocaleString("en-US") : "—"}</>;
}

export default function GatewaysPage() {
  const [official, setOfficial] = useState<OfficialGateway[] | null>(null);
  const [manual, setManual] = useState<ManualGateway[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<OfficialGateway[]>("/desk/official-gateways"),
      api<ManualGateway[]>("/desk/methods"),
    ])
      .then(([nextOfficial, nextManual]) => {
        setOfficial(nextOfficial);
        setManual(nextManual);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load gateway info"));
  }, []);

  const ready = official !== null && manual !== null;
  const officialRows = official ?? [];
  const manualRows = [...(manual ?? [])].sort((left, right) => Number(right.active) - Number(left.active) || left.sortOrder - right.sortOrder);
  const officialOn = officialRows.filter((row) => row.active).length;
  const saved = officialRows.filter(apiReady).length;
  const manualOn = manualRows.filter((row) => row.active).length;
  const withAccount = manualRows.filter(hasAccount).length;
  const needNumber = manualRows.length - withAccount;
  const facts = [
    ["Official", officialRows.length, `${officialOn} turned on`, "shield"],
    ["API saved", saved, `${officialRows.length} official`, "key"],
    ["Manual", manualRows.length, `${manualOn} turned on`, "card"],
    ["Need a number", needNumber, `${withAccount} already have an account`, "alert"],
  ] as const;

  return (
    <div className="pgw-page">
      <header className="pgw-hero">
        <span className="pgw-hero-icon" aria-hidden>
          <span className="pgw-ring" />
          <Icon name="card-hero" />
        </span>
        <div>
          <p>Gateways</p>
          <h1>Payment Gateways</h1>
          <p>Official merchant APIs and manual number gateways each keep their own list.</p>
        </div>
      </header>
      <div className="pgw-choices">
        {choices.map((item, index) => (
          <Link key={item.href} href={item.href} className={`pgw-choice pgw-choice--${item.tone}`} style={{ animationDelay: `${index * 80}ms` }}>
            <span className="pgw-mark" aria-hidden>
              <span className="pgw-ring" />
              <Icon name={item.icon} />
            </span>
            <span>
              <strong>{item.name}</strong>
              <em>{item.detail}</em>
            </span>
          </Link>
        ))}
      </div>
      {error ? <p className="error">{error}</p> : null}
      <section className="dash-hero">
        {facts.map(([label, value, note, icon]) => (
          <article key={label}>
            <span className="dash-icon"><Icon name={icon} /></span>
            <p>{label}</p>
            <strong><Count value={value} ready={ready} /></strong>
            <small>{ready ? note : "Loading"}</small>
          </article>
        ))}
      </section>
      <section className="dash-split">
        <article className="dash-panel">
          <header>
            <h3>Official Gateway</h3>
            <Link href="/admin/official-gateways">Open</Link>
          </header>
          {officialRows.length === 0 ? <p className="dash-empty">{ready ? "No official gateways yet" : "Loading gateways"}</p> : (
            <ul>
              {officialRows.map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>{row.label}</strong>
                    <small>{apiReady(row) ? "API saved" : "API needed"}</small>
                  </div>
                  <span className={`pill ${row.mode === "live" ? "paid" : "pending"}`}>{row.mode === "live" ? "Live" : "Sandbox"}</span>
                  <b>{row.active ? "On" : "Off"}</b>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="dash-panel">
          <header>
            <h3>Manual Gateway</h3>
            <Link href="/admin/gateways/manual">Open</Link>
          </header>
          {manualRows.length === 0 ? <p className="dash-empty">{ready ? "No manual gateways yet" : "Loading gateways"}</p> : (
            <ul>
              {manualRows.slice(0, 6).map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>{row.label}</strong>
                    <small>{hasAccount(row) ? row.accountNumber : "No number"}</small>
                  </div>
                  <span className={`pill ${row.active ? "paid" : "open"}`}>{row.active ? "On" : "Off"}</span>
                  <b>{hasAccount(row) ? "Ready" : "Waiting"}</b>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}
