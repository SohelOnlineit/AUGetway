"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { CheckoutCard } from "@uniqpay/types";

type SortKey = "reference" | "gateway" | "amount" | "status" | "sender" | "trx" | "created";
type StatusFilter = "all" | "pending" | "success" | "failed";
type Dialog = "create" | "edit" | "approve" | "delete" | "wipe" | null;

function tone(status: string) {
  if (status === "paid") return { label: "SUCCESS", kind: "ok" as const };
  if (status === "failed" || status === "expired" || status === "cancelled") {
    return { label: status === "expired" ? "EXPIRED" : "FAILED", kind: "bad" as const };
  }
  return { label: "PENDING", kind: "wait" as const };
}

function gatewayName(label: string) {
  const name = label.trim().split(/\s+/)[0] ?? "";
  return name || label.trim();
}

function gatewayKind(label: string) {
  const value = label.toLowerCase();
  if (value.includes("bkash")) return "bkash";
  if (value.includes("nagad")) return "nagad";
  if (value.includes("rocket")) return "rocket";
  if (value.includes("upay")) return "upay";
  return "plain";
}

function moneyMark(currency: string) {
  if (currency === "BDT") return "৳";
  if (currency === "USD") return "$";
  return `${currency} `;
}

function stamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  let hours = date.getHours();
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const hh = String(hours).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${month}, ${date.getFullYear()} ${hh}:${mm} ${suffix}`;
}

function ago(iso: string) {
  const delta = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(delta)) return "";
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function canApprove(status: string) {
  return status === "open" || status === "waiting" || status === "pending";
}

const BATCH = 12;

export default function TransactionsPage() {
  const [rows, setRows] = useState<CheckoutCard[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [gatewayFilter, setGatewayFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("created");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [shown, setShown] = useState(BATCH);
  const [picked, setPicked] = useState<string[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [current, setCurrent] = useState<CheckoutCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [receipt, setReceipt] = useState<{ label: string; image: string } | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  function load() {
    api<CheckoutCard[]>("/desk/checkouts")
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

  const gateways = useMemo(() => {
    const names = new Set<string>();
    rows.forEach((row) => {
      if (row.method?.label) names.add(gatewayName(row.method.label));
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      const badge = tone(row.status);
      if (statusFilter === "pending" && badge.kind !== "wait") return false;
      if (statusFilter === "success" && badge.kind !== "ok") return false;
      if (statusFilter === "failed" && badge.kind !== "bad") return false;
      if (gatewayFilter !== "all" && gatewayName(row.method?.label ?? "") !== gatewayFilter) return false;
      if (!needle) return true;
      const orderNumber = (row.shopOrder ?? "").replace(/^#/, "");
      const folded = needle.replace(/^#/, "");
      return [orderNumber, row.reference, row.publicId, row.payerAccount ?? "", row.providerRef ?? "", row.method?.label ? gatewayName(row.method.label) : "", row.payable, badge.label]
        .some((value) => value.toLowerCase().includes(folded));
    });
    const factor = dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const text = (left: string, right: string) => left.localeCompare(right) * factor;
      if (sort === "reference") return text(a.reference, b.reference);
      if (sort === "gateway") return text(gatewayName(a.method?.label ?? ""), gatewayName(b.method?.label ?? ""));
      if (sort === "amount") return (Number(a.payable) - Number(b.payable)) * factor;
      if (sort === "status") return text(tone(a.status).label, tone(b.status).label);
      if (sort === "sender") return text(a.payerAccount ?? "", b.payerAccount ?? "");
      if (sort === "trx") return text(a.providerRef ?? "", b.providerRef ?? "");
      return (new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()) * factor;
    });
  }, [rows, query, statusFilter, gatewayFilter, sort, dir]);

  const visible = filtered.slice(0, shown);
  const filterCount = (statusFilter === "all" ? 0 : 1) + (gatewayFilter === "all" ? 0 : 1);
  const pageIds = visible.map((row) => row.publicId);
  const allPicked = pageIds.length > 0 && pageIds.every((id) => picked.includes(id));

  useEffect(() => {
    setShown(BATCH);
  }, [query, statusFilter, gatewayFilter, sort, dir]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !ready || shown >= filtered.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      setShown((count) => Math.min(filtered.length, count + BATCH));
    }, { rootMargin: "320px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready, shown, filtered.length]);

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((currentDir) => (currentDir === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "created" || key === "amount" ? "desc" : "asc");
    }
  }

  function togglePage() {
    setPicked((current) => (allPicked ? current.filter((id) => !pageIds.includes(id)) : [...new Set([...current, ...pageIds])]));
  }

  function toggleRow(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function copyText(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? "" : current)), 1600);
    } catch {
      setError("Could not copy");
    }
  }

  // The list only says that a receipt exists. The picture itself is loaded here, one at a time.
  async function viewReceipt(row: CheckoutCard) {
    setError("");
    try {
      const result = await api<{ receipt: string }>(`/desk/checkouts/${row.publicId}/receipt`);
      if (!result.receipt) {
        setError("This transaction has no receipt picture.");
        return;
      }
      setReceipt({ label: row.shopOrder || row.reference, image: result.receipt });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the receipt");
    }
  }

  async function createRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/desk/checkouts", {
        method: "POST",
        body: JSON.stringify({
          reference: String(form.get("reference") ?? ""),
          amount: Number(form.get("amount") ?? 0),
        }),
      });
      setDialog(null);
      setNote("Transaction created");
      setShown(BATCH);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(`/desk/checkouts/${current.publicId}`, {
        method: "PATCH",
        body: JSON.stringify({
          reference: String(form.get("reference") ?? ""),
          amount: Number(form.get("amount") ?? current.amount),
          payerAccount: String(form.get("payerAccount") ?? ""),
          providerRef: String(form.get("providerRef") ?? ""),
        }),
      });
      setDialog(null);
      setCurrent(null);
      setNote("Transaction updated");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    const form = new FormData(event.currentTarget);
    const providerRef = String(form.get("providerRef") ?? "").trim();
    setBusy(true);
    setError("");
    try {
      await api(`/desk/checkouts/${current.publicId}/confirm`, {
        method: "POST",
        body: JSON.stringify(providerRef ? { providerRef } : {}),
      });
      setDialog(null);
      setCurrent(null);
      setNote("Transaction marked as SUCCESS");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not approve");
    } finally {
      setBusy(false);
    }
  }

  async function removeOne() {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/desk/checkouts/${current.publicId}`, { method: "DELETE" });
      setPicked((list) => list.filter((id) => id !== current.publicId));
      setDialog(null);
      setCurrent(null);
      setNote("Transaction deleted");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  async function removePicked() {
    if (!picked.length || busy) return;
    if (!window.confirm(`Delete ${picked.length} selected transaction${picked.length === 1 ? "" : "s"} permanently? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await api("/desk/checkouts/bulk-delete", { method: "POST", body: JSON.stringify({ ids: picked }) });
      setPicked([]);
      setNote("Selected transactions deleted");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  async function removeAll() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/desk/checkouts/delete-all", { method: "POST", body: "{}" });
      setPicked([]);
      setDialog(null);
      setNote("All transactions deleted");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  function closeDialog() {
    if (busy) return;
    setDialog(null);
    setCurrent(null);
    setError("");
  }

  const amountLocked = current ? current.status !== "open" || current.amount !== current.payable : false;
  const stats = useMemo(() => {
    let pending = 0;
    let success = 0;
    let failed = 0;
    let volume = 0;
    rows.forEach((row) => {
      const badge = tone(row.status);
      if (badge.kind === "ok") {
        success += 1;
        volume += Number(row.payable);
      } else if (badge.kind === "bad") failed += 1;
      else pending += 1;
    });
    return { total: rows.length, pending, success, failed, volume };
  }, [rows]);

  function pickStatus(next: StatusFilter) {
    setStatusFilter((current) => (current === next ? "all" : next));
    setFiltersOpen(false);
  }

  return (
    <div className="txn-page">
      <header className="txn-head">
        <div className="txn-head-copy">
          <span className="txn-hero-ico" aria-hidden="true">
            <svg className="txn-receipt" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 3.5h10a1 1 0 0 1 1 1V20l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2V4.5a1 1 0 0 1 1-1z" />
              <path d="M9 8h6M9 12h6" />
            </svg>
          </span>
          <div>
            <p className="txn-crumb">Desk <span>›</span> Transactions</p>
            <h2>Transactions</h2>
            <p className="muted">Find an AmarPin order and open its payment.</p>
          </div>
        </div>
        <div className="txn-head-actions">
          {picked.length ? (
            <button className="txn-wipe" type="button" onClick={removePicked} disabled={busy}>
              Delete selected ({picked.length})
            </button>
          ) : null}
          <button className="txn-ghost" type="button" onClick={() => { setError(""); setDialog("wipe"); }}>
            <TrashIcon /> Delete all
          </button>
          <button className="txn-new" type="button" onClick={() => { setError(""); setDialog("create"); }}>
            <PlusIcon /> New transaction
          </button>
        </div>
      </header>
      {note ? <p className="txn-note">{note}</p> : null}
      {error && !dialog ? <p className="error">{error}</p> : null}

      <section className="txn-stats">
        <StatCard tone="all" icon="list" label="All" value={stats.total} ready={ready} active={statusFilter === "all"} onClick={() => pickStatus("all")} />
        <StatCard tone="wait" icon="clock" label="Pending" value={stats.pending} ready={ready} active={statusFilter === "pending"} onClick={() => pickStatus("pending")} />
        <StatCard tone="ok" icon="check" label="Success" value={stats.success} ready={ready} active={statusFilter === "success"} onClick={() => pickStatus("success")} />
        <StatCard tone="bad" icon="cross" label="Failed" value={stats.failed} ready={ready} active={statusFilter === "failed"} onClick={() => pickStatus("failed")} />
        <StatCard tone="money" icon="wallet" label="Paid volume" value={stats.volume} ready={ready} money />
      </section>

      <section className="txn-card">
        <div className="txn-tools">
          <label className="txn-search">
            <SearchIcon />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="AmarPin order number, invoice, TrxID" aria-label="Search transactions" />
          </label>
          <div className="txn-filter-wrap">
            <button className="txn-filter" type="button" aria-label="Filter" onClick={() => setFiltersOpen((open) => !open)}>
              <FilterIcon />
              {filterCount ? <span>{filterCount}</span> : null}
            </button>
            {filtersOpen ? (
              <div className="txn-filter-pop">
                <label>
                  <span>Status</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                    <option value="all">All</option>
                    <option value="pending">PENDING</option>
                    <option value="success">SUCCESS</option>
                    <option value="failed">FAILED</option>
                  </select>
                </label>
                <label>
                  <span>Gateway</span>
                  <select value={gatewayFilter} onChange={(event) => setGatewayFilter(event.target.value)}>
                    <option value="all">All</option>
                    {gateways.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
              </div>
            ) : null}
          </div>
        </div>

        <div className="txn-scroll">
          <table className="txn-table">
            <thead>
              <tr>
                <th className="txn-check">
                  <input type="checkbox" checked={allPicked} onChange={togglePage} aria-label="Select loaded payments" />
                </th>
                <SortHead label="Order / Invoice" active={sort === "reference"} dir={dir} onClick={() => toggleSort("reference")} />
                <SortHead label="Gateway" active={sort === "gateway"} dir={dir} onClick={() => toggleSort("gateway")} />
                <SortHead label="Amount" active={sort === "amount"} dir={dir} onClick={() => toggleSort("amount")} />
                <SortHead label="Status" active={sort === "status"} dir={dir} onClick={() => toggleSort("status")} />
                <SortHead label="Sender Number" active={sort === "sender"} dir={dir} onClick={() => toggleSort("sender")} />
                <SortHead label="TrxID" active={sort === "trx"} dir={dir} onClick={() => toggleSort("trx")} />
                <SortHead label="Date & Time" active={sort === "created"} dir={dir} onClick={() => toggleSort("created")} />
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => {
                const badge = tone(row.status);
                const mark = moneyMark(row.currency);
                return (
                  <tr key={row.publicId} style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
                    <td className="txn-check">
                      <input type="checkbox" checked={picked.includes(row.publicId)} onChange={() => toggleRow(row.publicId)} aria-label={`Select ${row.shopOrder || row.reference}`} />
                    </td>
                    <td className="txn-lead" data-label="Order">
                      <div className="txn-order">
                        <span className="txn-row-ico" aria-hidden="true"><ReceiptIcon /></span>
                        <div>
                          <button className="txn-ref" type="button" onClick={() => copyText(row.publicId, row.shopOrder || row.reference)}>
                            {copied === row.publicId ? "Copied" : (row.shopOrder ? `#${row.shopOrder.replace(/^#/, "")}` : row.reference)}
                          </button>
                          <p>Pay ID {row.publicId}</p>
                        </div>
                      </div>
                    </td>
                    <td data-label="Gateway">
                      {row.method?.label ? (
                        <span className={`txn-gw ${gatewayKind(row.method.label)}`}>
                          <BoltIcon /> {gatewayName(row.method.label)}
                        </span>
                      ) : "—"}
                    </td>
                    <td data-label="Amount">
                      <strong className="txn-amt">{mark} {row.payable}</strong>
                      {row.amount !== row.payable ? <p>Base {mark} {row.amount}</p> : null}
                    </td>
                    <td data-label="Status">
                      <span className={`txn-status ${badge.kind}`}>
                        {badge.kind === "ok" ? <CheckIcon /> : badge.kind === "wait" ? <ClockIcon /> : <CrossIcon />}
                        {badge.label}
                      </span>
                    </td>
                    <td className="txn-mono" data-label="Sender">{row.payerAccount || "—"}</td>
                    <td className={row.providerRef ? "txn-trx" : "txn-mono"} data-label="TrxID">{row.providerRef || "—"}</td>
                    <td data-label="Date">
                      <strong className="txn-when">{row.createdAt ? stamp(row.createdAt) : "—"}</strong>
                      {row.createdAt ? <p>{ago(row.createdAt)}</p> : null}
                    </td>
                    <td className="txn-actions">
                      <div className="txn-row-actions">
                        {row.hasReceipt ? (
                          <button type="button" className="txn-go" onClick={() => void viewReceipt(row)}>
                            <ReceiptIcon /> Receipt
                          </button>
                        ) : null}
                        {canApprove(row.status) ? (
                          <button type="button" className="txn-go" onClick={() => { setCurrent(row); setError(""); setDialog("approve"); }}>
                            <CheckIcon /> Approve
                          </button>
                        ) : null}
                        <button type="button" className="txn-go" onClick={() => { setCurrent(row); setError(""); setDialog("edit"); }}>
                          <PencilIcon /> Edit
                        </button>
                        <button type="button" className="txn-drop" aria-label={`Delete ${row.reference}`} onClick={() => { setCurrent(row); setError(""); setDialog("delete"); }}>
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ready && !visible.length ? (
            <div className="txn-empty">
              <span className="fin-ico lg" aria-hidden="true"><ReceiptIcon /></span>
              <strong>{query || filterCount ? "No matches" : "No transactions yet"}</strong>
              <p>{query || filterCount ? "Nothing in this list matches that search." : "Create a transaction and the payment link will show up here."}</p>
            </div>
          ) : null}
          {ready && visible.length < filtered.length ? (
            <div ref={sentinel} className="txn-more">Loading more payments…</div>
          ) : null}
        </div>
      </section>

      {dialog === "create" ? (
        <div className="modal-back txn-shade" onClick={closeDialog}>
          <form className="modal dev-modal txn-dialog" onClick={(event) => event.stopPropagation()} onSubmit={createRow}>
            <div className="dev-modal-head"><div><p className="txn-crumb">Transactions</p><h2>New transaction</h2></div></div>
            <div className="dev-modal-body">
              <label><span>Reference / Invoice</span><input name="reference" required minLength={2} maxLength={80} /></label>
              <label><span>Amount (BDT)</span><input name="amount" type="number" min={1} step="0.01" required /></label>
              {error ? <p className="error">{error}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" onClick={closeDialog}>Cancel</button>
              <button className="txn-new" type="submit" disabled={busy}>Create</button>
            </div>
          </form>
        </div>
      ) : null}

      {dialog === "edit" && current ? (
        <div className="modal-back txn-shade" onClick={closeDialog}>
          <form className="modal dev-modal txn-dialog" onClick={(event) => event.stopPropagation()} onSubmit={saveEdit}>
            <div className="dev-modal-head"><div><p className="txn-crumb">Transactions</p><h2>Edit transaction</h2></div></div>
            <div className="dev-modal-body">
              <label><span>Reference / Invoice</span><input name="reference" required minLength={2} maxLength={80} defaultValue={current.reference} /></label>
              <label>
                <span>Amount (BDT)</span>
                <input name="amount" type="number" min={1} step="0.01" required defaultValue={current.amount} disabled={amountLocked} />
              </label>
              <label><span>Sender number</span><input name="payerAccount" maxLength={11} defaultValue={current.payerAccount ?? ""} placeholder="01XXXXXXXXX" /></label>
              <label><span>Transaction ID</span><input name="providerRef" maxLength={20} defaultValue={current.providerRef ?? ""} placeholder="8N70O2M4RB" /></label>
              {error ? <p className="error">{error}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" onClick={closeDialog}>Cancel</button>
              <button className="txn-new" type="submit" disabled={busy}>Save</button>
            </div>
          </form>
        </div>
      ) : null}

      {dialog === "approve" && current ? (
        <div className="modal-back txn-shade" onClick={closeDialog}>
          <form className="modal dev-modal txn-dialog" onClick={(event) => event.stopPropagation()} onSubmit={approve}>
            <div className="dev-modal-head"><div><p className="txn-crumb">Transactions</p><h2>Approve transaction</h2></div></div>
            <div className="dev-modal-body">
              <p className="txn-copy">Mark {current.reference} as SUCCESS. The customer is notified if a webhook is set.</p>
              <label><span>Transaction ID (optional)</span><input name="providerRef" maxLength={20} defaultValue={current.providerRef ?? ""} placeholder="8N70O2M4RB" /></label>
              {error ? <p className="error">{error}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" onClick={closeDialog}>Cancel</button>
              <button className="txn-new" type="submit" disabled={busy}>Approve</button>
            </div>
          </form>
        </div>
      ) : null}

      {dialog === "delete" && current ? (
        <div className="modal-back txn-shade" onClick={closeDialog}>
          <div className="modal dev-modal txn-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="dev-modal-head"><div><p className="txn-crumb">Transactions</p><h2>Delete transaction</h2></div></div>
            <div className="dev-modal-body">
              <p className="txn-copy">Delete {current.reference} permanently. This cannot be undone.</p>
              {error ? <p className="error">{error}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" onClick={closeDialog}>Cancel</button>
              <button className="txn-wipe" type="button" onClick={removeOne} disabled={busy}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}

      {receipt ? (
        <div className="modal-back txn-shade" onClick={() => setReceipt(null)}>
          <div className="modal dev-modal txn-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="dev-modal-head"><div><p className="txn-crumb">Transactions</p><h2>Receipt · {receipt.label}</h2></div></div>
            <div className="dev-modal-body">
              <img src={receipt.image} alt="Receipt uploaded by the customer" style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 12 }} />
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" onClick={() => setReceipt(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}

      {dialog === "wipe" ? (
        <div className="modal-back txn-shade" onClick={closeDialog}>
          <div className="modal dev-modal txn-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="dev-modal-head"><div><p className="txn-crumb">Transactions</p><h2>Delete all transactions</h2></div></div>
            <div className="dev-modal-body">
              <p className="txn-copy">This permanently deletes every transaction on this desk. It cannot be undone.</p>
              {error ? <p className="error">{error}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" onClick={closeDialog}>Cancel</button>
              <button className="txn-wipe" type="button" onClick={removeAll} disabled={busy}>Yes, delete all</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SortHead({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <th>
      <button type="button" className={active ? "on" : ""} onClick={onClick}>
        {label}
        <i aria-hidden="true">{active ? (dir === "asc" ? "↑" : "↓") : "↕"}</i>
      </button>
    </th>
  );
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

function StatCard({ icon, label, value, ready, money = false, active = false, tone = "all", onClick }: { icon: string; label: string; value: number; ready: boolean; money?: boolean; active?: boolean; tone?: string; onClick?: () => void }) {
  const shown = useCount(value, ready);
  const text = !ready ? "—" : money ? `৳${shown.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : Math.round(shown).toLocaleString("en-US");
  const className = `txn-stat tone-${tone}${active ? " on" : ""}`;
  const body = (
    <>
      <span className={`fin-ico ${icon}`} aria-hidden="true"><StatIcon name={icon} /></span>
      <span>
        <b>{text}</b>
        <small>{label}</small>
      </span>
    </>
  );
  if (!onClick) return <article className={className}>{body}</article>;
  return <button type="button" className={className} onClick={onClick} aria-pressed={active}>{body}</button>;
}

function StatIcon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "clock") return <svg viewBox="0 0 24 24"><circle {...common} cx="12" cy="12" r="8" /><path {...common} d="M12 8v4.5l3 2" /></svg>;
  if (name === "check") return <svg viewBox="0 0 24 24"><circle {...common} cx="12" cy="12" r="8" /><path {...common} d="m8.5 12.2 2.3 2.3 4.7-5" /></svg>;
  if (name === "cross") return <svg viewBox="0 0 24 24"><circle {...common} cx="12" cy="12" r="8" /><path {...common} d="M9 9l6 6M15 9l-6 6" /></svg>;
  if (name === "wallet") return <svg viewBox="0 0 24 24"><path {...common} d="M4 8.5h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path {...common} d="M4 8.5 6 5h11l3 3.5M16 13.5h3" /></svg>;
  return <svg viewBox="0 0 24 24"><path {...common} d="M8 7h11M8 12h11M8 17h11" /><path {...common} d="M5 7h.01M5 12h.01M5 17h.01" /></svg>;
}

function ReceiptIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3.5h10a1 1 0 0 1 1 1V20l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2V4.5a1 1 0 0 1 1-1z" /><path d="M9 8h6M9 12h6" /></svg>;
}

function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>;
}
function TrashIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13" /></svg>;
}
function SearchIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
}
function FilterIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5h16l-6 7v6l-4 2v-8z" /></svg>;
}
function BoltIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>;
}
function CheckIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m5 12 5 5L20 7" /></svg>;
}
function ClockIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></svg>;
}
function CrossIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M7 7l10 10M17 7 7 17" /></svg>;
}
function PencilIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20h4l10-10-4-4L4 16z" /><path d="m13 7 4 4" /></svg>;
}
