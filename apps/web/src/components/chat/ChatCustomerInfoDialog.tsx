"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { AdminCustomerDetail } from "@amarpin/types";
import { adminFetch, formatMinor } from "@/lib/admin/api";
import { formatBangladeshDate } from "@/lib/datetime";

type Props = {
  customerId: string | null;
  open: boolean;
  onClose: () => void;
  fallback?: {
    displayName?: string;
    email?: string;
    avatarUrl?: string | null;
  };
};

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <path d="M5 12.5l4.2 4.2L19 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function labelize(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function initial(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  return (name.trim()[0] ?? "?").toUpperCase();
}

export function ChatCustomerInfoDialog({ customerId, open, onClose, fallback }: Props) {
  const [customer, setCustomer] = useState<AdminCustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !customerId) {
      setCustomer(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void adminFetch<AdminCustomerDetail>(`/customers/${customerId}`).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setCustomer(null);
        setError(result.message);
      } else {
        setCustomer(result.data);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, customerId]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open || !customerId || typeof document === "undefined") return null;

  const email = customer?.email ?? fallback?.email ?? "";
  const guest = email.endsWith("@guests.amarpin.invalid");
  const displayName =
    customer?.displayName?.trim() ||
    fallback?.displayName?.trim() ||
    (guest ? "Guest" : email.split("@")[0] || "Customer");
  const phone = customer?.phoneMasked?.trim() || "—";
  const roles = customer?.roles?.length ? customer.roles.map(labelize).join(", ") : "—";
  const wallet =
    customer && typeof customer.walletBalanceMinor === "number"
      ? formatMinor(customer.wallet?.balanceMinor ?? customer.walletBalanceMinor, customer.currency || customer.wallet?.currency)
      : "—";
  const joined = customer?.createdAt ? formatBangladeshDate(customer.createdAt) : "—";
  const avatarUrl = customer?.avatarUrl || fallback?.avatarUrl || null;

  async function copyEmail() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return createPortal(
    <div className="live-chat-customer-root" role="dialog" aria-modal="true" aria-labelledby="live-chat-customer-title">
      <button type="button" className="live-chat-customer-backdrop" aria-label="Close customer info" onClick={onClose} />
      <section className="live-chat-customer">
        <header className="live-chat-customer-head">
          <h2 id="live-chat-customer-title">Customer info</h2>
          <button type="button" className="live-chat-icon-btn" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="live-chat-customer-body">
          <div className="live-chat-customer-profile">
            <span className="live-chat-customer-avatar" aria-hidden>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" width={100} height={100} />
              ) : (
                initial(displayName)
              )}
            </span>
            <div className="live-chat-customer-id">
              <p className="live-chat-customer-name">{displayName}</p>
              {email ? (
                <div className="live-chat-customer-email-row">
                  <p>{guest ? "Guest visitor" : email}</p>
                  <button
                    type="button"
                    className={copied ? "is-copied" : undefined}
                    aria-label={copied ? "Email copied" : "Copy email"}
                    title={copied ? "Copied" : "Copy email"}
                    onClick={() => void copyEmail()}
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {loading ? <p className="live-chat-customer-muted">Loading customer…</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
          {customer ? (
            <dl className="live-chat-customer-grid">
              <div>
                <dt>Phone</dt>
                <dd>{phone}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{labelize(customer.status)}</dd>
              </div>
              <div>
                <dt>Roles</dt>
                <dd>{roles}</dd>
              </div>
              <div>
                <dt>Wallet</dt>
                <dd>{wallet}</dd>
              </div>
              <div>
                <dt>Orders</dt>
                <dd>{customer.orderCount}</dd>
              </div>
              <div>
                <dt>Joined</dt>
                <dd>{joined}</dd>
              </div>
              <div>
                <dt>Email verified</dt>
                <dd>{customer.emailVerified ? "Yes" : "No"}</dd>
              </div>
            </dl>
          ) : null}
          {customer?.adminNote?.trim() ? (
            <div className="live-chat-customer-note">
              <p>Admin note</p>
              <p>{customer.adminNote.trim()}</p>
            </div>
          ) : null}
        </div>
        <footer className="live-chat-customer-foot">
          <Link href={`/admin/customers/${customerId}`} className="live-chat-customer-link" onClick={onClose}>
            Open in Customers
          </Link>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
