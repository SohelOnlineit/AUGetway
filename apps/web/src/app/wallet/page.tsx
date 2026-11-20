"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  AccountOverview,
  PublicOrderSummary,
  PublicProfile,
  PublicWallet,
  PublicWalletTransaction,
} from "@amarpin/types";
import { AccountShell, AccountState } from "@/components/account/AccountShell";
import { formatBangladeshDateTime } from "@/lib/datetime";

const PRESETS = [100, 250, 500, 1000];

export default function WalletPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<PublicWallet | null>(null);
  const [transactions, setTransactions] = useState<PublicWalletTransaction[]>([]);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [orders, setOrders] = useState<PublicOrderSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupNote, setTopupNote] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [method, setMethod] = useState("bkash");
  const [account, setAccount] = useState("");
  const [withdrawNote, setWithdrawNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [walletRes, txRes, overviewRes, ordersRes] = await Promise.all([
        fetch("/api/wallet"),
        fetch("/api/wallet/transactions?limit=50"),
        fetch("/api/account/overview"),
        fetch("/api/orders"),
      ]);
      if (cancelled) return;
      if ([walletRes, txRes, overviewRes, ordersRes].some((response) => response.status === 401)) {
        router.replace("/login?next=/wallet");
        return;
      }
      if (!walletRes.ok || !txRes.ok) {
        setError("Unable to load wallet");
        setLoading(false);
        return;
      }
      setWallet((await walletRes.json()) as PublicWallet);
      setTransactions((await txRes.json()) as PublicWalletTransaction[]);
      if (overviewRes.ok) {
        const overview = (await overviewRes.json()) as AccountOverview;
        setProfile(overview.profile);
      }
      if (ordersRes.ok) setOrders((await ordersRes.json()) as PublicOrderSummary[]);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const stats = useMemo(() => summarize(orders), [orders]);

  function submitTopup(event: FormEvent) {
    event.preventDefault();
    const amount = Number(topupAmount);
    if (!Number.isFinite(amount) || amount < 1) {
      setTopupNote("Enter an amount of at least 1.");
      return;
    }
    setTopupNote("Balance top-up is not charged from this screen.");
  }

  function submitWithdraw(event: FormEvent) {
    event.preventDefault();
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount < 1) {
      setWithdrawNote("Enter an amount of at least 1.");
      return;
    }
    if (!account.trim()) {
      setWithdrawNote("Enter the account or mobile number.");
      return;
    }
    setWithdrawNote("Withdrawal requests are not sent from this screen.");
  }

  return (
    <AccountShell title="Wallet" lead="Balance, orders, and account summary.">
      <AccountState loading={loading} error={error}>
        {wallet ? (
          <div className="wallet-page">
            <div className="wallet-main">
              <section className="wallet-card">
                <header>
                  <span><WalletIcon /></span>
                  <div>
                    <h2>Wallet overview</h2>
                    <p>Balance, orders, and account summary</p>
                  </div>
                </header>
                <div className="wallet-stats">
                  <Stat tone="amber" icon={<WalletIcon />} label="Wallet balance" value={taka(wallet.balanceMinor)} meta="Available to spend" />
                  <Stat tone="brand" icon={<BoxIcon />} label="Total orders" value={String(stats.count)} meta="All-time purchases" />
                  <Stat tone="amber" icon={<ReceiptIcon />} label="Total spent" value={taka(stats.spentMinor)} meta={stats.count ? `Across ${stats.count} ${stats.count === 1 ? "order" : "orders"}` : "No purchases yet"} />
                  <Stat tone="success" icon={<CheckIcon />} label="Delivered" value={String(stats.delivered)} meta="Completed deliveries" />
                  <Stat tone="success" icon={<PulseIcon />} label="In progress" value={String(stats.progress)} meta="Pending or processing" />
                  <Stat
                    tone={profile?.emailVerified ? "success" : "amber"}
                    icon={<ShieldIcon />}
                    label="Account status"
                    value={profile?.status.toLowerCase() ?? "active"}
                    meta={profile?.emailVerified ? "Email verified" : "Email not verified"}
                  />
                </div>
                <div className="wallet-links">
                  <Link href="/orders">Order history</Link>
                  <Link href="/products">Browse store</Link>
                </div>
              </section>

              <section className="wallet-card">
                <header>
                  <div>
                    <h2>Transaction history</h2>
                    <p>{transactions.length ? `${transactions.length} ledger entries` : "Credits and debits"}</p>
                  </div>
                </header>
                {transactions.length === 0 ? (
                  <p className="wallet-empty">No transactions yet. Top-ups, purchases, and adjustments will appear here.</p>
                ) : (
                  <div className="wallet-table-wrap">
                    <table className="wallet-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Amount</th>
                          <th>Note</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((tx) => (
                          <tr key={tx.id}>
                            <td>{tx.type === "CREDIT" ? "Credit" : "Debit"}</td>
                            <td className={tx.type === "CREDIT" ? "is-credit" : "is-debit"}>
                              {tx.type === "CREDIT" ? "+" : "−"}
                              {taka(tx.amountMinor)}
                            </td>
                            <td>{tx.description || tx.referenceType || "—"}</td>
                            <td>{formatBangladeshDateTime(tx.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            <aside className="wallet-side">
              <section className="wallet-card">
                <header>
                  <span><WalletIcon /></span>
                  <div>
                    <h2>Add funds</h2>
                    <p>Choose an amount to add</p>
                  </div>
                </header>
                <form onSubmit={submitTopup}>
                  <label>
                    Amount (BDT)
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={topupAmount}
                      placeholder="Enter amount to add"
                      onChange={(event) => setTopupAmount(event.target.value)}
                    />
                  </label>
                  <div className="wallet-presets">
                    {PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={topupAmount === String(preset) ? "is-on" : ""}
                        onClick={() => setTopupAmount(String(preset))}
                      >
                        {preset.toLocaleString("en-US")}
                        <span className="home-card-taka">৳</span>
                      </button>
                    ))}
                  </div>
                  <button type="submit" className="wallet-submit">Pay & add balance</button>
                  {topupNote ? <p className="form-error">{topupNote}</p> : null}
                </form>
              </section>

              <section className="wallet-card">
                <header>
                  <span><DollarIcon /></span>
                  <div>
                    <h2>Request withdrawal</h2>
                    <p>Transfer balance to bKash, Nagad, Rocket, or bank</p>
                  </div>
                </header>
                <form onSubmit={submitWithdraw}>
                  <label>
                    Amount
                    <input
                      type="number"
                      min={1}
                      step="1"
                      value={withdrawAmount}
                      placeholder="Enter amount"
                      onChange={(event) => setWithdrawAmount(event.target.value)}
                    />
                  </label>
                  <label>
                    Payout method
                    <select value={method} onChange={(event) => setMethod(event.target.value)}>
                      <option value="bkash">bKash</option>
                      <option value="nagad">Nagad</option>
                      <option value="rocket">Rocket</option>
                      <option value="bank">Bank</option>
                    </select>
                  </label>
                  <label>
                    Account
                    <input
                      value={account}
                      placeholder="Account or mobile number"
                      onChange={(event) => setAccount(event.target.value)}
                    />
                  </label>
                  <button type="submit" className="wallet-submit">Submit request</button>
                  {withdrawNote ? <p className="form-error">{withdrawNote}</p> : null}
                </form>
              </section>
            </aside>
          </div>
        ) : null}
      </AccountState>
    </AccountShell>
  );
}

function summarize(orders: PublicOrderSummary[]) {
  const spentMinor = orders
    .filter((order) => order.paidAt)
    .reduce((sum, order) => sum + order.totalMinor, 0);
  const delivered = orders.filter((order) => order.status === "FULFILLED" || order.fulfillmentStatus === "COMPLETED").length;
  const progress = orders.filter((order) => order.status === "PENDING_PAYMENT" || order.status === "PAID").length;
  return { count: orders.length, spentMinor, delivered, progress };
}

function taka(minor: number) {
  const major = minor / 100;
  const text = Number.isInteger(major) ? major.toLocaleString("en-US") : major.toFixed(2);
  return (
    <>
      {text}
      <span className="home-card-taka">৳</span>
    </>
  );
}

function Stat({ tone, icon, label, value, meta }: { tone: string; icon: ReactNode; label: string; value: ReactNode; meta: string }) {
  return (
    <article className={`wallet-stat wallet-stat--${tone}`}>
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{meta}</small>
      </div>
    </article>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 10h18M16 14.5h2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3.2 20 7.2v9.6L12 20.8 4 16.8V7.2L12 3.2Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function ReceiptIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M7 3.5h10v17l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2V3.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m8.2 12.2 2.4 2.4 5-5.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M3 12h4l2-5 4 10 2-5h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3.5 19 6.2v5.4c0 4.2-2.8 7.2-7 8.9-4.2-1.7-7-4.7-7-8.9V6.2L12 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function DollarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3.5v17M16 7.5c-.6-1.2-2-2-4-2s-3.2.8-3.2 2.2S10 10 12 10.4s3.6.7 3.6 2.4-1.6 2.4-3.6 2.4-3.4-.8-4-2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
