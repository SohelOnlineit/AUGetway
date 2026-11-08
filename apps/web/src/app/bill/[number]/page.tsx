"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

type Bill = { number: string; customerName: string; title: string; total: string; currency: string; status: string; note: string };

export default function BillPage() {
  const params = useParams<{ number: string }>();
  const router = useRouter();
  const [bill, setBill] = useState<Bill | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Bill>(`/public/bills/${params.number}`)
      .then(setBill)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Bill not found"));
  }, [params.number]);

  async function pay() {
    const started = await api<{ publicId: string }>(`/public/bills/${params.number}/start`, { method: "POST" });
    router.push(`/pay/${started.publicId}`);
  }

  return (
    <main className="pay-shell">
      <p className="kicker">Bill {bill?.number}</p>
      <article className="receipt">
        <h2>{bill?.title ?? "Bill"}</h2>
        <p className="muted">{bill?.customerName}</p>
        <div className="amount">{bill ? `৳ ${Number(bill.total).toFixed(2)}` : "—"}</div>
        {bill?.note ? <p>{bill.note}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {bill && bill.status !== "paid" ? <button className="btn wide" onClick={pay}>Pay this bill</button> : null}
        {bill?.status === "paid" ? <p>This bill is paid.</p> : null}
      </article>
    </main>
  );
}
