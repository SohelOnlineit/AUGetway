"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthForm, readApiError } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { getApiBaseUrl } from "@/lib/auth/api-base";
import { resolveStorefrontFromHost } from "@/lib/storefront.shared";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [devPreview, setDevPreview] = useState<{
    actionUrl?: string;
    code?: string;
  } | null>(null);

  return (
    <AuthShell title="Forgot password">
      <AuthForm
        submitLabel="Send reset instructions"
        fields={[
          {
            name: "email",
            label: "Email",
            type: "email",
            autoComplete: "email",
          },
        ]}
        onSubmit={async (values) => {
          const response = await fetch(
            `${getApiBaseUrl()}/auth/forgot-password`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-storefront": resolveStorefrontFromHost(window.location.host),
              },
              body: JSON.stringify(values),
            },
          );
          const payload = (await response.json()) as {
            message?: string;
            devPreview?: { actionUrl?: string; code?: string };
          };
          if (!response.ok) {
            throw new Error(await readApiError(response));
          }
          setMessage(payload.message ?? "If the account exists, instructions were sent.");
          setDevPreview(payload.devPreview ?? null);
        }}
      />
      {message ? <p className="form-success">{message}</p> : null}
      {devPreview ? (
        <div className="dev-preview">
          <p>Development mail preview:</p>
          {devPreview.code ? <p>Code: {devPreview.code}</p> : null}
          {devPreview.actionUrl ? (
            <p>
              <Link href={devPreview.actionUrl}>Open reset link</Link>
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="auth-links">
        <Link href="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
