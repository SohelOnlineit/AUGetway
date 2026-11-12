"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Handset = { id: string; label: string; simSlot: number; sendsSms?: boolean };
type Job = { id: string; handset: string; to: string; body: string; simSlot: number; status: string; error: string; createdAt: string };

export default function SendSmsPage() {
  const [rows, setRows] = useState<Handset[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sendDevice, setSendDevice] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [sendBody, setSendBody] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [sendError, setSendError] = useState("");
  const [jobsError, setJobsError] = useState("");
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<"all" | "queued" | "sent" | "failed">("all");

  function loadJobs() {
    api<Job[]>("/desk/sms")
      .then((list) => {
        setJobs(list);
        setJobsError("");
      })
      .catch((reason) => setJobsError(reason instanceof Error ? reason.message : "Could not load outgoing SMS"));
  }

  useEffect(() => {
    api<Handset[]>("/desk/handsets").then((list) => {
      setRows(list);
      const sender = list.find((row) => row.sendsSms);
      if (sender) setSendDevice(sender.id);
    }).catch(() => setRows([]));
    loadJobs();
    const timer = setInterval(loadJobs, 10000);
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
      setSendNote(`Queued for ${job.simSlot === 1 ? "SIM 2" : "SIM 1"}. The registered phone sends it.`);
      loadJobs();
    } catch (reason) {
      setSendError(reason instanceof Error ? reason.message : "Could not queue the SMS");
    } finally {
      setBusy(false);
    }
  }

  const counts = {
    queued: jobs.filter((job) => jobKind(job.status) === "queued").length,
    sent: jobs.filter((job) => jobKind(job.status) === "sent").length,
    failed: jobs.filter((job) => jobKind(job.status) === "failed").length,
  };
  const visible = jobs.filter((job) => focus === "all" || jobKind(job.status) === focus);

  return (
    <div className="sms-page">
      <header className="sms-hero">
        <span className="sms-hero-ico" aria-hidden="true">
          <svg className="sms-plane" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
            <path d="M4 12 20 4l-6 16-2-6z" />
          </svg>
          <i />
        </span>
        <div>
          <p className="keys-crumb">Desk <span>›</span> SMS Gateway</p>
          <h2>Send SMS</h2>
          <p className="muted">Pick the phone that should send this message. Order SMS uses the phone marked Sends SMS on the Devices page. Keep the AU-Getway notification on.</p>
        </div>
      </header>
      <div className="sms-stats">
        <button type="button" className={focus === "all" ? "sms-stat on" : "sms-stat"} onClick={() => setFocus("all")}>
          <span className="sms-ico plane" aria-hidden="true"><PlaneIcon /></span>
          <span><strong>{jobs.length}</strong><small>Messages</small></span>
        </button>
        <button type="button" className={focus === "queued" ? "sms-stat on" : "sms-stat"} onClick={() => setFocus("queued")}>
          <span className="sms-ico wait" aria-hidden="true"><ClockIcon /></span>
          <span><strong>{counts.queued}</strong><small>Queued</small></span>
        </button>
        <button type="button" className={focus === "sent" ? "sms-stat on" : "sms-stat"} onClick={() => setFocus("sent")}>
          <span className="sms-ico sent" aria-hidden="true"><CheckIcon /></span>
          <span><strong>{counts.sent}</strong><small>Sent</small></span>
        </button>
        <button type="button" className={focus === "failed" ? "sms-stat on" : "sms-stat"} onClick={() => setFocus("failed")}>
          <span className="sms-ico fail" aria-hidden="true"><CrossIcon /></span>
          <span><strong>{counts.failed}</strong><small>Failed</small></span>
        </button>
      </div>
      <section className="sms-card">
        <form className="sms-form" onSubmit={(event) => { event.preventDefault(); void sendSms(); }}>
          <label>
            <span>Phone</span>
            <select value={sendDevice} onChange={(event) => setSendDevice(event.target.value)} required>
              <option value="">Choose a device</option>
              {rows.map((row) => (
                <option key={row.id} value={row.id}>{row.label} · {row.simSlot === 1 ? "SIM 2" : "SIM 1"}{row.sendsSms ? " · sends SMS" : ""}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Number</span>
            <input value={sendTo} onChange={(event) => setSendTo(event.target.value)} placeholder="01XXXXXXXXX" required />
          </label>
          <label>
            <span>Message</span>
            <textarea value={sendBody} onChange={(event) => setSendBody(event.target.value)} maxLength={320} rows={4} required />
          </label>
          {sendNote ? <p className="sms-note">{sendNote}</p> : null}
          {sendError ? <p className="error">{sendError}</p> : null}
          {jobsError ? <p className="error">{jobsError}</p> : null}
          <button className="sms-go" type="submit" disabled={busy}>
            <PlaneIcon /> {busy ? "Queuing…" : "Queue SMS"}
          </button>
        </form>
      </section>
      <section className="sms-card">
        {visible.length > 0 ? (
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
              {visible.map((job) => {
                const kind = jobKind(job.status);
                return (
                  <tr key={job.id}>
                    <td className="muted">{new Date(job.createdAt).toLocaleString()}</td>
                    <td>
                      <span className="sms-row">
                        <span className={`sms-mini ${kind}`} aria-hidden="true"><PlaneIcon /></span>
                        {job.handset}
                      </span>
                    </td>
                    <td>{job.to}</td>
                    <td>{job.simSlot === 1 ? "SIM 2" : "SIM 1"}</td>
                    <td><span className={`sms-pill ${kind}`}>{job.status}{job.error ? ` · ${job.error}` : ""}</span></td>
                    <td className="sms-body">{job.body}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="sms-empty">
            <span className="sms-hero-ico" aria-hidden="true"><PlaneIcon /></span>
            <strong>{focus === "all" ? "No messages yet" : "No matches"}</strong>
            <p>{focus === "all" ? "Queue a message and it will show up here." : "Nothing in this list matches that view."}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function jobKind(status: string) {
  const value = status.toLowerCase();
  if (value.includes("fail")) return "failed";
  if (value.includes("sent") || value.includes("deliver")) return "sent";
  return "queued";
}

function PlaneIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M4 12 20 4l-6 16-2-6z" /></svg>;
}
function ClockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l3 2" /></svg>;
}
function CheckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="8" /><path d="m8.5 12.2 2.3 2.3 4.7-5" /></svg>;
}
function CrossIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="8" /><path d="M9 9l6 6M15 9l-6 6" /></svg>;
}
