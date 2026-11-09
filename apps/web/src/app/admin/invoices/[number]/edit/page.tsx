"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { InvoiceForm, type InvoiceDraft } from "@/components/invoice-form";

export default function EditInvoicePage() {
  const params = useParams<{ number: string }>();
  const [bill, setBill] = useState<InvoiceDraft | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<InvoiceDraft[]>("/desk/bills")
      .then((rows) => {
        const row = rows.find((item) => item.number === decodeURIComponent(params.number));
        if (!row) setError("Invoice not found");
        else setBill(row);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load invoice"));
  }, [params.number]);

  if (error) return <p className="error">{error}</p>;
  if (!bill) return <p className="inv-note">Loading invoice…</p>;
  return <InvoiceForm key={bill.number} mode="edit" initial={bill} />;
}
