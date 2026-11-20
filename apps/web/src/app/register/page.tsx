"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { readApiError } from "@/components/auth/AuthForm";
import {
  ArrowIcon,
  EyeIcon,
  GateFrame,
  KeyIcon,
  MailIcon,
  UserPlusIcon,
} from "@/components/auth/GateFrame";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [devPreview, setDevPreview] = useState<{ actionUrl?: string; code?: string } | null>(null);

  async function register() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const payload = (await response.json()) as {
        devPreview?: { actionUrl?: string; code?: string };
      };
      if (payload.devPreview) {
        setDevPreview(payload.devPreview);
        return;
      }
      try {
        window.sessionStorage.setItem("pending_verify_email", email.trim());
      } catch {
        /* storage unavailable: the verify page asks for the email */
      }
      router.push("/verify-email");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <GateFrame
      title="Create Your Account"
      lede="Join AuGetway and start shopping digital goods in seconds."
      footer={
        <div className="gate-panel">
          <span className="gate-mark">
            <ArrowIcon />
          </span>
          <p>Already have an account?</p>
          <Link href="/login">
            <ArrowIcon />
            Log in
          </Link>
        </div>
      }
    >
      {error ? <p className="form-error">{error}</p> : null}
      <form
        className="gate-form"
        onSubmit={(event) => {
          event.preventDefault();
          void register();
        }}
      >
        <label className="gate-field">
          <span>Email</span>
          <div className="gate-input">
            <MailIcon />
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </label>
        <label className="gate-field">
          <span>Password</span>
          <div className="gate-input">
            <KeyIcon />
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="button" className="gate-eye" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>
              <EyeIcon off={showPassword} />
            </button>
          </div>
        </label>
        <small className="gate-hint">Use any password you like.</small>
        <button type="submit" className="gate-submit" disabled={pending}>
          <UserPlusIcon />
          {pending ? "Please wait…" : "Sign up"}
        </button>
      </form>
      {devPreview ? (
        <div className="dev-preview">
          <p>Development mail preview (not available in production):</p>
          {devPreview.code ? <p>Code: {devPreview.code}</p> : null}
        </div>
      ) : null}
    </GateFrame>
  );
}
