"use client";

import { AuthForm, readApiError } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";

/** The register page remembers the address for this tab only, so the user does not retype it. */
function readPendingEmail(): string {
  try {
    return window.sessionStorage.getItem("pending_verify_email") ?? "";
  } catch {
    return "";
  }
}

function VerifyEmailForm() {
  return (
    <AuthShell title="Verify email">
      <AuthForm
        submitLabel="Verify"
        fields={[
          {
            name: "email",
            label: "Email",
            type: "email",
            required: true,
            autoComplete: "email",
            defaultValue: readPendingEmail(),
          },
          {
            name: "code",
            label: "4-digit code",
            required: true,
            inputMode: "numeric",
            maxLength: 4,
            pattern: "[0-9]{4}",
            autoComplete: "one-time-code",
          },
        ]}
        onSubmit={async (values) => {
          const response = await fetch("/api/auth/verify-email", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ code: values.code, email: values.email }),
          });
          if (!response.ok) {
            throw new Error(await readApiError(response));
          }
          window.location.assign("/");
        }}
      />
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return <VerifyEmailForm />;
}
