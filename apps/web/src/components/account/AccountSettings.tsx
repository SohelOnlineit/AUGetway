"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { AccountOverview, PublicNotificationPreference, PublicProfile } from "@amarpin/types";
import { AccountShell, AccountState } from "@/components/account/AccountShell";
import { ProfilePhoto } from "@/components/account/ProfilePhoto";
import { formatPointsWorth } from "@/lib/points";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "appearance", label: "Appearance" },
  { id: "devices", label: "Devices" },
  { id: "notifications", label: "Notifications" },
  { id: "kyc", label: "KYC" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const CARDS: Array<{
  id: TabId;
  kicker: string;
  title: string;
  meta: string;
  icon: "user" | "lock" | "bell" | "shield";
}> = [
  { id: "profile", kicker: "Profile", title: "Identity", meta: "Name, photo, contact", icon: "user" },
  { id: "security", kicker: "Security", title: "Access", meta: "Password & sessions", icon: "lock" },
  { id: "notifications", kicker: "Alerts", title: "Channels", meta: "Notification preferences", icon: "bell" },
  { id: "kyc", kicker: "KYC", title: "Verify", meta: "Identity documents", icon: "shield" },
];

function isTab(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

function taka(minor: number) {
  const major = minor / 100;
  const whole = Number.isInteger(major);
  return (
    <>
      {major.toLocaleString("en-US", {
        minimumFractionDigits: whole ? 0 : 2,
        maximumFractionDigits: whole ? 0 : 2,
      })}
      <span className="home-card-taka">৳</span>
    </>
  );
}

function countOf(overview: AccountOverview, statuses: AccountOverview["orderStatusSummary"][number]["status"][]) {
  return overview.orderStatusSummary
    .filter((row) => statuses.includes(row.status))
    .reduce((sum, row) => sum + row.count, 0);
}

function titleCase(value: string) {
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function AccountSettings() {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("profile");
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("tab");
    if (isTab(initial)) setTab(initial);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/account/overview");
      if (cancelled) return;
      if (response.status === 401) {
        router.replace("/login?next=/settings");
        return;
      }
      if (!response.ok) {
        setError("Unable to load account settings");
        setLoading(false);
        return;
      }
      setOverview((await response.json()) as AccountOverview);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function choose(next: TabId) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  const totalOrders = overview
    ? overview.orderStatusSummary.reduce((sum, row) => sum + row.count, 0)
    : 0;

  return (
    <AccountShell title="Account overview" bare>
      <AccountState loading={loading} error={error}>
        {overview ? (
          <div className="acct-set">
            <header className="acct-set-head">
              <span className="acct-set-icon" aria-hidden>
                <Glyph name="grid" />
              </span>
              <div>
                <h1>Account overview</h1>
                <p>Your profile, security, and notification settings</p>
              </div>
            </header>

            <div className="acct-set-stats">
              <Stat icon="wallet" tone="gold" label="Wallet balance" value={taka(overview.wallet.balanceMinor)} meta="Top up or withdraw" />
              <Stat icon="box" tone="teal" label="Total orders" value={String(totalOrders)} meta="All-time purchases" />
              <Stat
                icon="receipt"
                tone="gold"
                label="Total spent"
                value={taka(overview.totalSpentMinor ?? 0)}
                meta={totalOrders > 0 ? `Across ${totalOrders} ${totalOrders === 1 ? "order" : "orders"}` : "No purchases yet"}
              />
              <Stat icon="check" tone="green" label="Delivered" value={String(countOf(overview, ["FULFILLED"]))} meta="Completed deliveries" />
              <Stat icon="pulse" tone="green" label="In progress" value={String(countOf(overview, ["PENDING_PAYMENT", "PAID"]))} meta="Pending or processing" />
              <Stat
                icon="shield"
                tone="green"
                label="Account status"
                value={titleCase(overview.profile.status)}
                meta={overview.profile.emailVerified ? "Email verified" : "Email not verified"}
              />
              {overview.pointsEnabled || overview.pointsBalance > 0 ? (
                <Stat icon="points" tone="gold" label="Points" value={overview.pointsBalance.toLocaleString("en-US")} meta={`Worth ${formatPointsWorth(overview.pointsBalance)} · 10 points = 1 taka`} />
              ) : null}
            </div>

            <div className="acct-set-cards">
              {CARDS.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className={tab === card.id ? "is-on" : ""}
                  onClick={() => choose(card.id)}
                >
                  <span aria-hidden>
                    <Glyph name={card.icon} />
                  </span>
                  <small>{card.kicker}</small>
                  <strong>{card.title}</strong>
                  <em>{card.meta}</em>
                </button>
              ))}
            </div>

            <div className="acct-set-sections">
              <p>Sections</p>
              <div role="tablist" aria-label="Account settings sections">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === item.id}
                    className={tab === item.id ? "is-on" : ""}
                    onClick={() => choose(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <section className="acct-set-panel" aria-labelledby="acct-panel-title">
              {tab === "profile" ? (
                <ProfilePanel
                  profile={overview.profile}
                  onUpdated={(profile) => setOverview({ ...overview, profile })}
                />
              ) : null}
              {tab === "security" ? (
                <SecurityPanel
                  email={overview.profile.email}
                  onEmailChanged={(next) =>
                    setOverview({ ...overview, profile: { ...overview.profile, email: next } })
                  }
                />
              ) : null}
              {tab === "appearance" ? <AppearancePanel /> : null}
              {tab === "devices" ? <InfoPanel title="Devices" lead="Active sessions and signed-in devices" body="This browser is signed in to your AuGetway account." /> : null}
              {tab === "notifications" ? <NotificationsPanel /> : null}
              {tab === "kyc" ? <InfoPanel title="KYC verification" lead="Submit identity documents for account verification" body="Identity verification is not required on this account." /> : null}
            </section>
          </div>
        ) : null}
      </AccountState>
    </AccountShell>
  );
}

function ProfilePanel({
  profile,
  onUpdated,
}: {
  profile: PublicProfile;
  onUpdated: (profile: PublicProfile) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, phone }),
    });
    setPending(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
      const msg = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
      setError(msg || "Could not save profile");
      return;
    }
    setMessage("Profile saved");
  }

  return (
    <form onSubmit={(event) => void save(event)}>
      <div className="acct-set-panel-head">
        <span aria-hidden>
          <Glyph name="user" />
        </span>
        <div>
          <h2 id="acct-panel-title">Edit profile</h2>
          <p>Photo, name, contact details, and bio</p>
        </div>
      </div>
      <ProfilePhoto profile={profile} onUpdated={onUpdated} />
      <div className="acct-set-fields">
        <label>
          Display name
          <input value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <label>
          Phone
          <input value={phone} maxLength={32} placeholder="01…" onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label>
          Email (login)
          <input value={profile.email} readOnly disabled />
          <span className="acct-set-hint">Change login email under Security</span>
        </label>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}
      <button type="submit" className="primary-btn" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

