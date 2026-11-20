"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { EmailSectionNav } from "@/components/admin/EmailSectionNav";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";

type Template = {
  id: string;
  label: string;
  description: string;
  recipient: "customer" | "admin";
  subject: string;
  heading: string;
  bodyText: string;
  buttonLabel: string;
  buttonUrl: string;
  enabled: boolean;
  hint: string | null;
  wired: boolean;
};

export default function EmailTemplateEditorPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = decodeURIComponent(params.id);
  const shop = searchParams.get("shop") === "uniqbd" ? "uniqbd" : "amarpin";
  const site = shop === "uniqbd" ? "UniQbd" : "AuGetway";
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [form, setForm] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const result = await adminFetch<Template>(`/email/templates/${encodeURIComponent(id)}?shop=${shop}`);
    if (!result.ok) {
      setError(result.message);
      setForm(null);
      return;
    }
    setForm(result.data);
    setError(null);
  }, [id, shop]);

  useEffect(() => {
    if (loading || sessionError) return;
    void load();
  }, [load, loading, sessionError]);

  async function save() {
    if (!form) return;
    setPending(true);
    setNotice(null);
    const result = await adminFetch<Template>(`/email/templates/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        shop,
        subject: form.subject,
        heading: form.heading,
        bodyText: form.bodyText,
        buttonLabel: form.buttonLabel,
        buttonUrl: form.buttonUrl,
        enabled: form.enabled,
      }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setForm(result.data);
    setError(null);
    setNotice(`${site} template saved.`);
  }

  async function reset() {
    setPending(true);
    setNotice(null);
    const result = await adminFetch<Template>(`/email/templates/${encodeURIComponent(id)}/reset?shop=${shop}`, { method: "POST" });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setForm(result.data);
    setError(null);
    setNotice(`${site} template reset to the default.`);
  }

  return (
    <AdminShell title={form ? `${form.label} · ${site}` : "Customize template"} lead={form?.description} permissions={permissions}>
      <div className="tpl-page">
        <p className="tpl-back">
          <Link href={`/admin/settings/email/templates?shop=${shop}`}>← {site} templates</Link>
        </p>
        <EmailSectionNav />
        {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
        {!form ? (
          <p className="mail-loading">{sessionError || error ? "" : "Loading template…"}</p>
        ) : (
          <section className="tpl-card tpl-editor">
            <div className="tpl-editor-top">
              <span className={`tpl-recipient is-${form.recipient}`}>{form.recipient}</span>
              <code>{form.id}</code>
              {!form.wired ? <em className="tpl-badge">Not wired</em> : null}
            </div>
            {form.hint ? <p className="tpl-hint">{form.hint}</p> : null}
            <div className="mail-toggle">
              <div>
                <strong>Enabled</strong>
                <p>Disabled templates are skipped when this email is sent.</p>
              </div>
              <button type="button" aria-label="Enabled" aria-pressed={form.enabled} onClick={() => setForm({ ...form, enabled: !form.enabled })} />
            </div>
            <label className="mail-field">
              <span>Subject</span>
              <input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />
            </label>
            <label className="mail-field">
              <span>Heading</span>
              <input value={form.heading} onChange={(event) => setForm({ ...form, heading: event.target.value })} />
            </label>
            <label className="mail-field">
              <span>Body</span>
              <textarea value={form.bodyText} onChange={(event) => setForm({ ...form, bodyText: event.target.value })} rows={6} />
            </label>
            <div className="tpl-placeholders">
              {["{{store_name}}", "{{order_number}}", "{{inquiry_subject}}"].map((token) => (
                <button key={token} type="button" onClick={() => setForm({ ...form, bodyText: `${form.bodyText}${form.bodyText ? " " : ""}${token}` })}>
                  {token}
                </button>
              ))}
            </div>
            <div className="mail-grid">
              <label className="mail-field">
                <span>Button label</span>
                <input value={form.buttonLabel} onChange={(event) => setForm({ ...form, buttonLabel: event.target.value })} />
              </label>
              <label className="mail-field">
                <span>Button URL</span>
                <input value={form.buttonUrl} onChange={(event) => setForm({ ...form, buttonUrl: event.target.value })} placeholder="https:// or /path" />
              </label>
            </div>
            <div className="tpl-actions">
              <button type="button" className="mail-save" disabled={pending} onClick={() => void save()}>
                {pending ? "Saving…" : "Save template"}
              </button>
              <button type="button" disabled={pending} onClick={() => void reset()}>Reset default</button>
            </div>
            {notice ? <p className="mail-notice">{notice}</p> : null}
          </section>
        )}
      </div>
    </AdminShell>
  );
}
