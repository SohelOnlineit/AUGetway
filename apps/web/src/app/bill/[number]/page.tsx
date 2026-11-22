"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { BrandBar } from "@/components/brand-bar";
import { TurnstileField } from "@/components/turnstile-field";

type Bill = { number: string; customerName: string; title: string; total: string; currency: string; status: string; note: string };

export default function BillPage() {
  const params = useParams<{ number: string }>();
  const router = useRouter();
  const [bill, setBill] = useState<Bill | null>(null);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);

  useEffect(() => {
    api<Bill>(`/public/bills/${params.number}`)
      .then(setBill)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Bill not found"));
  }, [params.number]);

  async function pay() {
    setError("");
    try {
      const started = await api<{ publicId: string }>(`/public/bills/${params.number}/start`, {
        method: "POST",
        body: JSON.stringify({ turnstileToken: captchaToken || undefined }),
      });
      router.push(`/pay/${started.publicId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start payment");
      setCaptchaReset((value) => value + 1);
    }
  }

  // A paid or cancelled bill cannot be paid, so the pay button and the security check are hidden for it.
  const payable = Boolean(bill && bill.status !== "paid" && bill.status !== "cancelled");

  return (
    <main className="pay-shell">
      <BrandBar />
      <p className="kicker">Bill {bill?.number}</p>
      <article className="receipt">
        <h2>{bill?.title ?? "Bill"}</h2>
        <p className="muted">{bill?.customerName}</p>
        <div className="amount">{bill ? `${bill.currency === "BDT" ? "৳" : bill.currency} ${Number(bill.total).toFixed(2)}` : "—"}</div>
        {bill?.note ? <p>{bill.note}</p> : null}
        {payable ? <TurnstileField resetKey={captchaReset} onToken={setCaptchaToken} onRequired={setCaptchaRequired} /> : null}
        {error ? <p className="error">{error}</p> : null}
        {payable ? <button className="btn wide" disabled={captchaRequired && !captchaToken} onClick={pay}>Pay this bill</button> : null}
        {bill?.status === "paid" ? <p>This bill is paid.</p> : null}
        {bill?.status === "cancelled" ? <p>This bill was cancelled. Contact the shop if you think this is a mistake.</p> : null}
      </article>
    </main>
  );
}