function SecurityPanel({
  email,
  onEmailChanged,
}: {
  email: string;
  onEmailChanged: (email: string) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newEmail, setNewEmail] = useState(email);
  const [emailPassword, setEmailPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"password" | "email" | null>(null);

  const [syncedEmail, setSyncedEmail] = useState(email);
  if (syncedEmail !== email) {
    setSyncedEmail(email);
    setNewEmail(email);
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    setPending("password");
    const response = await fetch("/api/account/password", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setPending(null);
    if (!response.ok) {
      setError(await readApiError(response));
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage("Password updated. Use the new password next time you sign in.");
  }

  async function changeEmail(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setPending("email");
    const response = await fetch("/api/account/email", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: emailPassword, newEmail }),
    });
    setPending(null);
    if (!response.ok) {
      setError(await readApiError(response));
      return;
    }
    const profile = (await response.json()) as PublicProfile;
    onEmailChanged(profile.email);
    setEmailPassword("");
    setMessage("Login email updated.");
  }

  return (
    <div className="acct-set-security">
      <div className="acct-set-panel-head">
        <span aria-hidden>
          <Glyph name="lock" />
        </span>
        <div>
          <h2 id="acct-panel-title">Security</h2>
          <p>Change login email or password (customer and admin accounts)</p>
        </div>
      </div>

      <form className="acct-set-fields" onSubmit={(event) => void changePassword(event)}>
        <h3 className="acct-set-subtitle">Change password</h3>
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </label>
        <p className="acct-set-hint">Use any password you like.</p>
        <button type="submit" className="primary-btn" disabled={pending === "password"}>
          {pending === "password" ? "Saving…" : "Update password"}
        </button>
      </form>

      <form className="acct-set-fields" onSubmit={(event) => void changeEmail(event)}>
        <h3 className="acct-set-subtitle">Change login email</h3>
        <label>
          Current email
          <input value={email} readOnly disabled />
        </label>
        <label>
          New email
          <input
            type="email"
            autoComplete="email"
            value={newEmail}
            maxLength={320}
            onChange={(event) => setNewEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Current password (confirm)
          <input
            type="password"
            autoComplete="current-password"
            value={emailPassword}
            onChange={(event) => setEmailPassword(event.target.value)}
            required
          />
        </label>
        <button type="submit" className="primary-btn" disabled={pending === "email"}>
          {pending === "email" ? "Saving…" : "Update email"}
        </button>
      </form>

      <p className="acct-set-hint">
        Forgot password?{" "}
        <Link href="/forgot-password">Reset via email</Link> (requires SMTP in admin email settings).
      </p>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}
    </div>
  );
}

