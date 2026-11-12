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

  return (
    <div className="dev-page">
      <section className="dev-card">
        <header className="dev-head">
          <div>
            <p className="keys-crumb">SMS Gateway <span>›</span> Send</p>
            <h2>Send SMS</h2>
            <p className="muted">Pick the phone that should send this message. Order SMS uses the phone marked Sends SMS on the Devices page. Keep the AU-Getway notification on.</p>
          </div>
        </header>
        <form className="dev-modal-body dev-send" onSubmit={(event) => { event.preventDefault(); void sendSms(); }}>
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
    </div>
  );
}
