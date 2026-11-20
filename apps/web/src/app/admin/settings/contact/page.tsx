"use client";

import { useEffect, useState } from "react";
import type { PublicContactDetails } from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";

type ShopId = "amarpin" | "uniqbd";

type ContactView = {
  shops: Record<ShopId, PublicContactDetails>;
};

const SHOPS: Array<{ id: ShopId; label: string; domain: string }> = [
  { id: "amarpin", label: "AuGetway", domain: "amarpin.com" },
  { id: "uniqbd", label: "UniQbd", domain: "uniqbd.com" },
];

export default function ContactDetailsPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [view, setView] = useState<ContactView | null>(null);
  const [shop, setShop] = useState<ShopId>("amarpin");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<ContactView>("/contact-details");
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setView(result.data);
      const current = result.data.shops.amarpin;
      setPhone(current.phone);
      setAddress(current.address);
      setWhatsapp(current.whatsapp);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, sessionError]);

  const site = SHOPS.find((item) => item.id === shop)!;
  const saved = view?.shops[shop];

  function selectShop(next: ShopId) {
    if (!view) return;
    const current = view.shops[next];
    setShop(next);
    setPhone(current.phone);
    setAddress(current.address);
    setWhatsapp(current.whatsapp);
    setNotice(null);
    setError(null);
  }

  async function save() {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await adminFetch<ContactView>("/contact-details", {
      method: "PATCH",
      body: JSON.stringify({ shop, phone, address, whatsapp }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setView(result.data);
    const current = result.data.shops[shop];
    setPhone(current.phone);
    setAddress(current.address);
    setWhatsapp(current.whatsapp);
    setNotice(`${site.label} contact details saved.`);
  }

  return (
    <AdminShell title="Contact details" permissions={permissions} bare>
      {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
      {!view || !saved ? (
        <p className="sms-loading">{sessionError ? "" : "Loading contact details…"}</p>
      ) : (
        <div className="sms-page">
          <header className="sms-hero">
            <span className="sms-hero-icon" aria-hidden>
              <span className="sms-ring" />
              <PinIcon />
            </span>
            <div>
              <p>Settings</p>
              <h1>Contact details</h1>
              <p>Mobile number, address, and WhatsApp shown on the Contact page for each site.</p>
            </div>
          </header>
          {notice ? <p className="sms-notice">{notice}</p> : null}
          <div className="sms-shops" role="tablist" aria-label="Site">
            {SHOPS.map((item, index) => (
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
                  <PinIcon />
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <em>{item.domain}</em>
                </span>
              </button>
            ))}
          </div>

          <section className="sms-card">
            <header className="sms-card-head">
              <span className="sms-stat-icon" aria-hidden>
                <PinIcon />
              </span>
              <div>
                <h2>{site.label} contact page</h2>
                <p>A local number such as 017… becomes a WhatsApp link with the 880 country code.</p>
              </div>
            </header>
            <form
              className="sms-editor"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <label className="field">
                Mobile number
                <input value={phone} onChange={(event) => setPhone(event.target.value)} required maxLength={30} />
              </label>
              <label className="field">
                Address
                <textarea value={address} onChange={(event) => setAddress(event.target.value)} required maxLength={300} rows={3} />
              </label>
              <label className="field">
                WhatsApp
                <input
                  value={whatsapp}
                  onChange={(event) => setWhatsapp(event.target.value)}
                  required
                  maxLength={200}
                  placeholder="01777139777 or https://wa.me/8801777139777"
                />
              </label>
              <p className="muted-note">
                Saved WhatsApp link: <a href={saved.whatsappUrl}>{saved.whatsappUrl}</a>
              </p>
              <div className="sms-actions">
                <button type="submit" className="primary-btn" disabled={pending}>
                  {pending ? "Saving…" : "Save contact details"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </AdminShell>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
      <circle cx="12" cy="11" r="1.6" />
    </svg>
  );
}
