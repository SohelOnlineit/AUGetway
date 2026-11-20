"use client";

import { useEffect, useState, type ReactNode } from "react";
import type {
  AdminWalletAccount,
  AdminWalletActivityItem,
  AdminWalletAdjustResult,
  AdminWalletListPage,
} from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";
import { formatBangladeshDateTime } from "@/lib/datetime";

type BalanceFilter = "with" | "zero" | "all";

export default function AdminWalletsPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const canAdjust = can(permissions, "admin:wallet:adjust");
  const [page, setPage] = useState<AdminWalletListPage | null>(null);
  const [activity, setActivity] = useState<AdminWalletActivityItem[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [balance, setBalance] = useState<BalanceFilter>("with");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [picker, setPicker] = useState("");
  const [pickerQuery, setPickerQuery] = useState("");
  const [matches, setMatches] = useState<AdminWalletAccount[]>([]);
  const [selected, setSelected] = useState<AdminWalletAccount | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => setPickerQuery(picker.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [picker]);

  useEffect(() => {
    if (loading || sessionError || !canAdjust) return;
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams({
        page: String(pageNumber),
        pageSize: "12",
        balance,
      });
      if (query) params.set("q", query);
      const [list, feed] = await Promise.all([
        adminFetch<AdminWalletListPage>(`/wallets?${params.toString()}`),
        adminFetch<AdminWalletActivityItem[]>("/wallets/activity"),
      ]);
      if (cancelled) return;
      if (!list.ok) {
        setError(list.message);
        return;
      }
      setPage(list.data);
      setActivity(feed.ok ? feed.data : []);
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [balance, canAdjust, loading, pageNumber, query, reloadToken, sessionError]);

  useEffect(() => {
    if (!canAdjust || pickerQuery.length < 2) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "6",
        balance: "all",
        q: pickerQuery,
      });
      const result = await adminFetch<AdminWalletListPage>(`/wallets?${params.toString()}`);
      if (cancelled || !result.ok) return;
      setMatches(result.data.items);
    })();
    return () => {
      cancelled = true;
    };
  }, [canAdjust, pickerQuery, reloadToken]);

  async function post(type: "CREDIT" | "DEBIT") {
    if (!selected || pending) return;
    const major = Number(amount);
    const amountMinor = Math.round(major * 100);
    if (!Number.isFinite(major) || amountMinor < 1) {
      setError("Enter an amount of at least 0.01.");
      setNotice(null);
      return;
    }
    if (reason.trim().length < 8) {
      setError("Write a reason of at least 8 characters. It is stored on the ledger.");
      setNotice(null);
      return;
    }
    if (type === "DEBIT" && amountMinor > selected.balanceMinor) {
      setError("That debit is larger than the current balance.");
      setNotice(null);
      return;
    }
    setPending(true);
    setNotice(null);
    const result = await adminFetch<AdminWalletAdjustResult>(
      `/customers/${selected.userId}/wallet/adjust`,
      {
        method: "POST",
        body: JSON.stringify({
          type,
          amountMinor,
          reason: reason.trim(),
          idempotencyKey:
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `wallet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
          currency: selected.currency || "BDT",
        }),
      },
    );
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const name = selected.displayName || selected.email;
    const nextBalance = result.data.wallet.balanceMinor;
    setSelected({
      ...selected,
      balanceMinor: nextBalance,
      currency: result.data.wallet.currency,
      updatedAt: result.data.wallet.updatedAt,
      lastTransactionAt: result.data.transaction.createdAt,
    });
    setAmount("");
    setReason("");
    setError(null);
    setNotice(
      `${type === "CREDIT" ? "Added" : "Removed"} ${taka(amountMinor)} ${type === "CREDIT" ? "to" : "from"} ${name}. Balance is now ${taka(nextBalance)}.`,
    );
    setReloadToken((value) => value + 1);
  }

  const stats = page?.stats;
  const from = page && page.total > 0 ? (page.page - 1) * page.pageSize + 1 : 0;
  const to = page ? Math.min(page.page * page.pageSize, page.total) : 0;

  return (
    <AdminShell title="Wallets" permissions={permissions} bare>
      <div className="customers-page wallet-admin">
        {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
        {notice ? <p className="form-success">{notice}</p> : null}
        {!loading && permissions && !canAdjust ? (
          <p className="form-error">Wallet management needs the wallet adjust permission.</p>
        ) : null}

        <section className="customers-card">
          <header className="customers-head">
            <span>
              <WalletIcon />
            </span>
            <div>
              <h1>Wallet ledger</h1>
              <p>Customer balances, staff credits, and the posted ledger. Amounts are Bangladesh taka.</p>
            </div>
          </header>
          {stats ? (
            <div className="customers-stats">
              <Stat label="Held balance" value={taka(stats.totalBalanceMinor)} meta="Sum of customer wallets" tone="brand" icon={<WalletIcon />} />
              <Stat label="With balance" value={String(stats.withBalance)} meta="Accounts above 0৳" tone="success" on={balance === "with"} onClick={() => { setBalance("with"); setPageNumber(1); }} icon={<CheckIcon />} />
              <Stat label="Zero balance" value={String(stats.zeroBalance)} meta={`${stats.accounts} accounts`} tone="amber" on={balance === "zero"} onClick={() => { setBalance("zero"); setPageNumber(1); }} icon={<PulseIcon />} />
              <Stat label="Credits today" value={taka(stats.creditsTodayMinor)} meta="Posted since midnight" tone="success" icon={<PlusIcon />} />
              <Stat label="Debits today" value={taka(stats.debitsTodayMinor)} meta="Posted since midnight" tone="danger" icon={<MinusIcon />} />
              <Stat label="Ledger posts" value={String(stats.postedToday)} meta="Today, Asia/Dhaka" tone="brand" icon={<PulseIcon />} />
            </div>
          ) : (
            <p>Loading wallet dashboard…</p>
          )}
        </section>

        <div className="wallet-admin-grid">
          <section className="customers-card">
            <header className="customers-head">
              <span>
                <UsersIcon />
              </span>
              <div>
                <h1>{balance === "with" ? "Customers with a balance" : balance === "zero" ? "Zero-balance accounts" : "All wallet accounts"}</h1>
                <p>{page ? `Showing ${from}–${to} of ${page.total}` : "Loading accounts…"}</p>
              </div>
            </header>
            <div className="wallet-admin-filters">
              <label>
                Search
                <input
                  value={search}
                  placeholder="Name, email, or account id"
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPageNumber(1);
                  }}
                />
              </label>
              <label>
                Accounts
                <FilterMenu
                  label="Accounts"
                  value={balance}
                  onChange={(value) => {
                    setBalance(value as BalanceFilter);
                    setPageNumber(1);
                  }}
                  options={[
                    { value: "with", label: "With balance" },
                    { value: "all", label: "All accounts" },
                    { value: "zero", label: "Zero balance" },
                  ]}
                />
              </label>
            </div>
            <div className="customers-table-wrap">
              <table className="customers-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Balance</th>
                    <th>Last movement</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(page?.items ?? []).map((row) => (
                    <tr key={row.userId}>
                      <td>
                        <strong>{row.displayName || "Customer"}</strong>
                        <small>{row.email}</small>
                      </td>
                      <td>
                        <span className={`customers-status customers-status--${row.status.toLowerCase()}`}>{row.status}</span>
                      </td>
                      <td>
                        <strong>{taka(row.balanceMinor)}</strong>
                      </td>
                      <td>
                        <small>{row.lastTransactionAt ? formatBangladeshDateTime(row.lastTransactionAt) : "No ledger post"}</small>
                      </td>
                      <td>
                        <div className="customers-actions">
                          <button type="button" onClick={() => setSelected(row)}>Add</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {page && page.items.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        {balance === "with"
                          ? "No customer currently holds a wallet balance."
                          : "No accounts match this view."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="customers-pager">
              <span>Page {page?.page ?? 1}</span>
              <button type="button" disabled={!page || page.page <= 1} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>Previous</button>
              <button type="button" disabled={!page || page.page * page.pageSize >= page.total} onClick={() => setPageNumber((value) => value + 1)}>Next</button>
            </div>
          </section>

          <div className="wallet-admin-side">
            <section className="customers-card">
              <header className="customers-head">
                <span>
                  <PlusIcon />
                </span>
                <div>
                  <h1>Add balance</h1>
                  <p>Posts a credit or debit on the customer ledger. The entry is audited and is not deleted.</p>
                </div>
              </header>
              <label>
                Find customer
                <input
                  value={picker}
                  placeholder="Type at least 2 letters"
                  onChange={(event) => setPicker(event.target.value)}
                />
              </label>
              {matches.length > 0 ? (
                <ul className="wallet-admin-matches">
                  {matches.map((row) => (
                    <li key={row.userId}>
                      <button type="button" onClick={() => { setSelected(row); setMatches([]); setPicker(""); }}>
                        <strong>{row.displayName || row.email}</strong>
                        <small>{row.email} · {taka(row.balanceMinor)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {selected ? (
                <div className="wallet-admin-selected">
                  <strong>{selected.displayName || selected.email}</strong>
                  <small>{selected.email}</small>
                  <em>Current balance {taka(selected.balanceMinor)}</em>
                </div>
              ) : (
                <p className="wallet-admin-help">Choose a customer from search or from the list.</p>
              )}
              <label>
                Amount (taka)
                <input
                  inputMode="decimal"
                  value={amount}
                  placeholder="100"
                  disabled={!selected || pending}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label>
                Reason
                <textarea
                  value={reason}
                  maxLength={500}
                  rows={3}
                  placeholder="Why this balance is changing"
                  disabled={!selected || pending}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <div className="wallet-admin-actions">
                <button type="button" className="is-credit" disabled={!selected || pending} onClick={() => void post("CREDIT")}>
                  {pending ? "Posting…" : "Add balance"}
                </button>
                <button type="button" className="is-debit" disabled={!selected || pending || selected.balanceMinor <= 0} onClick={() => void post("DEBIT")}>
                  Remove balance
                </button>
              </div>
            </section>

            <section className="customers-card">
              <header className="customers-head">
                <span>
                  <PulseIcon />
                </span>
                <div>
                  <h1>Recent ledger</h1>
                  <p>Latest posted credits and debits.</p>
                </div>
              </header>
              {activity.length === 0 ? <p className="wallet-admin-help">No ledger posts yet.</p> : null}
              <ul className="wallet-admin-feed">
                {activity.map((row) => (
                  <li key={row.id}>
                    <div>
                      <strong>{row.displayName || row.email}</strong>
                      <small>{formatBangladeshDateTime(row.createdAt)} · {labelFor(row.referenceType)}</small>
                      {row.description ? <small>{row.description}</small> : null}
                    </div>
                    <em className={row.type === "CREDIT" ? "is-credit" : "is-debit"}>
                      {row.type === "CREDIT" ? "+" : "−"}{taka(row.amountMinor)}
                    </em>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function taka(minor: number) {
  const major = minor / 100;
  const text = Number.isInteger(major)
    ? major.toLocaleString("en-US")
    : major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${text}৳`;
}

function labelFor(referenceType: string | null) {
  if (referenceType === "admin_adjustment") return "Staff adjustment";
  if (!referenceType) return "Ledger";
  return referenceType.replaceAll("_", " ");
}

function Stat({
  label,
  value,
  meta,
  tone,
  on,
  onClick,
  icon,
}: {
  label: string;
  value: string;
  meta: string;
  tone: "brand" | "success" | "amber" | "danger";
  on?: boolean;
  onClick?: () => void;
  icon: ReactNode;
}) {
  const className = `customers-stat customers-stat--${tone}${on ? " is-on" : ""}`;
  if (!onClick) {
    return (
      <div className={className}>
        <span>{icon}</span>
        <div>
          <p>{label}</p>
          <strong>{value}</strong>
          <small>{meta}</small>
        </div>
      </div>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick}>
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{meta}</small>
      </div>
    </button>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8h16v10H4zM4 8l2-3h10M16 13h3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7 1a2.5 2.5 0 1 0 0-5M4 19a5 5 0 0 1 10 0M16 19a4 4 0 0 1 3-3.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 12.5l4 4L18 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12h4l2-5 4 10 2-5h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 6v12M6 12h12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 12h12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
