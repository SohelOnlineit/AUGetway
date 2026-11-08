"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CheckoutCard } from "@uniqpay/types";

export default function CheckoutsPage() {
  const [rows, setRows] = useState<CheckoutCard[]>([]);
  const [error, setError] = useState("");

  async function load() {
    setRows(await api<CheckoutCard[]>("/desk/checkouts"));
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
      await api("/desk/checkouts", {
        method: "POST",
        body: JSON.stringify({
          reference: String(form.get("reference") ?? ""),
          amount: Number(form.get("amount") ?? 0),
        }),
      });
      formEl.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create");
    }
  }

  return (
    <div className="split">
      <form className="card" onSubmit={onSubmit}>
        <h2>Transactions</h2>
        <label className="field"><span>Reference</span><input name="reference" required minLength={2} /></label>
        <label className="field"><span>Amount (BDT)</span><input name="amount" type="number" min={1} step="0.01" required /></label>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn" type="submit">Create link</button>
      </form>
      <div className="list">
        {rows.map((row) => (
          <article className="card" key={row.publicId}>
            <div className="item">
              <div>
                <strong>{row.reference}</strong>
                <p className="muted">৳ {row.payable} · {row.providerRef || "no reference yet"}</p>
              </div>
              <span className={`pill ${row.status}`}>{row.status}</span>
            </div>
            <p className="tiny">
              <a href={`/pay/${row.publicId}`}>/pay/{row.publicId}</a>
            </p>
            {row.receipt ? <img className="pay-qr" src={row.receipt} alt="Receipt" /> : null}
            {row.status === "waiting" || row.status === "open" || row.status === "pending" ? (
              <div className="row">
                <button className="btn" onClick={() => api(`/desk/checkouts/${row.publicId}/confirm`, { method: "POST" }).then(load)}>
                  Mark paid
                </button>
                <button className="btn-line" onClick={() => api(`/desk/checkouts/${row.publicId}/fail`, { method: "POST" }).then(load)}>
                  Mark failed
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
