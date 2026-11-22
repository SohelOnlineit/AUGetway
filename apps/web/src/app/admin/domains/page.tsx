"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { pictureDataUrl } from "@/lib/picture";
import { publicOriginForHost } from "@/lib/addresses";

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
  const [query, setQuery] = useState("");

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

  async function savePicture(row: Domain, field: "brandLogo" | "brandFavicon", file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await pictureDataUrl(file, field === "brandLogo" ? 480 : 128, field === "brandLogo" ? 1_100_000 : 380_000);
      await api(`/desk/domains/${row.id}`, { method: "PATCH", body: JSON.stringify({ [field]: data }) });
      setNotice(field === "brandLogo" ? `Logo saved for ${row.host}.` : `Favicon saved for ${row.host}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the picture");
    } finally {
      setBusy(false);
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

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.host} ${row.brandName} ${row.supportEmail}`.toLowerCase().includes(needle));
  }, [rows, query]);
  const liveCount = rows.filter((row) => row.active).length;

  return (
    <div className="wd-page">
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
            Each address keeps its own name, logo and tab icon. Customers see the brand of the site they opened.
          </p>
        </div>
        <button className="btn wd-add" type="button" onClick={() => { setFormError(""); setDraft({ ...blank }); }}>Add address</button>
      </header>

      <section className="wd-stats" aria-label="Domain summary">
        <div className="wd-stat"><strong>{ready ? rows.length : "—"}</strong><span>Addresses</span></div>
        <div className="wd-stat"><strong>{ready ? liveCount : "—"}</strong><span>Live</span></div>
        <div className="wd-stat"><strong>{ready ? rows.filter((row) => row.brandLogo).length : "—"}</strong><span>Custom logos</span></div>
        <div className="wd-stat"><strong>{ready ? rows.filter((row) => row.brandFavicon).length : "—"}</strong><span>Custom icons</span></div>
      </section>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="wd-note">{notice}</p> : null}

      <div className="wd-bar">
        <label className="wd-search">
          <span className="wd-sr">Search addresses</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search address or name" />
        </label>
        <p className="muted">{ready ? `${shown.length} shown` : "Loading…"}</p>
      </div>

      <section className="wd-grid">
        {ready && shown.length > 0
          ? shown.map((row) => {
              const origin = publicOriginForHost(row.host);
              const accent = row.themeAccent || "var(--brand)";
              const name = row.brandName || "Desk-wide name";
              return (
                <article key={row.id} className={`wd-card ${row.active ? "" : "off"}`}>
                  <div className="wd-browser" style={{ ["--domain-accent" as string]: accent }}>
                    <div className="wd-chrome">
                      <i /><i /><i />
                      <span className="wd-tab">
                        {row.brandFavicon ? <img src={row.brandFavicon} alt="" /> : <b>{(row.brandName || row.host).slice(0, 1).toUpperCase()}</b>}
                        {row.host}
                      </span>
                    </div>
                    <div className="wd-stage">
                      {row.brandLogo ? <img src={row.brandLogo} alt="" className="wd-logo" /> : <span className="wd-mark">{(row.brandName || row.host).slice(0, 1).toUpperCase()}</span>}
                      <div>
                        <strong>{name}</strong>
                        <p>{origin.replace(/^https?:\/\//, "")}</p>
                      </div>
                    </div>
                  </div>
                  <div className="wd-card-top">
                    <div>
                      <strong>{name}</strong>
                      <code>{row.host}</code>
                    </div>
                    <span className={row.active ? "wd-pill on" : "wd-pill"}>{row.active ? "Live" : "Off"}</span>
                  </div>
                  <div className="wd-assets">
                    <label className="wd-asset">
                      <span>Logo</span>
                      {row.brandLogo ? <img src={row.brandLogo} alt="" /> : <em>Desk logo</em>}
                      <input type="file" accept="image/*" disabled={busy} onChange={(event) => { void savePicture(row, "brandLogo", event.target.files?.[0]); event.target.value = ""; }} />
                      <small>{row.brandLogo ? "Replace" : "Upload"}</small>
                    </label>
                    <label className="wd-asset">
                      <span>Favicon</span>
                      {row.brandFavicon ? <img src={row.brandFavicon} alt="" /> : <em>Desk icon</em>}
                      <input type="file" accept="image/*,.ico" disabled={busy} onChange={(event) => { void savePicture(row, "brandFavicon", event.target.files?.[0]); event.target.value = ""; }} />
                      <small>{row.brandFavicon ? "Replace" : "Upload"}</small>
                    </label>
                  </div>
                  <footer className="wd-actions">
                    <a href={origin} target="_blank" rel="noreferrer">Open</a>
                    <button type="button" disabled={busy} onClick={() => { setFormError(""); setDraft(toDraft(row)); }}>Edit</button>
                    <button type="button" className="danger" disabled={busy} onClick={() => void remove(row)}>Remove</button>
                  </footer>
                </article>
              );
            })
          : null}
        {ready && rows.length === 0 && !error ? (
          <div className="wd-empty">
            <strong>No website address yet</strong>
            <p className="muted">Add pay.uniqbd.com and pay.amarpin.com, or set SITE_DOMAINS in the server .env and restart the API.</p>
          </div>
        ) : null}
        {ready && rows.length > 0 && shown.length === 0 ? (
          <div className="wd-empty">
            <strong>No matches</strong>
            <p className="muted">Nothing matches “{query.trim()}”.</p>
          </div>
        ) : null}
      </section>

      {draft ? (
        <div className="modal-back" onClick={() => !busy && setDraft(null)}>
          <form className="modal wd-modal" onClick={(event) => event.stopPropagation()} onSubmit={save}>
            <header className="wd-modal-head">
              <div>
                <p className="keys-crumb">Website Domains</p>
                <h2>{draft.id ? `Edit ${draft.host || "address"}` : "Add a website address"}</h2>
              </div>
              <button className="wd-x" type="button" disabled={busy} onClick={() => setDraft(null)} aria-label="Close">×</button>
            </header>
            <div className="wd-modal-body">
              <aside className="wd-live" style={{ ["--domain-accent" as string]: draft.themeAccent || "var(--brand)" }}>
                <div className="wd-chrome">
                  <i /><i /><i />
                  <span className="wd-tab">
                    {draft.brandFavicon ? <img src={draft.brandFavicon} alt="" /> : <b>{(draft.brandName || draft.host || "A").slice(0, 1).toUpperCase()}</b>}
                    {draft.host || "pay.example.com"}
                  </span>
                </div>
                <div className="wd-stage">
                  {draft.brandLogo ? <img src={draft.brandLogo} alt="" className="wd-logo" /> : <span className="wd-mark">{(draft.brandName || draft.host || "?").slice(0, 1).toUpperCase()}</span>}
                  <div>
                    <strong>{draft.brandName || "Desk-wide name"}</strong>
                    <p>{draft.host || "pay.amarpin.com"}</p>
                  </div>
                </div>
                <p className="muted">This is what a visitor sees on this address.</p>
              </aside>
              <div className="wd-fields">
                <label className="field">
                  <span>Website address</span>
                  <input value={draft.host} onChange={(event) => patch({ host: event.target.value })} placeholder="pay.amarpin.com" required maxLength={253} autoCapitalize="none" autoComplete="off" />
                </label>
                <label className="field">
                  <span>Name shown to visitors</span>
                  <input value={draft.brandName} onChange={(event) => patch({ brandName: event.target.value })} maxLength={60} placeholder="Leave empty for the desk-wide name" />
                </label>
                <div className="wd-assets">
                  <label className="wd-asset">
                    <span>Logo</span>
                    {draft.brandLogo ? <img src={draft.brandLogo} alt="" /> : <em>None</em>}
                    <input type="file" accept="image/*" onChange={(event) => void pick(event.target.files?.[0], "brandLogo")} />
                    <small>{draft.brandLogo ? "Replace" : "Upload"}</small>
                  </label>
                  <label className="wd-asset">
                    <span>Favicon</span>
                    {draft.brandFavicon ? <img src={draft.brandFavicon} alt="" /> : <em>None</em>}
                    <input type="file" accept="image/*,.ico" onChange={(event) => void pick(event.target.files?.[0], "brandFavicon")} />
                    <small>{draft.brandFavicon ? "Replace" : "Upload"}</small>
                  </label>
                </div>
                {(draft.brandLogo || draft.brandFavicon) ? (
                  <div className="row">
                    {draft.brandLogo ? <button type="button" className="btn-line" onClick={() => patch({ brandLogo: "" })}>Clear logo</button> : null}
                    {draft.brandFavicon ? <button type="button" className="btn-line" onClick={() => patch({ brandFavicon: "" })}>Clear icon</button> : null}
                  </div>
                ) : null}
                <label className="field">
                  <span>Main colour</span>
                  <span className="wd-color">
                    <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(draft.themeAccent) ? draft.themeAccent : "#26bfb0"} onChange={(event) => patch({ themeAccent: event.target.value })} aria-label="Pick a colour" />
                    <input value={draft.themeAccent} onChange={(event) => patch({ themeAccent: event.target.value })} maxLength={7} placeholder="#26bfb0" />
                  </span>
                </label>
                <div className="wd-split">
                  <label className="field">
                    <span>Support email</span>
                    <input type="email" value={draft.supportEmail} onChange={(event) => patch({ supportEmail: event.target.value })} maxLength={120} />
                  </label>
                  <label className="field">
                    <span>Support phone</span>
                    <input value={draft.supportPhone} onChange={(event) => patch({ supportPhone: event.target.value })} maxLength={40} />
                  </label>
                </div>
                <label className="field">
                  <span>Note on the checkout page</span>
                  <textarea rows={3} value={draft.checkoutNote} onChange={(event) => patch({ checkoutNote: event.target.value })} maxLength={400} />
                </label>
                <label className="set-check">
                  <input type="checkbox" checked={draft.active} onChange={(event) => patch({ active: event.target.checked })} />
                  <span>Live. Turn off to show the desk-wide look instead.</span>
                </label>
                {formError ? <p className="error">{formError}</p> : null}
              </div>
            </div>
            <footer className="wd-modal-foot">
              <button className="btn btn-quiet" type="button" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
              <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
