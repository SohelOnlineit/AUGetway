"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Bill = {
  number: string;
  customerName: string;
  title: string;
  total: string;
  status: string;
};

export default function BillsPage() {
  const [rows, setRows] = useState<Bill[]>([]);
  const [error, setError] = useState("");

  async function load() {
    setRows(await api<Bill[]>("/desk/bills"));
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
      await api("/desk/bills", {
        method: "POST",
        body: JSON.stringify({
          customerName: String(form.get("customerName") ?? ""),
          title: String(form.get("title") ?? ""),
          total: Number(form.get("total") ?? 0),
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
        <h2>Invoices</h2>
        <label className="field"><span>Customer</span><input name="customerName" required /></label>
        <label className="field"><span>Title</span><input name="title" required /></label>
        <label className="field"><span>Total (BDT)</span><input name="total" type="number" min={1} step="0.01" required /></label>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn" type="submit">Create bill</button>
      </form>
      <div className="list">
        {rows.map((row) => (
          <article className="card item" key={row.number}>
            <div>
              <strong>{row.title}</strong>
              <p className="muted">{row.customerName} · ৳ {Number(row.total).toFixed(2)}</p>
              <a href={`/bill/${row.number}`}>/bill/{row.number}</a>
            </div>
            <span className={`pill ${row.status === "paid" ? "paid" : "open"}`}>{row.status}</span>
          </article>
        ))}
      </div>
    </div>
  );
}
