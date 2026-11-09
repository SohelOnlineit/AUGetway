"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Handset = {
  id: string;
  uid: string;
  label: string;
  model: string | null;
  battery: number | null;
  simSlot: number;
  lastSeenAt: string | null;
};

function seenAgo(value: string | null) {
  if (!value) return "Never";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds} ${seconds === 1 ? "second" : "seconds"} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

function isOnline(value: string | null) {
  return Boolean(value);
}

export default function SmsGatewayPage() {
  const [rows, setRows] = useState<Handset[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [editing, setEditing] = useState<Handset | null>(null);
  const [label, setLabel] = useState("");
  const [simSlot, setSimSlot] = useState(0);
  const [removing, setRemoving] = useState<Handset | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendDevice, setSendDevice] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [sendBody, setSendBody] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [sendError, setSendError] = useState("");
  const [jobs, setJobs] = useState<{ id: string; handset: string; to: string; body: string; simSlot: number; status: string; error: string; createdAt: string }[]>([]);

  const [jobsError, setJobsError] = useState("");

  function loadJobs() {
    api<typeof jobs>("/desk/sms")
      .then((list) => {
        setJobs(list);
        setJobsError("");
      })
      .catch((reason) => setJobsError(reason instanceof Error ? reason.message : "Could not load outgoing SMS"));
  }

  function load() {
    api<Handset[]>("/desk/handsets").then(setRows).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load devices"));
  }

  useEffect(() => {
    load();
    loadJobs();
    const timer = setInterval(() => {
      load();
      loadJobs();
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  async function sendSms() {
    if (busy) return;
    if (!sendDevice) {
      setSendError("Choose the phone that should send this SMS.");
      setSendNote("");
      return;
    }
    setBusy(true);
    setSendNote("");
    setSendError("");
    try {
      const job = await api<{ simSlot: number }>("/desk/sms", {
        method: "POST",
        body: JSON.stringify({ handsetId: sendDevice, to: sendTo, body: sendBody }),
      });
      setSendBody("");
      setSendNote(`Queued for ${job.simSlot === 1 ? "SIM 2" : "SIM 1"}. The phone sends this message, then the next one can be queued.`);
      loadJobs();
    } catch (reason) {
      setSendError(reason instanceof Error ? reason.message : "Could not queue the SMS");
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows.filter((row) => !needle || `${row.label} ${row.model ?? ""} ${row.uid}`.toLowerCase().includes(needle));
    return [...list].sort((a, b) => {
      const left = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
      const right = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
      return sort === "desc" ? right - left : left - right;
    });
  }, [rows, query, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * perPage;
  const visible = filtered.slice(start, start + perPage);

  function openEdit(row: Handset) {
    setEditing(row);
    setLabel(row.label);
    setSimSlot(row.simSlot === 1 ? 1 : 0);
    setFormError("");
  }

  async function saveEdit() {
    if (!editing || busy) return;
    const name = label.trim();
    if (name.length < 2) {
      setFormError("Device name must be at least 2 characters");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      await api(`/desk/handsets/${editing.id}`, { method: "PATCH", body: JSON.stringify({ label: name, simSlot: simSlot === 1 ? 1 : 0 }) });
      setEditing(null);
      load();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Could not save the device");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!removing || busy) return;
    setBusy(true);
    setFormError("");
    try {
      await api(`/desk/handsets/${removing.id}`, { method: "DELETE" });
      setRemoving(null);
      load();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Could not delete the device");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dev-page">
      <section className="dev-card">
        <header className="dev-head">
          <div>
            <p className="keys-crumb">SMS Gateway <span>›</span> Send</p>
            <h2>Send SMS</h2>
            <p className="muted">One Bangladesh number at a time. The signed-in AuGetway phone sends it from the SIM, including while the screen is off. Keep the UniqBD Pay notification on.</p>
          </div>
        </header>
        <form className="dev-modal-body dev-send" onSubmit={(event) => { event.preventDefault(); void sendSms(); }}>
          <label>
            <span>Phone</span>
            <select value={sendDevice} onChange={(event) => setSendDevice(event.target.value)} required>
              <option value="">Choose a device</option>
              {rows.map((row) => (
                <option key={row.id} value={row.id}>{row.label} · {row.simSlot === 1 ? "SIM 2" : "SIM 1"}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Number</span>
            <input value={sendTo} onChange={(event) => setSendTo(event.target.value)} placeholder="01XXXXXXXXX" required />
          </label>
          <label>
            <span>Message</span>
            <input value={sendBody} onChange={(event) => setSendBody(event.target.value)} maxLength={320} required />
          </label>
          {sendNote ? <p className="account-note">{sendNote}</p> : null}
          {sendError ? <p className="error">{sendError}</p> : null}
          {jobsError ? <p className="error">{jobsError}</p> : null}
          <div className="dev-modal-actions">
            <button className="btn" type="submit" disabled={busy}>Queue SMS</button>
          </div>
        </form>
        {jobs.length > 0 ? (
          <table className="keys-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Phone</th>
                <th>To</th>
                <th>SIM</th>
                <th>Status</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="muted">{new Date(job.createdAt).toLocaleString()}</td>
                  <td>{job.handset}</td>
                  <td>{job.to}</td>
                  <td>{job.simSlot === 1 ? "SIM 2" : "SIM 1"}</td>
                  <td>{job.status}{job.error ? ` · ${job.error}` : ""}</td>
                  <td className="sms-body">{job.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
      <section className="dev-card">
        <header className="dev-head">
          <div>
            <p className="keys-crumb">Devices <span>›</span> List</p>
            <h2>Devices</h2>
          </div>
          <label className="keys-search">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search" aria-label="Search" />
          </label>
        </header>
        {error ? <p className="error dev-error">{error}</p> : null}
        <div className="dev-body">
          <table className="keys-table dev-table">
            <thead>
              <tr>
                <th>Device Node</th>
                <th>Status</th>
                <th>Battery</th>
                <th>Active Outbound SIM</th>
                <th>
                  <button type="button" onClick={() => setSort(sort === "desc" ? "asc" : "desc")}>
                    Last Heartbeat
                    <svg className={sort === "asc" ? "up" : ""} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                </th>
                <th />
              </tr>
            </thead>
            {visible.length > 0 ? (
              <tbody>
                {visible.map((row) => {
                  const online = isOnline(row.lastSeenAt);
                  const battery = row.battery === null || row.battery === undefined ? null : row.battery;
                  const battClass = battery === null ? "na" : battery > 50 ? "" : battery > 20 ? "mid" : "low";
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="dev-node">
                          <span className="dev-avatar" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></svg>
                          </span>
                          <div>
                            <div className="name">{row.label}</div>
                            <div className="node-meta">{row.model || row.uid}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className={online ? "dev-status on" : "dev-status"}><i />{online ? "online" : "offline"}</span></td>
                      <td><span className={`dev-batt ${battClass}`}>{battery === null ? "N/A" : `${battery}%`}</span></td>
                      <td><span className={row.simSlot === 1 ? "dev-sim alt" : "dev-sim"}>{row.simSlot === 1 ? "SIM 2" : "SIM 1"}</span></td>
                      <td className="dev-when">{seenAgo(row.lastSeenAt)}</td>
                      <td>
                        <div className="dev-actions">
                        <button type="button" className="dev-edit" onClick={() => openEdit(row)}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                          Edit
                        </button>
                        <button type="button" className="dev-delete" onClick={() => { setRemoving(row); setFormError(""); }}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                          Delete
                        </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ) : null}
          </table>
          {visible.length === 0 ? (
            <div className="keys-empty">
              <div>
                <span className="mark">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 8l8 8M16 8l-8 8" /></svg>
                </span>
                <strong>{query.trim() ? "No devices match" : "No devices"}</strong>
              </div>
            </div>
          ) : null}
        </div>
        <div className="dev-foot">
          <span>Showing {filtered.length === 0 ? 0 : start + 1} to {Math.min(start + perPage, filtered.length)} of {filtered.length} results</span>
          <div className="dev-foot-end">
            {pages > 1 ? (
              <div className="gw-pages">
                <button type="button" onClick={() => setPage(Math.max(1, safePage - 1))}>‹</button>
                {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
                  <button key={number} type="button" className={number === safePage ? "on" : ""} onClick={() => setPage(number)}>{number}</button>
                ))}
                <button type="button" onClick={() => setPage(Math.min(pages, safePage + 1))}>›</button>
              </div>
            ) : null}
            <label>Per page <select value={perPage} onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label>
          </div>
        </div>
      </section>

      {editing ? (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <form className="modal dev-modal" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
            <header className="dev-modal-head">
              <div>
                <p className="keys-crumb">Devices <span>›</span> Edit</p>
                <h2>Edit device</h2>
              </div>
              <button className="dev-close" type="button" onClick={() => setEditing(null)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
                Close
              </button>
            </header>
            <div className="dev-modal-body">
              <div className="dev-node dev-edit-id">
                <span className="dev-avatar" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></svg>
                </span>
                <div>
                  <div className="name">{editing.label}</div>
                  <div className="node-meta">{editing.model || editing.uid}</div>
                </div>
              </div>
              <label>
                <span>Device Name / Nickname</span>
                <input value={label} onChange={(event) => setLabel(event.target.value)} required minLength={2} maxLength={80} />
              </label>
              <label>
                <span>Default SIM Slot</span>
                <select value={simSlot} onChange={(event) => setSimSlot(Number(event.target.value))}>
                  <option value={0}>SIM 1 (Default)</option>
                  <option value={1}>SIM 2 (Secondary)</option>
                </select>
                <small>The phone sends queued SMS from this SIM. Change it here, and the next message uses the new SIM.</small>
              </label>
              {formError ? <p className="error">{formError}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn" type="submit" disabled={busy}>Save</button>
            </div>
          </form>
        </div>
      ) : null}

      {removing ? (
        <div className="modal-back" onClick={() => { if (!busy) setRemoving(null); }}>
          <div className="modal dev-modal" onClick={(event) => event.stopPropagation()}>
            <header className="dev-modal-head">
              <div>
                <p className="keys-crumb">Devices <span>›</span> Delete</p>
                <h2>Delete device</h2>
              </div>
              <button className="dev-close" type="button" disabled={busy} onClick={() => setRemoving(null)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
                Close
              </button>
            </header>
            <div className="dev-modal-body">
              <p>Remove <strong>{removing.label}</strong> from this list? The messages this phone pasted are removed with it.</p>
              {formError ? <p className="error">{formError}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button>
              <button className="btn danger" type="button" disabled={busy} onClick={() => void confirmRemove()}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
