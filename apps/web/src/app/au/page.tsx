"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, readToken, saveToken } from "@/lib/token";
import { ThemeToggle } from "@/components/theme-toggle";
import { TurnstileField } from "@/components/turnstile-field";
import { applySiteChrome, type PublicSite } from "@/lib/site";

export default function DeskGatePage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [needCode, setNeedCode] = useState(false);
  const [site, setSite] = useState<PublicSite | null>(null);

  useEffect(() => {
    api<PublicSite>("/public/site").then(setSite).catch(() => undefined);
  }, []);
  useEffect(() => {
    const token = readToken();
    if (!token) return;
    api("/auth/me")
      .then(() => router.replace("/admin"))
      .catch(() => clearToken());
  }, [router]);
  useEffect(() => {
    applySiteChrome(site, { layout: true });
  }, [site]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const result = await api<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
          turnstileToken: captchaToken || undefined,
          code: String(form.get("code") ?? "").trim() || undefined,
        }),
      });
      saveToken(result.accessToken);
      router.push("/admin");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not sign in";
      if (message === "TWO_FACTOR_REQUIRED") {
        // The password was right. This account also needs the code from its authenticator app.
        setNeedCode(true);
        setError("Enter the 6-digit code from your authenticator app.");
      } else {
        setError(message);
      }
      // A Cloudflare token works once, so ask for a fresh one after a failed try.
      setCaptchaReset((value) => value + 1);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="pay-shell">
      <div className="row" style={{ justifyContent: "flex-end" }}><ThemeToggle /></div>
      <p className="kicker">Desk sign in</p>
      {site?.brandLogo ? <img className="brand-logo" src={site.brandLogo} alt="" /> : null}
      <h1 className="gate-title">{!site?.brandName || site.brandName === "UniqBD Pay" ? "AU-Getway" : site.brandName}</h1>
      <form className="card" onSubmit={onSubmit}>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input name="password" type="password" autoComplete="current-password" minLength={8} required />
        </label>
        {needCode ? (
          <label className="field">
            <span>Authenticator code</span>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} placeholder="123456" autoFocus required />
          </label>
        ) : null}
        <TurnstileField resetKey={captchaReset} onToken={setCaptchaToken} onRequired={setCaptchaRequired} />
        {error ? <p className="error">{error}</p> : null}
        <button className="btn wide" disabled={pending || (captchaRequired && !captchaToken)} type="submit">
          {pending ? "Signing in…" : "Enter desk"}
        </button>
      </form>
    </main>
  );
}
