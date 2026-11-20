"use client";

import { useState } from "react";
import type { AdminCustomerDetail, RoleName } from "@amarpin/types";
import { adminFetch } from "@/lib/admin/api";

const ROLE_CARDS: Array<{ role: RoleName | null; label: string; blurb: string }> = [
  { role: null, label: "Shop manager", blurb: "Shop ops without site settings" },
  { role: "CUSTOMER", label: "Customer", blurb: "Browse & purchase" },
  { role: "VIP", label: "VIP", blurb: "Premium storefront" },
  { role: "RESELLER", label: "Reseller", blurb: "API & bulk orders" },
  { role: "AFFILIATE", label: "Affiliate", blurb: "Referral earnings" },
  { role: "SUPPLIER", label: "Supplier", blurb: "Supply inventory" },
  { role: null, label: "Subscriber", blurb: "Newsletter & account" },
  { role: null, label: "Contributor", blurb: "Submit product drafts" },
  { role: null, label: "Author", blurb: "Own product listings" },
  { role: null, label: "Blogger", blurb: "Write blog posts" },
  { role: "EDITOR", label: "Editor", blurb: "Catalog & moderation" },
  { role: "ADMINISTRATOR", label: "Administrator", blurb: "Full admin access" },
];

export function CustomerEditor({
  customer,
  onClose,
  onSaved,
}: {
  customer: AdminCustomerDetail;
  onClose: () => void;
  onSaved: (customer: AdminCustomerDetail) => void;
}) {
  const split = splitName(customer.displayName);
  const [email] = useState(customer.email);
  const [first, setFirst] = useState(split.first);
  const [last, setLast] = useState(split.last);
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState(customer.status === "SUSPENDED" ? "SUSPENDED" : customer.status === "PENDING" ? "PENDING" : "ACTIVE");
  const [verified, setVerified] = useState(customer.emailVerified);
  const [roles, setRoles] = useState<RoleName[]>(customer.roles.filter(isAccountRole));
  const [profileOnly, setProfileOnly] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [subject, setSubject] = useState("Message from AuGetway support");
  const [note, setNote] = useState(customer.adminNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleRole(card: (typeof ROLE_CARDS)[number]) {
    if (!card.role) {
      setProfileOnly((current) =>
        current.includes(card.label) ? current.filter((item) => item !== card.label) : [...current, card.label],
      );
      return;
    }
    setRoles((current) => {
      const next = current.includes(card.role!) ? current.filter((item) => item !== card.role) : [...current, card.role!];
      return next.length ? next : ["CUSTOMER"];
    });
  }

  async function saveProfile() {
    if (password || confirm) {
      if (password !== confirm) {
        setError("Password confirmation does not match.");
        return;
      }
      setError("Password was not changed. Leave both password fields blank.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const displayName = [first?.trim(), last?.trim()].filter(Boolean).join(" ");
    const result = await adminFetch<AdminCustomerDetail>(`/customers/${customer.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        displayName,
        status,
        emailVerified: verified,
        roles: roles.length ? roles : ["CUSTOMER"],
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSaved(result.data);
    const extra = profileOnly.length ? " Shop profiles on this form are not stored on the account." : "";
    setMessage(`Customer saved.${extra}`);
  }

  async function saveNote() {
    setBusy(true);
    setError(null);
    const result = await adminFetch<AdminCustomerDetail>(`/customers/${customer.id}/note`, {
      method: "PATCH",
      body: JSON.stringify({ adminNote: note }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSaved(result.data);
    setMessage("Note saved.");
  }

  return (
    <div className="customer-editor">
      <header>
        <h2>Edit customer</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}
      <section>
        <h3>Customer profile</h3>
        <p>{customer.email}</p>
        <label>
          Email
          <input value={email} readOnly />
        </label>
        <div className="customer-editor-split">
          <label>
            First name
            <input value={first} onChange={(event) => setFirst(event.target.value)} />
          </label>
          <label>
            Last name
            <input value={last} onChange={(event) => setLast(event.target.value)} />
          </label>
        </div>
        <label>
          Phone
          <input
            value={phone}
            placeholder={customer.phoneMasked ? `On file ${customer.phoneMasked}` : "Phone number"}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </label>
        <label className="customer-editor-check">
          <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />
          Email verified
        </label>
        <p className="customer-kicker">Roles</p>
        <p className="customer-editor-help">Tap to assign — customer is kept if no other role is selected.</p>
        <div className="customer-roles">
          {ROLE_CARDS.map((card) => {
            const on = card.role ? roles.includes(card.role) : profileOnly.includes(card.label);
            return (
              <button key={card.label} type="button" className={on ? "is-on" : ""} onClick={() => toggleRole(card)}>
                <strong>{card.label}</strong>
                <small>{card.blurb}</small>
              </button>
            );
          })}
        </div>
      </section>
      <section>
        <label>
          Wallet balance
          <input value={`Current: ${taka(customer.wallet?.balanceMinor ?? customer.walletBalanceMinor)}`} readOnly />
        </label>
        <p className="customer-kicker">Change password</p>
        <p className="customer-editor-help">Leave blank to keep the current password. Minimum 6 characters.</p>
        <label>
          New password
          <span className="customer-secret">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              placeholder="Enter new password"
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
        </label>
        <label>
          Confirm password
          <span className="customer-secret">
            <input
              type={showPassword ? "text" : "password"}
              value={confirm}
              placeholder="Re-enter new password"
              onChange={(event) => setConfirm(event.target.value)}
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
        </label>
        <p className="customer-kicker">Note & email</p>
        <label>
          Email subject
          <input value={subject} onChange={(event) => setSubject(event.target.value)} />
        </label>
        <label>
          Message
          <textarea rows={4} value={note} placeholder="Write a note for this customer..." onChange={(event) => setNote(event.target.value)} />
        </label>
        <div className="customer-editor-notes">
          <button type="button" disabled={busy} onClick={() => void saveNote()}>
            Save note
          </button>
          <button type="button" onClick={() => setError("Email is not sent from this screen.")}>
            Send email
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void saveNote().then(() => setError("Note saved. Email is not sent from this screen."));
            }}
          >
            Save & send
          </button>
        </div>
        <button type="button" className="customer-save" disabled={busy} onClick={() => void saveProfile()}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </section>
    </div>
  );
}

function isAccountRole(role: string): role is RoleName {
  return ["CUSTOMER", "VIP", "RESELLER", "AFFILIATE", "SUPPLIER", "EDITOR", "ADMINISTRATOR"].includes(role);
}

function splitName(name: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: parts[0] ?? "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function taka(minor: number) {
  const major = minor / 100;
  const text = Number.isInteger(major) ? major.toLocaleString("en-US") : major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${text}৳`;
}
