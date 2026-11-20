"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthForm, readApiError } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { getApiBaseUrl } from "@/lib/auth/api-base";

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [message, setMessage] = useState<string | null>(null);

  return (
    <AuthShell title="Reset password">
      <AuthForm
        submitLabel="Update password"
        fields={[
          {
            name: "token",
            label: "Token (from email link)",
            required: false,
            defaultValue: token,
          },
          {
            name: "email",
            label: "Email (needed with the 6-digit code)",
            type: "email",
            required: false,
            autoComplete: "email",
          },
          {
            name: "code",
            label: "Or 6-digit code",
            required: false,
          },
          {
            name: "newPassword",
            label: "New password",
            type: "password",
            autoComplete: "new-password",
          },
        ]}
        onSubmit={async (values) => {
          const response = await fetch(`${getApiBaseUrl()}/auth/reset-password`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              token: values.token || undefined,
              code: values.code || undefined,
              email: values.email || undefined,
              newPassword: values.newPassword,
            }),
          });
          if (!response.ok) {
            throw new Error(await readApiError(response));
          }
          const payload = (await response.json()) as { message?: string };
          setMessage(payload.message ?? "Password updated");
        }}
      />
      {message ? <p className="form-success">{message}</p> : null}
      <p className="auth-links">
        <Link href="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Reset password">
          <p>Loading…</p>
        </AuthShell>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
