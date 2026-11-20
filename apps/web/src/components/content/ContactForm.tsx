"use client";

import { useState, type FormEvent } from "react";
import { submitContact } from "@/lib/content/api";

export function ContactForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await submitContact({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        subject: String(form.get("subject") ?? ""),
        message: String(form.get("message") ?? ""),
      });
      setDone(true);
      event.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="account-stack" onSubmit={(e) => void onSubmit(e)}>
      {error ? <p className="form-error">{error}</p> : null}
      {done ? (
        <p className="lead">Message received. We will review it in the inbox.</p>
      ) : null}
      <label>
        Name
        <input name="name" required minLength={2} maxLength={80} />
      </label>
      <label>
        Email
        <input name="email" type="email" required maxLength={160} />
      </label>
      <label>
        Subject
        <input name="subject" required minLength={3} maxLength={160} />
      </label>
      <label>
        Message
        <textarea name="message" required minLength={10} maxLength={5000} rows={6} />
      </label>
      <button className="primary-btn" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
