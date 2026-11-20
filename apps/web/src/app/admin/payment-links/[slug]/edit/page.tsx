"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { LinkForm, type LinkDraft } from "@/components/link-form";

export default function EditPaymentLinkPage() {
  const params = useParams<{ slug: string }>();
  const [link, setLink] = useState<LinkDraft | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const slug = decodeURIComponent(params.slug);
    api<LinkDraft[]>("/desk/links")
      .then((rows) => {
        const row = rows.find((item) => item.slug === slug);
        if (!row) setError("Payment link not found");
        else setLink(row);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load payment link"));
  }, [params.slug]);

  if (error) return <p className="error">{error}</p>;
  if (!link) return <p className="pl-note">Loading payment link…</p>;
  return <LinkForm key={link.slug} mode="edit" initial={link} />;
}
