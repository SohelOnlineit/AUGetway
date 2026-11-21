"use client";

import { useCallback, useEffect, useState } from "react";
import { API, api } from "@/lib/api";
import { readToken } from "@/lib/token";

type BackupStatus = {
  database: boolean;
  dailySave: string;
  keepDays: number;
  includes: string[];
};

type BackupFile = {
  name: string;
  bytes: number;
  savedAt: string;
};

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function whenLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", { timeZone: "Asia/Dhaka", hour12: false });
}

export default function BackupsPage() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [info, list] = await Promise.all([
      api<BackupStatus>("/desk/backups"),
      api<{ files: BackupFile[] }>("/desk/backups/files"),
    ]);
    setStatus(info);
    setFiles(list.files);
    setError("");
    setReady(true);
  }, []);

  useEffect(() => {
    load().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not load backups");
      setReady(true);
    });
  }, [load]);

  async function saveNow() {
    if (busy) return;
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const saved = await api<BackupFile>("/desk/backups/database", { method: "POST" });
      setNotice(`Saved ${saved.name}`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save a copy");
    } finally {
      setBusy("");
    }
  }

  async function download(name: string) {
    if (busy) return;
    setBusy(name);
    setError("");
    try {
      const headers = new Headers();
      const token = readToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(`${API}/desk/backups/files/${encodeURIComponent(name)}`, { headers, cache: "no-store" });
      if (!response.ok) throw new Error("Could not download this copy");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not download this copy");
    } finally {
      setBusy("");
    }
  }

  async function remove(name: string) {
    if (busy) return;
    if (!window.confirm(`Delete ${name}?`)) return;
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await api(`/desk/backups/files/${encodeURIComponent(name)}`, { method: "DELETE" });
      setFiles((current) => current.filter((file) => file.name !== name));
      setNotice("Copy deleted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this copy");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="sec-page">
      <header className="sec-hero">
        <span className="sec-hero-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
            <path d="M4 7h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 7V5h16v2M10 12h4" />
          </svg>
        </span>
        <div>
          <p className="keys-crumb">Desk <span>›</span> Backups</p>
          <h2>Database backups</h2>
          <p className="muted sec-note">
            A full database copy is saved every day at {status?.dailySave ?? "05:00 Asia/Dhaka"} and kept for {status?.keepDays ?? 60} days.
            Only the main admin can save, download, or delete a copy.
          </p>
        </div>
      </header>

      <section className="card">
        <div className="item">
          <div>
            <strong>Save a copy now</strong>
            <p className="muted">Writes every table to a .sql file on the server. Passwords and gateway credentials are included, so keep the download private.</p>
          </div>
          <button className="btn" type="button" disabled={Boolean(busy) || !ready} onClick={() => void saveNow()}>
            {busy === "save" ? "Saving…" : "Save a copy now"}
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="muted">{notice}</p> : null}
      </section>

      <section className="keys-card">
        <table className="keys-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Saved</th>
              <th>Size</th>
              <th>Actions</th>
            </tr>
          </thead>
          {ready && files.length > 0 ? (
            <tbody>
              {files.map((file) => (
                <tr key={file.name}>
                  <td>{file.name}</td>
                  <td className="muted">{whenLabel(file.savedAt)}</td>
                  <td>{sizeLabel(file.bytes)}</td>
                  <td>
                    <div className="row">
                      <button className="btn-line" type="button" disabled={Boolean(busy)} onClick={() => void download(file.name)}>Download</button>
                      <button className="btn-line" type="button" disabled={Boolean(busy)} onClick={() => void remove(file.name)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          ) : null}
        </table>
        {ready && files.length === 0 && !error ? (
          <div className="keys-empty">
            <div>
              <strong>No saved copies yet</strong>
              <p className="muted">Use Save a copy now, or wait for the daily save at 05:00.</p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
