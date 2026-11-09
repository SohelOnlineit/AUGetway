"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { CheckoutCard } from "@uniqpay/types";
import { api } from "@/lib/api";

async function readReceipt(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return "";
  if (!value.type.startsWith("image/")) throw new Error("Receipt must be an image");
  if (value.size > 1_200_000) throw new Error("Receipt must be under 1.2 MB");
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the receipt"));
    reader.readAsDataURL(value);
  });
}

function returnHref(url: string, invoiceId: string) {
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}invoice_id=${encodeURIComponent(invoiceId)}`;
}

function leftLabel(expiresAt: string, now: number) {
  const left = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function PayPage() {
  const params = useParams<{ publicId: string }>();
  const [card, setCard] = useState<CheckoutCard | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    setCard(await api<CheckoutCard>(`/public/pay/${params.publicId}`));
  }

  useEffect(() => {
    load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Checkout not found"));
  }, [params.publicId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!card || card.status === "paid" || card.status === "failed" || card.status === "expired") return;
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [card?.status, params.publicId]);

  async function choose(methodId: string) {
    setPending(true);
    setError("");
    try {
      setCard(await api<CheckoutCard>(`/public/pay/${params.publicId}/method`, {
        method: "POST",
        body: JSON.stringify({ methodId }),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not choose method");
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      setCard(await api<CheckoutCard>(`/public/pay/${params.publicId}/proof`, {
        method: "POST",
        body: JSON.stringify({
          providerRef: String(form.get("providerRef") ?? ""),
          payerAccount: String(form.get("payerAccount") ?? ""),
          receipt: await readReceipt(form.get("receipt")),
        }),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="pay-shell">
      <p className="kicker">UniqBD Pay</p>
      <div className="receipt">
        <header>
          <span>{card?.reference ?? "Checkout"}</span>
          <span className={`pill ${card?.status ?? ""}`}>{card?.status ?? "…"}</span>
        </header>
        <div className="amount">{card ? `৳ ${card.payable}` : "—"}</div>
        {card?.status === "open" ? (
          <div className="choices">
            <p>Choose how you will pay.</p>
            {card.methods?.map((method) => (
              <button key={method.id} className="btn" disabled={pending} onClick={() => choose(method.id)}>
                {method.label}
              </button>
            ))}
            {card.methods?.length === 0 ? <p className="muted">No payment method is turned on.</p> : null}
          </div>
        ) : null}
        {card?.status === "waiting" && card.method ? (
          <form onSubmit={onSubmit}>
            <p>Send <strong>৳ {card.payable}</strong> with {card.method.label}{card.method.accountNumber ? <> to <strong>{card.method.accountNumber}</strong></> : null}.</p>
            {card.method.qrImage ? <img className="pay-qr" src={card.method.qrImage} alt="" /> : null}
            {card.method.instructions ? <p className="muted">{card.method.instructions}</p> : null}
            <p className="muted">Time left {leftLabel(card.expiresAt, now)}</p>
            {card.method.verifyBy !== "unique_amount" ? (
              card.method.verifyBy === "sender_number" ? (
                <label className="field"><span>Sender number</span><input name="payerAccount" required inputMode="numeric" pattern="01[3-9][0-9]{8}" placeholder="01XXXXXXXXX" title="Start with 01 and use 11 digits" /></label>
              ) : (
                <>
                  <label className="field"><span>Transaction reference</span><input name="providerRef" required minLength={6} /></label>
                  <label className="field"><span>Your wallet number</span><input name="payerAccount" required minLength={6} /></label>
                </>
              )
            ) : null}
            {card.method.acceptProof ? (
              <label className="field"><span>Receipt image</span><input name="receipt" type="file" accept="image/*" /></label>
            ) : null}
            {card.method.verifyBy === "unique_amount" && card.method.acceptProof === false ? (
              <p className="muted">This checkout completes when the deposit notice matches the amount.</p>
            ) : (
              <button className="btn wide" disabled={pending} type="submit">I have paid</button>
            )}
            {card.providerRef ? <p className="muted">Waiting for confirmation of {card.providerRef}.</p> : null}
          </form>
        ) : null}
        {card?.status === "pending" ? <p>This payment is pending a check.</p> : null}
        {card?.status === "paid" ? <p>Payment received. {card.successUrl ? <a href={returnHref(card.successUrl, params.publicId)}>Continue</a> : null}</p> : null}
        {card?.status === "failed" ? <p>This checkout was not accepted.</p> : null}
        {card?.status === "expired" ? <p>This checkout has expired.</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </main>
  );
}
