"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { BrandBar } from "@/components/brand-bar";
import { TurnstileField } from "@/components/turnstile-field";

type LinkField = { label: string; type: "text" | "email" | "phone" | "number" | "textarea"; required: boolean };
type LinkCard = { slug: string; title: string; detail: string; amount: string; currency: string; quantity: number; image: string; fields: LinkField[] };

export default function LinkPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [link, setLink] = useState<LinkCard | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);

  useEffect(() => {
    api<LinkCard>(`/public/links/${params.slug}`)
      .then(setLink)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Link not found"));
  }, [params.slug]);

  async function pay() {
    setError("");
    try {
      const started = await api<{ publicId: string }>(`/public/links/${params.slug}/start`, {
        method: "POST",
        body: JSON.stringify({
          answers: (link?.fields ?? []).map((field) => ({ label: field.label, value: answers[field.label] ?? "" })),
          turnstileToken: captchaToken || undefined,
        }),
      });
      router.push(`/pay/${started.publicId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start payment");
      setCaptchaReset((value) => value + 1);
    }
  }

  return (
    <main className="pay-shell">
      <BrandBar />
      <p className="kicker">Payment link</p>
      <article className="receipt">
        {link?.image ? <img className="plf-public-image" src={link.image} alt="" /> : null}
        <h2>{link?.title ?? "Link"}</h2>
        {link?.detail ? <p className="muted">{link.detail}</p> : null}
        <div className="amount">{link ? `${link.currency} ${Number(link.amount).toFixed(2)}` : "—"}</div>
        {link && link.quantity > 1 ? <p className="muted">Quantity {link.quantity} · Total {link.currency} {(Number(link.amount) * link.quantity).toFixed(2)}</p> : null}
        {link?.fields.map((field) => (
          <label key={field.label}>
            <span>{field.label}{field.required ? " *" : ""}</span>
            {field.type === "textarea" ? (
              <textarea value={answers[field.label] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [field.label]: event.target.value }))} />
            ) : (
              <input
                type={field.type === "phone" ? "tel" : field.type}
                value={answers[field.label] ?? ""}
                onChange={(event) => setAnswers((current) => ({ ...current, [field.label]: event.target.value }))}
              />
            )}
          </label>
        ))}
        {link ? <TurnstileField resetKey={captchaReset} onToken={setCaptchaToken} onRequired={setCaptchaRequired} /> : null}
        {error ? <p className="error">{error}</p> : null}
        {link ? <button className="btn wide" disabled={captchaRequired && !captchaToken} onClick={pay}>Continue to pay</button> : null}
      </article>
    </main>
  );
}
