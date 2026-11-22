"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { pictureDataUrl } from "@/lib/picture";
import { publicOriginForHost, publicPathUrl } from "@/lib/addresses";

type Domain = {
  id: string;
  host: string;
  brandName: string;
  brandLogo: string;
  brandFavicon: string;
  themeAccent: string;
  supportEmail: string;
  supportPhone: string;
  checkoutNote: string;
  active: boolean;
};

type Draft = Omit<Domain, "id"> & { id: string };

const blank: Draft = {
  id: "",
  host: "",
  brandName: "",
  brandLogo: "",
  brandFavicon: "",
  themeAccent: "",
  supportEmail: "",
  supportPhone: "",
  checkoutNote: "",
  active: true,
};

/** Only the fields the server accepts. The list also carries ids and dates, which the server refuses in a save. */
function toDraft(row: Domain): Draft {
  return {
    id: row.id,
    host: row.host,
    brandName: row.brandName,
    brandLogo: row.brandLogo,
    brandFavicon: row.brandFavicon,
    themeAccent: row.themeAccent,
    supportEmail: row.supportEmail,
    supportPhone: row.supportPhone,
    checkoutNote: row.checkoutNote,
    active: row.active,
  };
}

export default function DomainsPage() {
  const [rows, setRows] = useState<Domain[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRows(await api<Domain[]>("/desk/domains"));
    setError("");
    setReady(true);
  }, []);

  useEffect(() => {
    load().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not load the website addresses");
      setReady(true);
    });
  }, [load]);

  function patch(next: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...next } : current));
  }

  async function pick(file: File | undefined, field: "brandLogo" | "brandFavicon") {
    if (!file) return;
    setFormError("");
    try {
      patch({ [field]: await pictureDataUrl(file, field === "brandLogo" ? 480 : 128, field === "brandLogo" ? 1_100_000 : 380_000) });
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not read the picture");
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setFormError("");
    try {
      const { id, ...body } = draft;
      if (id) await api(`/desk/domains/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await api("/desk/domains", { method: "POST", body: JSON.stringify(body) });
      setDraft(null);
      setNotice(id ? "Saved. Visitors on this address now see the new name and logo." : "Address added. Point its DNS and nginx at this server, then open it.");
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: Domain) {
    if (busy) return;
    if (!window.confirm(`Remove ${row.host}? Visitors on that address will then see the desk-wide name and logo.`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/desk/domains/${row.id}`, { method: "DELETE" });
      setNotice("Removed.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sec-page">
      <header className="sec-hero">
        <span className="sec-hero-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z" />
          </svg>
        </span>
        <div>
          <p className="keys-crumb">Desk <span>›</span> Website Domains</p>
          <h2>Website Domains</h2>
          <p className="muted sec-note">
            একটাই ডেস্ক, কয়েকটা ওয়েবসাইট ঠিকানা। কাস্টমার যে ঠিকানা দিয়ে আসে (যেমন pay.uniqbd.com বা pay.amarpin.com),
            সেই ঠিকানার নাম, লোগো, রঙ আর পেমেন্ট লিংক দেখে। Edit চেপে প্রতিটি ঠিকানার লোগো বদলান। খালি ঘর
            Brand &amp; System Settings-এর সাধারণ লোগো ব্যবহার করে। শুধু মূল অ্যাডমিন এই পেজ বদলাতে পারে।
          </p>
        </div>
      </header>

      <section className="card">
        <div className="item">
          <div>
            <strong>Add a website address</strong>
            <p className="muted">Type it like pay.amarpin.com. Its DNS and nginx must point at this server.</p>
          </div>
          <button className="btn" type="button" onClick={() => { setFormError(""); setDraft({ ...blank }); }}>Add address</button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="muted">{notice}</p> : null}
      </section>

      <section className="domain-grid">
        {ready && rows.length > 0
          ? rows.map((row) => {
              const origin = publicOriginForHost(row.host);
              const accent = row.themeAccent || "var(--brand)";
              return (
                <article key={row.id} className={`domain-card ${row.active ? "" : "off"}`}>
                  <div className="domain-preview" style={{ ["--domain-accent" as string]: accent }}>
                    {row.brandLogo ? (
                      <img src={row.brandLogo} alt="" className="domain-preview-logo" />
                    ) : (
                      <span className="domain-preview-fallback">{(row.brandName || row.host).slice(0, 1).toUpperCase()}</span>
                    )}
                    <div>
                      <strong>{row.brandName || <span className="muted">desk-wide name</span>}</strong>
                      <p className="muted">{row.host}</p>
                    </div>
                  </div>
                  <div className="domain-meta">
                    <p>
                      <span className="muted">Status</span> {row.active ? "On" : "Off"}
                    </p>
                    <p>
                      <span className="muted">Customer link</span>{" "}
                      <a href={publicPathUrl("/l/example", row.host)} target="_blank" rel="noreferrer">{origin}/l/…</a>
                    </p>
                    <p>
                      <span className="muted">Logo</span> {row.brandLogo ? "Custom for this address" : "Uses desk-wide logo"}
                    </p>
                  </div>
                  <div className="row domain-actions">
                    <a className="btn-line" href={origin} target="_blank" rel="noreferrer">Open site</a>
                    <button className="btn" type="button" disabled={busy} onClick={() => { setFormError(""); setDraft(toDraft(row)); }}>
                      Change logo / name
                    </button>
                    <button className="btn-line" type="button" disabled={busy} onClick={() => void remove(row)}>Remove</button>
                  </div>
                </article>
              );
            })
          : null}
        {ready && rows.length === 0 && !error ? (
          <div className="keys-empty">
            <div>
              <strong>No website address added yet</strong>
              <p className="muted">Add pay.uniqbd.com and pay.amarpin.com, or set SITE_DOMAINS in the server .env and restart the API.</p>
            </div>
          </div>
        ) : null}
      </section>

      {draft ? (
        <div className="modal-back" onClick={() => !busy && setDraft(null)}>
          <form className="modal set-modal domain-modal" onClick={(event) => event.stopPropagation()} onSubmit={save}>
            <h2>{draft.id ? `Edit ${draft.host || "address"}` : "Add a website address"}</h2>
            <p className="muted">Visitors who open this address see the name and logo you set here.</p>

            <div className="domain-live" style={{ ["--domain-accent" as string]: draft.themeAccent || "var(--brand)" }}>
              {draft.brandLogo ? (
                <img src={draft.brandLogo} alt="" className="domain-preview-logo" />
              ) : (
                <span className="domain-preview-fallback">{(draft.brandName || draft.host || "?").slice(0, 1).toUpperCase()}</span>
              )}
              <div>
                <strong>{draft.brandName || "Desk-wide name"}</strong>
                <p className="muted">{draft.host || "pay.amarpin.com"}</p>
              </div>
            </div>

            <label className="field">
              <span>Website address</span>
              <input value={draft.host} onChange={(event) => patch({ host: event.target.value })} placeholder="pay.amarpin.com" required maxLength={253} autoCapitalize="none" autoComplete="off" />
              <p className="muted">Without https:// and without a path.</p>
            </label>
            <label className="field">
              <span>Name shown to visitors</span>
              <input value={draft.brandName} onChange={(event) => patch({ brandName: event.target.value })} maxLength={60} placeholder="Leave empty to use the desk-wide name" />
            </label>
            <label className="field">
              <span>Logo (checkout, bills, home)</span>
              {draft.brandLogo ? <img src={draft.brandLogo} alt="" className="set-preview" /> : <p className="muted">No custom logo yet — desk-wide logo will show.</p>}
              <input type="file" accept="image/*" onChange={(event) => void pick(event.target.files?.[0], "brandLogo")} />
              {draft.brandLogo ? <button type="button" className="btn-line" onClick={() => patch({ brandLogo: "" })}>Clear — use desk-wide logo</button> : null}
            </label>
            <label className="field">
              <span>Browser tab icon</span>
              {draft.brandFavicon ? <img src={draft.brandFavicon} alt="" className="set-preview" style={{ maxHeight: 32 }} /> : <p className="muted">No custom icon yet.</p>}
              <input type="file" accept="image/*" onChange={(event) => void pick(event.target.files?.[0], "brandFavicon")} />
              {draft.brandFavicon ? <button type="button" className="btn-line" onClick={() => patch({ brandFavicon: "" })}>Clear — use desk-wide icon</button> : null}
            </label>
            <label className="field">
              <span>Main colour</span>
              <input value={draft.themeAccent} onChange={(event) => patch({ themeAccent: event.target.value })} maxLength={7} placeholder="#e11d48" />
            </label>
            <label className="field">
              <span>Support email</span>
              <input type="email" value={draft.supportEmail} onChange={(event) => patch({ supportEmail: event.target.value })} maxLength={120} />
            </label>
            <label className="field">
              <span>Support phone</span>
              <input value={draft.supportPhone} onChange={(event) => patch({ supportPhone: event.target.value })} maxLength={40} />
            </label>
            <label className="field">
              <span>Note on the checkout page</span>
              <textarea rows={3} value={draft.checkoutNote} onChange={(event) => patch({ checkoutNote: event.target.value })} maxLength={400} />
            </label>
            <label className="set-check">
              <input type="checkbox" checked={draft.active} onChange={(event) => patch({ active: event.target.checked })} />
              <span>On (an address that is off shows the desk-wide look)</span>
            </label>
            {formError ? <p className="error">{formError}</p> : null}
            <div className="row">
              <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save logo & name"}</button>
              <button className="btn btn-quiet" type="button" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
