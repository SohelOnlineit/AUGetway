"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { publicPathUrl, useShareHosts } from "@/lib/addresses";

type LinkRow = {
  slug: string;
  title: string;
  detail: string;
  amount: string;
  currency: string;
  active: boolean;
  createdAt: string;
};
type Col = "title" | "amount" | "slug" | "active" | "created";
type SortKey = "title" | "amount" | "created";

const columns: { key: Col; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "amount", label: "Amount" },
  { key: "slug", label: "Slug" },
  { key: "active", label: "Active" },
  { key: "created", label: "Created" },
];

function moneyLabel(currency: string, amount: string) {
  const value = Number(amount);
  const shown = Number.isFinite(value) ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : amount;
  return `${currency || "BDT"} ${shown}`;
}

function stamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  return `${day} ${month}, ${date.getFullYear()}`;
}

export default function LinksPage() {
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("created");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [shown, setShown] = useState<Record<Col, boolean>>({ title: true, amount: true, slug: true, active: true, created: false });
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [focus, setFocus] = useState<"all" | "on" | "off">("all");
  const { hosts, shareHost, setShareHost } = useShareHosts();

  function load() {
    api<LinkRow[]>("/desk/links")
      .then((list) => {
        setRows(list);
        setReady(true);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load"));
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(""), 4000);
    return () => window.clearTimeout(timer);
  }, [note]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (focus === "on" && !row.active) return false;
      if (focus === "off" && row.active) return false;
      if (!needle) return true;
      return [row.title, row.slug, row.amount, row.currency, row.detail].some((value) => value.toLowerCase().includes(needle));
    });
    const factor = dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title) * factor;
      if (sort === "amount") return (Number(a.amount) - Number(b.amount)) * factor;
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * factor;
    });
  }, [rows, query, sort, dir, focus]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const pageSlugs = visible.map((row) => row.slug);
  const allPicked = pageSlugs.length > 0 && pageSlugs.every((slug) => picked.includes(slug));
  const visibleCols = columns.filter((column) => shown[column.key]);

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "title" ? "asc" : "desc");
    }
  }

  function togglePage() {
    setPicked((current) => (allPicked ? current.filter((slug) => !pageSlugs.includes(slug)) : [...new Set([...current, ...pageSlugs])]));
  }

  async function copyLink(slug: string) {
    const url = publicPathUrl(`/l/${slug}`, shareHost || undefined);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(slug);
      setNote(`Copied ${url}`);
      window.setTimeout(() => setCopied((current) => (current === slug ? "" : current)), 1400);
    } catch {
      setError("Could not copy");
    }
  }

  async function toggleActive(row: LinkRow) {
    const next = !row.active;
    setRows((current) => current.map((item) => (item.slug === row.slug ? { ...item, active: next } : item)));
    try {
      await api(`/desk/links/${row.slug}`, { method: "PATCH", body: JSON.stringify({ active: next }) });
    } catch (cause) {
      setRows((current) => current.map((item) => (item.slug === row.slug ? { ...item, active: row.active } : item)));
      setError(cause instanceof Error ? cause.message : "Could not update");
    }
  }

  async function removePicked() {
    if (!picked.length || busy) return;
    if (!window.confirm(`Delete ${picked.length} selected payment link${picked.length === 1 ? "" : "s"}? Customers who have the link will no longer open it.`)) return;
    setBusy(true);
    setError("");
    try {
      await api("/desk/links/bulk-delete", { method: "POST", body: JSON.stringify({ ids: picked }) });
      setPicked([]);
      setNote("Selected links deleted");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  const pages = pageButtons(safePage, pageCount);
  const stats = useMemo(() => {
    const active = rows.filter((row) => row.active);
    const value = active.reduce((sum, row) => sum + ((row.currency || "BDT") === "BDT" ? Number(row.amount) || 0 : 0), 0);
    return { total: rows.length, active: active.length, off: rows.length - active.length, value };
  }, [rows]);

  function pick(next: "all" | "on" | "off") {
    setFocus((current) => (current === next && next !== "all" ? "all" : next));
    setPage(1);
  }

  return (
    <div className="pl-page">
      <header className="pl-head">
        <div className="pl-head-copy">
          <span className="pl-hero-ico" aria-hidden="true">
            <svg className="pl-chain" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
              <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" />
            </svg>
          </span>
          <div>
            <p className="pl-crumb">Desk <span>›</span> Payment Links</p>
            <h2>Payment Links</h2>
            <p className="muted">Share a link and collect a payment without opening a new invoice. The customer sees the logo of the website address you copy.</p>
          </div>
        </div>
        <div className="pl-head-actions">
          {hosts.length > 1 ? (
            <label className="pl-share-host">
              <span>Copy / open on</span>
              <select value={shareHost} onChange={(event) => setShareHost(event.target.value)} aria-label="Website address for customer links">
                {hosts.map((row) => (
                  <option key={row.host} value={row.host}>{row.brandName} ({row.host})</option>
                ))}
              </select>
            </label>
          ) : null}
          {picked.length ? (
            <button className="pl-drop" type="button" onClick={removePicked} disabled={busy}>Delete selected ({picked.length})</button>
          ) : null}
          <Link className="pl-new" href="/admin/payment-links/create"><PlusIcon /> New payment link</Link>
        </div>
      </header>
      {note ? <p className="pl-note">{note}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <section className="pl-stats">
        <StatCard icon="link" label="All" value={stats.total} ready={ready} active={focus === "all"} onClick={() => pick("all")} />
        <StatCard icon="check" label="Active" value={stats.active} ready={ready} active={focus === "on"} onClick={() => pick("on")} />
        <StatCard icon="pause" label="Inactive" value={stats.off} ready={ready} active={focus === "off"} onClick={() => pick("off")} />
        <StatCard icon="wallet" label="Active value" value={stats.value} ready={ready} money />
      </section>

      <section className="pl-card">
        <div className="pl-tools">
          <label className="pl-search">
            <SearchIcon />
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search" aria-label="Search payment links" />
          </label>
          <div className="pl-cols-wrap">
            <button className="pl-cols" type="button" aria-label="Columns" onClick={() => setColumnsOpen((open) => !open)}>
              <ColsIcon />
            </button>
            {columnsOpen ? (
              <div className="pl-menu">
                {columns.map((column) => (
                  <label key={column.key}>
                    <input
                      type="checkbox"
                      checked={shown[column.key]}
                      onChange={() => setShown((current) => ({ ...current, [column.key]: !current[column.key] }))}
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="pl-scroll">
          <table className="pl-table">
            <thead>
              <tr>
                <th className="pl-check">
                  <input type="checkbox" checked={allPicked} onChange={togglePage} aria-label="Select this page" />
                </th>
                {visibleCols.map((column) => (
                  <th key={column.key}>
                    {column.key === "title" || column.key === "amount" || column.key === "created" ? (
                      <button type="button" className={sort === column.key ? "on" : ""} onClick={() => toggleSort(column.key as SortKey)}>
                        {column.label}
                        <i aria-hidden="true">{sort === column.key ? (dir === "asc" ? "↑" : "↓") : "↕"}</i>
                      </button>
                    ) : column.label}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => (
                <tr key={row.slug} style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
                  <td className="pl-check">
                    <input
                      type="checkbox"
                      checked={picked.includes(row.slug)}
                      onChange={() => setPicked((current) => (current.includes(row.slug) ? current.filter((slug) => slug !== row.slug) : [...current, row.slug]))}
                      aria-label={`Select ${row.title}`}
                    />
                  </td>
                  {shown.title ? (
                    <td className="pl-title">
                      <span className="pl-row-ico" aria-hidden="true"><LinkMark /></span>
                      <span>{row.title}</span>
                    </td>
                  ) : null}
                  {shown.amount ? <td className="pl-amt">{moneyLabel(row.currency, row.amount)}</td> : null}
                  {shown.slug ? (
                    <td>
                      <button className="pl-slug" type="button" title={publicPathUrl(`/l/${row.slug}`, shareHost || undefined)} onClick={() => copyLink(row.slug)}>
                        {copied === row.slug ? "Copied" : row.slug}
                      </button>
                    </td>
                  ) : null}
                  {shown.active ? (
                    <td>
                      <button className={`pl-on ${row.active ? "on" : ""}`} type="button" aria-label={row.active ? "Turn off" : "Turn on"} onClick={() => toggleActive(row)}>
                        {row.active ? <CheckIcon /> : <CircleIcon />}
                      </button>
                    </td>
                  ) : null}
                  {shown.created ? <td className="pl-when">{stamp(row.createdAt)}</td> : null}
                  <td className="pl-actions">
                    <a className="pl-go" href={publicPathUrl(`/l/${row.slug}`, shareHost || undefined)} target="_blank" rel="noreferrer">
                      <OpenIcon /> Open Link
                    </a>
                    <Link className="pl-go" href={`/admin/payment-links/${row.slug}/edit`}>
                      <PencilIcon /> Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {ready && !visible.length ? (
            <div className="pl-empty">
              <span className="fin-ico lg" aria-hidden="true"><LinkMark /></span>
              <strong>{query || focus !== "all" ? "No matches" : "No payment links yet"}</strong>
              <p>{query || focus !== "all" ? "Nothing in this list matches that view." : "Create a link and share it with a customer."}</p>
            </div>
          ) : null}
        </div>

        <footer className="pl-foot">
          <span>Showing {filtered.length ? start + 1 : 0} to {Math.min(start + pageSize, filtered.length)} of {filtered.length} results</span>
          <label>
            Per page
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Rows per page">
              {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <div className="pl-pages">
            <button type="button" aria-label="Previous page" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</button>
            {pages.map((item, index) => (
              item === "…" ? <span key={`gap-${index}`}>…</span> : (
                <button key={item} type="button" className={item === safePage ? "on" : ""} onClick={() => setPage(item)}>{item}</button>
              )
            ))}
            <button type="button" aria-label="Next page" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>›</button>
          </div>
        </footer>
      </section>

    </div>
  );
}

function pageButtons(page: number, count: number) {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1);
  const keep = new Set([1, 2, 3, count - 1, count, page - 1, page, page + 1]);
  const numbers = [...keep].filter((number) => number >= 1 && number <= count).sort((a, b) => a - b);
  const items: Array<number | "…"> = [];
  numbers.forEach((number, index) => {
    if (index > 0 && number - numbers[index - 1] > 1) items.push("…");
    items.push(number);
  });
  return items;
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

function StatCard({ icon, label, value, ready, money = false, active = false, onClick }: { icon: string; label: string; value: number; ready: boolean; money?: boolean; active?: boolean; onClick?: () => void }) {
  const shown = useCount(value, ready);
  const text = !ready ? "—" : money ? `৳${shown.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : Math.round(shown).toLocaleString("en-US");
  const body = (
    <>
      <span className={`pl-ico ${icon}`} aria-hidden="true"><StatIcon name={icon} /></span>
      <span>
        <strong>{text}</strong>
        <small>{label}</small>
      </span>
    </>
  );
  if (!onClick) return <article className={`pl-stat ${icon}`}>{body}</article>;
  return <button type="button" className={active ? `pl-stat on ${icon}` : `pl-stat ${icon}`} onClick={onClick} aria-pressed={active}>{body}</button>;
}

function StatIcon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "check") return <svg viewBox="0 0 24 24"><circle {...common} cx="12" cy="12" r="8" /><path {...common} d="m8.5 12.2 2.3 2.3 4.7-5" /></svg>;
  if (name === "pause") return <svg viewBox="0 0 24 24"><circle {...common} cx="12" cy="12" r="8" /><path {...common} d="M10 9v6M14 9v6" /></svg>;
  if (name === "wallet") return <svg viewBox="0 0 24 24"><path {...common} d="M4 8.5h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path {...common} d="M4 8.5 6 5h11l3 3.5M16 13.5h3" /></svg>;
  return <svg viewBox="0 0 24 24"><path {...common} d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path {...common} d="M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" /></svg>;
}

function LinkMark() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" /></svg>;
}

function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>;
}

function SearchIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
}
function ColsIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="5" width="3.2" height="14" rx="1" /><rect x="10.4" y="5" width="3.2" height="14" rx="1" /><rect x="16.8" y="5" width="3.2" height="14" rx="1" /></svg>;
}
function CheckIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></svg>;
}
function CircleIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /></svg>;
}
function OpenIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 5h5v5" /><path d="M19 5 10 14" /><path d="M19 13v6H5V5h6" /></svg>;
}
function PencilIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20h4l10-10-4-4L4 16z" /><path d="m13 7 4 4" /></svg>;
}
