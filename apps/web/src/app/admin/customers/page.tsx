"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { AdminCustomerDetail, AdminCustomerListItem, AdminCustomerListPage } from "@amarpin/types";
import { CustomerEditor } from "@/components/admin/CustomerEditor";
import { AdminShell } from "@/components/admin/AdminShell";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";
import { formatBangladeshDate, isBangladeshToday } from "@/lib/datetime";

type StatusFilter = "" | "ACTIVE" | "PENDING" | "SUSPENDED";
type BalanceFilter = "" | "with" | "zero";
type AccountKind = "customer" | "administrator";

export default function AdminCustomersPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const canAddAdmin = can(permissions, "admin:users:write");
  const [page, setPage] = useState<AdminCustomerListPage | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [roleFilter, setRoleFilter] = useState("");
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>("");
  const [joinedToday, setJoinedToday] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<AdminCustomerDetail | null>(null);
  const [suspendId, setSuspendId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<AccountKind>("customer");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams({ page: String(pageNumber), pageSize: "20" });
      if (query) params.set("q", query);
      const result = await adminFetch<AdminCustomerListPage>(`/customers?${params.toString()}`);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPage(result.data);
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, pageNumber, query, reloadToken, sessionError]);

  const rows = useMemo(() => {
    const items = page?.items ?? [];
    return items.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (roleFilter && !row.roles.includes(roleFilter)) return false;
      if (balanceFilter === "with" && row.walletBalanceMinor <= 0) return false;
      if (balanceFilter === "zero" && row.walletBalanceMinor > 0) return false;
      if (joinedToday && !isBangladeshToday(row.createdAt)) return false;
      return true;
    });
  }, [balanceFilter, joinedToday, page, roleFilter, statusFilter]);

  const stats = page?.stats;
  const from = page && page.total > 0 ? (page.page - 1) * page.pageSize + 1 : 0;
  const to = page ? Math.min(page.page * page.pageSize, page.total) : 0;
  const allChecked = rows.length > 0 && rows.every((row) => selected.includes(row.id));

  async function openEdit(id: string) {
    const result = await adminFetch<AdminCustomerDetail>(`/customers/${id}`);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEditing(result.data);
  }

  async function deleteCustomer(id: string) {
    const result = await adminFetch(`/customers/${id}`, { method: "DELETE" });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice("Customer deleted.");
    setSelected((current) => current.filter((item) => item !== id));
    setReloadToken((value) => value + 1);
  }

  async function setStatus(row: AdminCustomerListItem, status: string) {
    const result = await adminFetch<AdminCustomerDetail>(`/customers/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setReloadToken((value) => value + 1);
  }

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    const body = JSON.stringify({
      displayName: displayName.trim() || undefined,
      email,
      password,
    });
    const result = await adminFetch<{ email: string }>(kind === "administrator" ? "/staff" : "/customers", {
      method: "POST",
      body,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDisplayName("");
    setEmail("");
    setPassword("");
    setKind("customer");
    setAdding(false);
    setError(null);
    setNotice(
      kind === "administrator"
        ? `${result.data.email} can sign in as an administrator.`
        : `${result.data.email} can sign in as a customer.`,
    );
    setPageNumber(1);
    setReloadToken((value) => value + 1);
  }

  function toggleStat(next: StatusFilter, balance: BalanceFilter = "", today = false) {
    const same = statusFilter === next && balanceFilter === balance && joinedToday === today;
    setStatusFilter(same ? "" : next);
    setBalanceFilter(same ? "" : balance);
    setJoinedToday(same ? false : today);
  }

  return (
    <AdminShell title="Customers" permissions={permissions} bare>
      <div className="customers-page">
        {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
        {notice ? <p className="customers-notice">{notice}</p> : null}
        <section className="customers-card">
          <header className="customers-head">
            <div className="customers-head-copy">
              <span>
                <UsersIcon />
              </span>
              <div>
                <h1>Customer list</h1>
                <p>{page ? `Showing ${from}–${to} of ${page.total} customers` : "Loading customers…"}</p>
              </div>
            </div>
            <button type="button" className="customers-add" onClick={() => { setAdding(true); setError(null); }}>
              Add account
            </button>
          </header>

          {stats ? (
            <div className="customers-stats">
              <Stat label="Total customers" value={String(stats.total)} meta="Registered accounts" tone="brand" on={statusFilter === "" && !joinedToday && balanceFilter === ""} onClick={() => toggleStat("")} icon={<UsersIcon />} />
              <Stat label="Active" value={String(stats.active)} meta="Verified & enabled" tone="success" on={statusFilter === "ACTIVE"} onClick={() => toggleStat("ACTIVE")} icon={<CheckIcon />} />
              <Stat label="Pending" value={String(stats.pending)} meta="Awaiting verification" tone="amber" on={statusFilter === "PENDING"} onClick={() => toggleStat("PENDING")} icon={<PulseIcon />} />
              <Stat label="With balance" value={String(stats.withBalance)} meta={`${taka(stats.walletMinor)} total wallet`} tone="brand" on={balanceFilter === "with"} onClick={() => toggleStat("", "with")} icon={<WalletIcon />} />
              <Stat label="Banned" value={String(stats.suspended)} meta="Blocked from storefront" tone="brand" on={statusFilter === "SUSPENDED"} onClick={() => toggleStat("SUSPENDED")} icon={<ShieldIcon />} />
              <Stat label="Joined today" value={String(stats.joinedToday)} meta="New registrations" tone="brand" on={joinedToday} onClick={() => toggleStat("", "", true)} icon={<GridIcon />} />
            </div>
          ) : null}

          <div className="customers-filters">
            <label>
              <span><SearchIcon /> Search</span>
              <input value={search} placeholder="Email, name or phone..." onChange={(event) => { setSearch(event.target.value); setPageNumber(1); }} />
            </label>
            <label>
              Status
              <FilterMenu
                label="Status"
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
                options={[
                  { value: "", label: "All statuses" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "PENDING", label: "Pending" },
                  { value: "SUSPENDED", label: "Suspended" },
                ]}
              />
            </label>
            <label>
              Role
              <FilterMenu
                label="Role"
                value={roleFilter}
                onChange={setRoleFilter}
                options={[
                  { value: "", label: "All roles" },
                  { value: "CUSTOMER", label: "Customer" },
                  { value: "VIP", label: "VIP" },
                  { value: "RESELLER", label: "Reseller" },
                  { value: "AFFILIATE", label: "Affiliate" },
                  { value: "SUPPLIER", label: "Supplier" },
                  { value: "EDITOR", label: "Editor" },
                  { value: "ADMINISTRATOR", label: "Administrator" },
                ]}
              />
            </label>
            <label>
              Balance
              <FilterMenu
                label="Balance"
                value={balanceFilter}
                onChange={(value) => setBalanceFilter(value as BalanceFilter)}
                options={[
                  { value: "", label: "All balances" },
                  { value: "with", label: "With balance" },
                  { value: "zero", label: "Zero balance" },
                ]}
              />
            </label>
          </div>

          <div className="customers-table-wrap">
            <table className="customers-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={() => setSelected(allChecked ? [] : rows.map((row) => row.id))}
                      aria-label="Select customers on this page"
                    />
                  </th>
                  <th>Customer</th>
                  <th>Roles</th>
                  <th>Status</th>
                  <th>Verified</th>
                  <th>Balance</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(row.id)}
                        onChange={() =>
                          setSelected((current) =>
                            current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id],
                          )
                        }
                        aria-label={`Select ${row.email}`}
                      />
                    </td>
                    <td>
                      <strong>{row.displayName?.trim() || row.email.split("@")[0]}</strong>
                      <small>{row.email}</small>
                      <em>{(row.roles[0] ?? "CUSTOMER").toLowerCase()}</em>
                    </td>
                    <td>{roleLabel(row.roles[0])}</td>
                    <td>
                      <select
                        className={`customers-status customers-status--${row.status.toLowerCase()}`}
                        value={row.status === "DELETED" ? "SUSPENDED" : row.status}
                        onChange={(event) => void setStatus(row, event.target.value)}
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="PENDING">Pending</option>
                        <option value="SUSPENDED">Suspended</option>
                      </select>
                    </td>
                    <td>{row.emailVerified ? "Yes" : "No"}</td>
                    <td>{taka(row.walletBalanceMinor)}</td>
                    <td>{formatBangladeshDate(row.createdAt, true)}</td>
                    <td className="customers-actions">
                      <button type="button" onClick={() => void openEdit(row.id)}>
                        Edit
                      </button>
                      <button type="button" className="is-danger" onClick={() => setSuspendId(row.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {page && page.total > page.pageSize ? (
            <div className="customers-pager">
              <button type="button" disabled={page.page <= 1} onClick={() => setPageNumber((value) => value - 1)}>
                Previous
              </button>
              <span>
                Page {page.page} of {Math.ceil(page.total / page.pageSize)}
              </span>
              <button
                type="button"
                disabled={page.page * page.pageSize >= page.total}
                onClick={() => setPageNumber((value) => value + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </section>
      </div>

      {adding ? (
        <div className="customer-modal" role="presentation" onClick={() => setAdding(false)}>
          <form
            className="customers-create"
            role="dialog"
            aria-modal="true"
            aria-label="Add account"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void createAccount(event)}
          >
            <h2>Add account</h2>
            <p>The password is set here and is not shown again. The account can sign in right away.</p>
            <div className="customers-kind" role="tablist" aria-label="Account type">
              <button type="button" className={kind === "customer" ? "is-on" : ""} onClick={() => setKind("customer")}>
                Customer
              </button>
              {canAddAdmin ? (
                <button type="button" className={kind === "administrator" ? "is-on" : ""} onClick={() => setKind("administrator")}>
                  Administrator
                </button>
              ) : null}
            </div>
            <label>
              Name
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Sohel" maxLength={80} />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@gmail.com" required autoComplete="off" />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required minLength={8} autoComplete="new-password" />
            </label>
            <div className="customers-create-actions">
              <button type="button" onClick={() => setAdding(false)}>Cancel</button>
              <button type="submit" className="customers-add" disabled={saving}>
                {saving ? "Saving…" : kind === "administrator" ? "Add administrator" : "Add customer"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editing ? (
        <div className="customer-modal" role="presentation" onClick={onClose}>
          <div role="dialog" aria-modal="true" aria-label="Edit customer" onClick={(event) => event.stopPropagation()}>
            <CustomerEditor
              customer={editing}
              onClose={() => setEditing(null)}
              onSaved={() => setReloadToken((value) => value + 1)}
            />
          </div>
        </div>
      ) : null}

      {suspendId ? (
        <div className="customer-modal" role="presentation" onClick={() => setSuspendId(null)}>
          <div className="customer-warn" role="alertdialog" aria-modal="true" aria-label="Delete customer" onClick={(event) => event.stopPropagation()}>
            <h2>Delete this customer?</h2>
            <p>The account leaves this list and can no longer sign in. Past orders stay in order history.</p>
            <div>
              <button type="button" onClick={() => setSuspendId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  const id = suspendId;
                  setSuspendId(null);
                  void deleteCustomer(id);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );

  function onClose() {
    setEditing(null);
  }
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
  tone: "brand" | "success" | "amber";
  on: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button type="button" className={`customers-stat customers-stat--${tone}${on ? " is-on" : ""}`} onClick={onClick}>
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{meta}</small>
      </div>
    </button>
  );
}

function roleLabel(role: string | undefined) {
  const labels: Record<string, string> = {
    CUSTOMER: "Customer",
    VIP: "VIP",
    RESELLER: "Reseller",
    AFFILIATE: "Affiliate",
    SUPPLIER: "Supplier",
    EDITOR: "Editor",
    ADMINISTRATOR: "Administrator",
  };
  return labels[role ?? "CUSTOMER"] ?? role;
}

function taka(minor: number) {
  const major = minor / 100;
  const text = Number.isInteger(major)
    ? major.toLocaleString("en-US")
    : major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${text}৳`;
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="8" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.5 17.5c.8-2.2 2.5-3.3 4.5-3.3s3.7 1.1 4.5 3.3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="16" cy="8.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16 14.2c1.7.2 3 1.2 3.6 3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m8.2 12.2 2.4 2.4 5.2-5.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M3 12h4l2-5 3 10 2-5h7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3.5" y="6.5" width="17" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 10h17M15.5 14.2h2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3.5 19 6.2v5.4c0 4.2-2.8 6.8-7 8.4-4.2-1.6-7-4.2-7-8.4V6.2L12 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="4" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="4" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <rect x="4" y="14" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="14" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