async function readApiError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  if (Array.isArray(payload?.message)) return payload.message.join(", ");
  if (payload?.message) return payload.message;
  return "Request failed";
}

function AppearancePanel() {
  return (
    <div>
      <div className="acct-set-panel-head">
        <span aria-hidden>
          <Glyph name="sun" />
        </span>
        <div>
          <h2 id="acct-panel-title">Appearance</h2>
          <p>Theme mode on this account</p>
        </div>
      </div>
      <ThemeToggle />
    </div>
  );
}

function NotificationsPanel() {
  const [prefs, setPrefs] = useState<PublicNotificationPreference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/account/notification-preferences")
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        setPrefs((await response.json()) as PublicNotificationPreference);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load notification settings");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: PublicNotificationPreference) {
    setPending(true);
    setError(null);
    const response = await fetch("/api/account/notification-preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    setPending(false);
    if (!response.ok) {
      setError("Could not save preferences");
      return;
    }
    setPrefs((await response.json()) as PublicNotificationPreference);
  }

  return (
    <div>
      <div className="acct-set-panel-head">
        <span aria-hidden>
          <Glyph name="bell" />
        </span>
        <div>
          <h2 id="acct-panel-title">Notifications</h2>
          <p>Channels and event alerts</p>
        </div>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {prefs ? (
        <div className="acct-set-checks">
          <label>
            <input
              type="checkbox"
              checked={prefs.inAppEnabled}
              disabled={pending}
              onChange={(event) => void save({ ...prefs, inAppEnabled: event.target.checked })}
            />
            In-app notifications
          </label>
          <label>
            <input
              type="checkbox"
              checked={prefs.emailEnabled}
              disabled={pending}
              onChange={(event) => void save({ ...prefs, emailEnabled: event.target.checked })}
            />
            Email notifications
          </label>
        </div>
      ) : (
        <p className="acct-set-quiet">Loading…</p>
      )}
    </div>
  );
}

function InfoPanel({
  title,
  lead,
  body,
  action,
}: {
  title: string;
  lead: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div>
      <div className="acct-set-panel-head">
        <span aria-hidden>
          <Glyph name="shield" />
        </span>
        <div>
          <h2 id="acct-panel-title">{title}</h2>
          <p>{lead}</p>
        </div>
      </div>
      <p className="acct-set-quiet">{body}</p>
      {action ? <div className="acct-set-action">{action}</div> : null}
    </div>
  );
}

function Stat({
  icon,
  tone,
  label,
  value,
  meta,
}: {
  icon: "wallet" | "box" | "receipt" | "check" | "pulse" | "shield" | "points";
  tone: "gold" | "teal" | "green";
  label: string;
  value: ReactNode;
  meta: string;
}) {
  return (
    <article className={`acct-set-stat is-${tone}`}>
      <span aria-hidden>
        <Glyph name={icon} />
      </span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{meta}</small>
      </div>
    </article>
  );
}

function Glyph({ name }: { name: string }) {
  if (name === "points") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="m12 3 2.2 4.6 5 .7-3.6 3.5.9 5.1L12 14.8 7.5 17l.9-5.1L4.8 8.3l5-.7L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "wallet") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 10h18" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (name === "box") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M4 8 12 4l8 4-8 4-8-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M4 8v8l8 4 8-4V8" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (name === "receipt") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M7 4h10v16l-2-1.2L13 20l-2-1.2L9 20l-2-1.2V4Z" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
        <path d="m8.5 12.2 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "pulse") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M3 12h4l2-4 3 8 2-4h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "user") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5.5 19c1.2-2.6 3.4-4 6.5-4s5.3 1.4 6.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "lock") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <rect x="5" y="10" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 10V8a4 4 0 0 1 8 0v2" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (name === "bell") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M6 16V10a6 6 0 1 1 12 0v6l1.5 2h-15L6 16Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (name === "sun") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "grid") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <rect x="4" y="4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        <rect x="14" y="4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        <rect x="4" y="14" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        <rect x="14" y="14" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
      <path d="M12 3.5 5 6.2v5.3c0 4.2 2.8 7.2 7 8.8 4.2-1.6 7-4.6 7-8.8V6.2L12 3.5Z" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
