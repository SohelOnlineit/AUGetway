"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

type LinkCard = { slug: string; title: string; detail: string; amount: string; currency: string };

export default function LinkPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [link, setLink] = useState<LinkCard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<LinkCard>(`/public/links/${params.slug}`)
      .then(setLink)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Link not found"));
  }, [params.slug]);

  async function pay() {
    const started = await api<{ publicId: string }>(`/public/links/${params.slug}/start`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    router.push(`/pay/${started.publicId}`);
  }

  return (
    <main className="pay-shell">
      <p className="kicker">Payment link</p>
      <article className="receipt">
        <h2>{link?.title ?? "Link"}</h2>
        {link?.detail ? <p className="muted">{link.detail}</p> : null}
        <div className="amount">{link ? `৳ ${Number(link.amount).toFixed(2)}` : "—"}</div>
        {error ? <p className="error">{error}</p> : null}
        {link ? <button className="btn wide" onClick={pay}>Continue to pay</button> : null}
      </article>
    </main>
  );
}
