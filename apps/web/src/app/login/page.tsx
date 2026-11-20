"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { readApiError } from "@/components/auth/AuthForm";
import {
  ArrowIcon,
  EyeIcon,
  GateFrame,
  KeyIcon,
  LockIcon,
  MailIcon,
  UserPlusIcon,
} from "@/components/auth/GateFrame";
import { applyTheme, isThemePreference } from "@/lib/theme/theme";

function getSafeRedirectUrl(target: string | null | undefined, fallback: string): string {
  if (!target) return fallback;
  const trimmed = target.trim();
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("\\")
  ) {
    return trimmed;
  }
  return fallback;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextParam = params.get("next");
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const queryError = params.get("error");

  async function signIn(email: string, password: string) {
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const payload = (await response.json()) as {
        user?: { roles?: string[]; theme?: unknown };
      };
      if (isThemePreference(payload.user?.theme)) {
        applyTheme(payload.user.theme);
      }
      const roles = payload.user?.roles ?? [];
      const staff = roles.some((role) => role === "ADMINISTRATOR" || role === "EDITOR");
      const fallback = staff ? "/admin" : "/dashboard";
      let destination = getSafeRedirectUrl(nextParam, fallback);
      if (destination.startsWith("/admin") && !staff) destination = "/dashboard";
      router.replace(destination);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <GateFrame
      heroSrc="/images/login-gift-cards.png?v=4"
      title="Welcome back"
      lede="Sign in securely with your email and password."
      footer={
        <div className="gate-panel">
          <span className="gate-mark">
            <UserPlusIcon />
          </span>
          <p>Don&apos;t have an account?</p>
          <Link href="/register">
            <UserPlusIcon />
            Create an account
          </Link>
        </div>
      }
    >
      <div className="gate-tabs" role="tablist" aria-label="Sign in method">
        <button type="button" role="tab" aria-selected={mode === "password"} className={mode === "password" ? "is-on" : undefined} onClick={() => { setMode("password"); setError(null); }}>
          <LockIcon />
          <span className="gate-tab-label-full">Password</span>
          <span className="gate-tab-label-short" aria-hidden>
            Password
          </span>
        </button>
        <button type="button" role="tab" aria-selected={mode === "otp"} className={mode === "otp" ? "is-on" : undefined} onClick={() => { setMode("otp"); setError(null); }}>
          <MailIcon />
          <span className="gate-tab-label-full">OTP / Email</span>
          <span className="gate-tab-label-short" aria-hidden>
            OTP
          </span>
        </button>
      </div>
      {error || queryError ? <p className="form-error">{error || queryError}</p> : null}
      {mode === "password" ? (
        <form
          className="gate-form"
          method="post"
          action="/api/auth/login"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void signIn(String(data.get("email") ?? ""), String(data.get("password") ?? ""));
          }}
        >
          {nextParam ? <input type="hidden" name="next" value={nextParam} /> : null}
          <label className="gate-field">
            <span>Email</span>
            <div className="gate-input">
              <MailIcon />
              <input
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </div>
          </label>
          <label className="gate-field">
            <span>Password</span>
            <div className="gate-input">
              <KeyIcon />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                required
              />
              <button type="button" className="gate-eye" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>
                <EyeIcon off={showPassword} />
              </button>
            </div>
          </label>
          <span className="gate-forgot">
            <Link href="/forgot-password">Forgot password?</Link>
          </span>
          <button type="submit" className="gate-submit" disabled={pending}>
            <ArrowIcon />
            {pending ? "Please wait…" : "Log in"}
          </button>
        </form>
      ) : (
        <form
          className="gate-form"
          method="post"
          action="/login"
          onSubmit={(event) => {
            event.preventDefault();
            setError("Email code sign-in is not available yet. Use the Password tab.");
          }}
        >
          <label className="gate-field">
            <span>Email</span>
            <div className="gate-input">
              <MailIcon />
              <input
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </div>
          </label>
          <button type="submit" className="gate-submit">
            <MailIcon />
            Send login code
          </button>
        </form>
      )}
    </GateFrame>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="gate-loading">Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
