"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type KeyRow = {
  id: string;
  label: string;
  prefix: string;
  keyType: string;
  abilities: string[];
  webhookUrl: string;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
};
type Col = "name" | "type" | "key" | "abilities" | "expires" | "active";
type SortKey = "name" | "expires";

const columns: { key: Col; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "key", label: "API Key / Public Key" },
  { key: "abilities", label: "Abilities" },
  { key: "expires", label: "Expires at" },
  { key: "active", label: "Active" },
];

function expiryLabel(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function KeysPage() {
  const [rows, setRows] = useState<KeyRow[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [shown, setShown] = useState<Record<Col, boolean>>({
    name: true,
    type: true,
    key: true,
    abilities: true,
    expires: true,
    active: true,
  });
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [seen, setSeen] = useState<Record<string, string>>({});

  useEffect(() => {
    const issued = sessionStorage.getItem("uniqpay_fresh_key");
    if (issued) {
      try {
        const parsed = JSON.parse(issued) as { id: string; token: string };
        if (parsed.id && parsed.token) setSeen({ [parsed.id]: parsed.token });
      } catch {
        setSeen({});
      }
      sessionStorage.removeItem("uniqpay_fresh_key");
    }
    api<KeyRow[]>("/desk/keys")
      .then((list) => {
        setRows(list);
        setReady(true);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load"));
  }, []);

  const visible = columns.filter((column) => shown[column.key]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (!needle) return true;
      const abilities = Array.isArray(row.abilities) ? row.abilities.join(" ") : "";
      return [row.label, row.prefix, abilities, row.keyType].some((value) => value.toLowerCase().includes(needle));
    });
    const factor = dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort === "name") return a.label.localeCompare(b.label) * factor;
      const left = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      const right = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      return (left - right) * factor;
    });
  }, [rows, query, sort, dir]);

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir("asc");
    }
  }

  async function toggleActive(row: KeyRow) {
    const next = !row.active;
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, active: next } : item)));
    try {
      await api(`/desk/keys/${row.id}`, { method: "PATCH", body: JSON.stringify({ active: next }) });
    } catch (cause) {
      setRows((current) => current.map((item) => (item.id === row.id ? { ...item, active: row.active } : item)));
      setError(cause instanceof Error ? cause.message : "Could not update");
    }
  }

  async function copyKey(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("Could not copy the key");
    }
  }

  return (
    <div className="keys-page">
      <section className="keys-card">
        <header className="keys-head">
          <div>
            <p className="keys-crumb">Api Keys <span>›</span> List</p>
            <h2>Api Keys</h2>
          </div>
          <Link className="btn" href="/admin/api-keys/create">New API Key</Link>
        </header>
        <div className="keys-tools">
          <label className="keys-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input value={query} placeholder="Search" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="keys-cols-wrap">
            <button className="keys-cols" type="button" aria-label="Columns" onClick={() => setColumnsOpen((open) => !open)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="5" width="3.2" height="14" rx="1" />
                <rect x="10.4" y="5" width="3.2" height="14" rx="1" />
                <rect x="16.8" y="5" width="3.2" height="14" rx="1" />
              </svg>
            </button>
            {columnsOpen ? (
              <div className="keys-menu">
                {columns.map((column) => (
                  <label
                    key={column.key}
                    onClick={(event) => {
                      event.preventDefault();
                      setShown((current) => ({ ...current, [column.key]: !current[column.key] }));
                    }}
                  >
                    <input type="checkbox" checked={shown[column.key]} readOnly />
                    {column.label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <table className="keys-table">
          <thead>
            <tr>
              {visible.map((column) => (
                <th key={column.key}>
                  {column.key === "name" || column.key === "expires" ? (
                    <button type="button" onClick={() => toggleSort(column.key as SortKey)}>
                      {column.label}
                      <Caret on={sort === column.key} dir={dir} />
                    </button>
                  ) : column.label}
                </th>
              ))}
            </tr>
          </thead>
          {filtered.length > 0 ? (
            <tbody>
              {filtered.map((row) => {
                const secret = seen[row.id] ?? `${row.prefix}…`;
                const abilities = Array.isArray(row.abilities) ? row.abilities : [];
                return (
                  <tr key={row.id}>
                    {shown.name ? <td className="name">{row.label}</td> : null}
                    {shown.type ? (
                      <td>
                        <span className="key-type">Checkout</span>
                      </td>
                    ) : null}
                    {shown.key ? (
                      <td>
                        <button className="key-secret" type="button" onClick={() => copyKey(secret)}>{secret}</button>
                      </td>
                    ) : null}
                    {shown.abilities ? (
                      <td className="key-abilities">{abilities.map((ability) => <span key={ability}>{ability}</span>)}</td>
                    ) : null}
                    {shown.expires ? <td className="muted">{expiryLabel(row.expiresAt)}</td> : null}
                    {shown.active ? (
                      <td>
                        <button className={`switch ${row.active ? "on" : ""}`} type="button" aria-label={row.active ? "Turn off" : "Turn on"} onClick={() => toggleActive(row)}>
                          <span />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          ) : null}
        </table>
        {ready && filtered.length === 0 ? (
          <div className="keys-empty">
            <div>
              <span className="mark">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M8 8l8 8M16 8l-8 8" />
                </svg>
              </span>
              <strong>No api keys</strong>
            </div>
          </div>
        ) : null}
      </section>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

function Caret({ on, dir }: { on: boolean; dir: "asc" | "desc" }) {
  return (
    <svg className={on && dir === "asc" ? "up" : ""} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
