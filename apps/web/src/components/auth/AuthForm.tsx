"use client";

import { useState, type FormEvent } from "react";

type Field = {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
  inputMode?: "numeric" | "text" | "email";
  maxLength?: number;
  pattern?: string;
};

export function AuthForm({
  fields,
  submitLabel,
  onSubmit,
}: {
  fields: Field[];
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const values: Record<string, string> = {};
    for (const field of fields) {
      values[field.name] = String(form.get(field.name) ?? "");
    }
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      {fields.map((field) => (
        <label key={field.name} className="field">
          <span>{field.label}</span>
          <input
            name={field.name}
            type={field.type ?? "text"}
            autoComplete={field.autoComplete}
            required={field.required ?? true}
            defaultValue={field.defaultValue}
            inputMode={field.inputMode}
            maxLength={field.maxLength}
            pattern={field.pattern}
          />
        </label>
      ))}
      {error ? <p className="form-error">{error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Please wait…" : submitLabel}
      </button>
    </form>
  );
}

export async function readApiError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string | string[] }
    | null;
  if (!payload?.message) return "Request failed";
  return Array.isArray(payload.message)
    ? payload.message.join(", ")
    : payload.message;
}
