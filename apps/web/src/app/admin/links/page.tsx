"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

type LinkRow = { slug: string; title: string; amount: string; active: boolean };

export default function LinksPage() {
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [error, setError] = useState("");

  async function load() {
    setRows(await api<LinkRow[]>("/desk/links"));
  }

  useEffect(() => {
    load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load"));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setError("");
    try {
      await api("/desk/links", {
        method: "POST",
        body: JSON.stringify({
          title: String(form.get("title") ?? ""),
          detail: String(form.get("detail") ?? ""),
          amount: Number(form.get("amount") ?? 0),
        }),
      });
      formEl.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save");
    }
  }

  return (
    <div className="split">
      <form className="card" onSubmit={onSubmit}>
        <h2>Payment Links</h2>
        <label className="field"><span>Title</span><input name="title" required /></label>
        <label className="field"><span>Detail</span><textarea name="detail" rows={3} /></label>
        <label className="field"><span>Amount (BDT)</span><input name="amount" type="number" min={1} step="0.01" required /></label>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn" type="submit">Create link</button>
      </form>
      <div className="list">
        {rows.map((row) => (
          <article className="card" key={row.slug}>
            <strong>{row.title}</strong>
            <p className="muted">৳ {Number(row.amount).toFixed(2)}</p>
            <a href={`/l/${row.slug}`}>/l/{row.slug}</a>
          </article>
        ))}
      </div>
    </div>
  );
}
