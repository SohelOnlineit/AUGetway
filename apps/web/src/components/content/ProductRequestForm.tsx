"use client";

import { useState, type FormEvent } from "react";
import { submitProductRequest } from "@/lib/content/api";

export function ProductRequestForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await submitProductRequest({
        productName: String(form.get("productName") ?? ""),
        customerName: String(form.get("customerName") ?? ""),
        email: String(form.get("email") ?? ""),
        mobile: String(form.get("mobile") ?? ""),
        details: String(form.get("details") ?? ""),
      });
      setDone(true);
      event.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="account-stack" onSubmit={(e) => void onSubmit(e)}>
      {error ? <p className="form-error">{error}</p> : null}
      {done ? (
        <p className="lead">Request submitted for admin review.</p>
      ) : null}
      <label>
        Product name
        <input name="productName" required minLength={2} maxLength={120} />
      </label>
      <label>
        Your name
        <input name="customerName" required minLength={2} maxLength={80} />
      </label>
      <label>
        Email
        <input name="email" type="email" required maxLength={160} />
      </label>
      <label>
        Mobile
        <input name="mobile" required minLength={8} maxLength={20} />
      </label>
      <label>
        Details
        <textarea name="details" required minLength={10} maxLength={5000} rows={6} />
      </label>
      <button className="primary-btn" type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}
