"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";

type ShopId = "amarpin" | "uniqbd";

type ShopTelegram = {
  orderAlerts: boolean;
  messageAlerts: boolean;
  chatId: string;
  hasBotToken: boolean;
  configured: boolean;
  status: "connected" | "off" | "setup";
};

type TelegramView = {
  shops: Record<ShopId, ShopTelegram>;
};

const SHOPS: Array<{ id: ShopId; label: string; domain: string }> = [
  { id: "amarpin", label: "AuGetway", domain: "amarpin.com" },
  { id: "uniqbd", label: "UniQbd", domain: "uniqbd.com" },
];

export default function TelegramSettingsPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [view, setView] = useState<TelegramView | null>(null);
  const [shop, setShop] = useState<ShopId>("amarpin");
  const [botToken, setBotToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<TelegramView>("/telegram");
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setView(result.data);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, sessionError]);

  const site = SHOPS.find((item) => item.id === shop)!;
  const settings = view?.shops[shop];

  function selectShop(next: ShopId) {
    setShop(next);
    setBotToken("");
    setNotice(null);
    setError(null);
  }

  function patch(partial: Partial<ShopTelegram>) {
    setView((current) => {
      if (!current) return current;
      return {
        shops: {
          ...current.shops,
          [shop]: { ...current.shops[shop], ...partial },
        },
      };
    });
  }

  async function save() {
    if (!settings) return;
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await adminFetch<TelegramView>("/telegram", {
      method: "PATCH",
      body: JSON.stringify({
        shop,
        orderAlerts: settings.orderAlerts,
        messageAlerts: settings.messageAlerts,
        chatId: settings.chatId,
        botToken,
      }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setView(result.data);
    setBotToken("");
    setNotice(`${site.label} Telegram settings saved.`);
  }

  async function sendTest() {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await adminFetch<{ message: string }>("/telegram/test", {
      method: "POST",
      body: JSON.stringify({ shop }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice(result.data.message);
  }

  return (
    <AdminShell title="Telegram" permissions={permissions} bare>
      {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
      {!view || !settings ? (
        <p className="sms-loading">{sessionError ? "" : "Loading Telegram settings…"}</p>
      ) : (
        <div className="sms-page">
          <header className="sms-hero">
            <span className="sms-hero-icon" aria-hidden>
              <span className="sms-ring" />
              <PlaneIcon />
            </span>
            <div>
              <p>Settings</p>
              <h1>Telegram</h1>
              <p>
                New orders are posted as soon as they arrive. A customer live chat or ticket sends one alert every 5 minutes.
              </p>
            </div>
          </header>
          {notice ? <p className="sms-notice">{notice}</p> : null}
          <div className="sms-shops" role="tablist" aria-label="Site">
            {SHOPS.map((item, index) => {
              const itemSettings = view.shops[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={item.id === shop}
                  className={item.id === shop ? "is-on" : ""}
                  style={{ animationDelay: `${index * 80}ms` }}
                  onClick={() => selectShop(item.id)}
                >
                  <span className={`sms-mark sms-mark--${item.id}`} aria-hidden>
                    <span className="sms-ring" />
                    <PlaneIcon />
                  </span>
                  <span>
                    <strong>{item.label}</strong>
                    <em>
                      {item.domain} · {statusLabel(itemSettings.status)}
                    </em>
                  </span>
                </button>
              );
            })}
          </div>

          <section className="sms-overview">
            <header className="sms-card-head">
              <span className="sms-stat-icon" aria-hidden>
                <PlaneIcon />
              </span>
              <div>
                <h2>Telegram overview · {site.label}</h2>
                <p>
                  {settings.configured
                    ? "The bot can post to the saved chat."
                    : "Add a bot token from BotFather and the chat that should receive alerts."}
                </p>
              </div>
            </header>
            <div className="sms-stats">
              <article className={settings.orderAlerts ? "is-success" : "is-brand"}>
                <span className="sms-stat-icon" aria-hidden>
                  <CartIcon />
                </span>
                <div>
                  <span>Orders</span>
                  <strong>{settings.orderAlerts ? "On" : "Off"}</strong>
                  <em>Sent when a checkout is placed</em>
                </div>
              </article>
              <article className={settings.messageAlerts ? "is-success" : "is-brand"}>
                <span className="sms-stat-icon" aria-hidden>
                  <ChatIcon />
                </span>
                <div>
                  <span>Customer messages</span>
                  <strong>{settings.messageAlerts ? "On" : "Off"}</strong>
                  <em>One alert per customer every 5 minutes</em>
                </div>
              </article>
              <article className={settings.hasBotToken ? "is-success" : "is-amber"}>
                <span className="sms-stat-icon" aria-hidden>
                  <KeyIcon />
                </span>
                <div>
                  <span>Bot token</span>
                  <strong>{settings.hasBotToken ? "Saved" : "Missing"}</strong>
                  <em>Kept encrypted</em>
                </div>
              </article>
              <article className={settings.chatId ? "is-success" : "is-amber"}>
                <span className="sms-stat-icon" aria-hidden>
                  <HashIcon />
                </span>
                <div>
                  <span>Chat ID</span>
                  <strong>{settings.chatId || "Not set"}</strong>
                  <em>{site.domain}</em>
                </div>
              </article>
            </div>
          </section>

          <section className="sms-card">
            <header className="sms-card-head">
              <span className="sms-stat-icon" aria-hidden>
                <PlaneIcon />
              </span>
              <div>
                <h2>Alerts · {site.label}</h2>
                <p>Turn each alert on or off. A switch stays off until a bot token and chat ID are saved.</p>
              </div>
              <span className={`sms-pill ${settings.status === "connected" ? "is-on" : ""}`}>{statusLabel(settings.status)}</span>
            </header>
            <label className="gateway-check">
              <input
                type="checkbox"
                checked={settings.orderAlerts}
                onChange={(event) => patch({ orderAlerts: event.target.checked })}
              />
              Order notifications
            </label>
            <label className="gateway-check">
              <input
                type="checkbox"
                checked={settings.messageAlerts}
                onChange={(event) => patch({ messageAlerts: event.target.checked })}
              />
              Customer message notifications
            </label>
            <label className="field">
              Chat ID
              <input
                value={settings.chatId}
                onChange={(event) => patch({ chatId: event.target.value })}
                placeholder="123456789 or @channel"
                autoComplete="off"
              />
            </label>
            <label className="field">
              Bot token {settings.hasBotToken ? "(saved — leave blank to keep)" : ""}
              <input
                type="password"
                value={botToken}
                onChange={(event) => setBotToken(event.target.value)}
                placeholder={settings.hasBotToken ? "••••••••" : "123456789:ABC..."}
                autoComplete="new-password"
              />
            </label>
            <p className="muted-note">
              Create a bot with @BotFather, paste the token, then send the bot a message and put that chat ID here. For a group, add the bot to the group first.
            </p>
            <div className="sms-actions">
              <button type="button" className="primary-btn" disabled={pending} onClick={() => void save()}>
                {pending ? "Working…" : `Save ${site.label}`}
              </button>
              <button
                type="button"
                className="sms-quiet"
                disabled={pending || !settings.hasBotToken || !settings.chatId}
                onClick={() => void sendTest()}
              >
                Send test
              </button>
            </div>
          </section>
        </div>
      )}
    </AdminShell>
  );
}

function statusLabel(status: ShopTelegram["status"]) {
  if (status === "connected") return "Alerts on";
  if (status === "setup") return "Needs setup";
  return "Alerts off";
}

function PlaneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6h2l2 10h9l2-7H8M9 20h.01M18 20h.01" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6h14v9H8l-3 3V6Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="14" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M11 14h9l-2 2 2 2h-3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function HashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4 7 20M17 4l-2 16M4 9h16M5 15h16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
