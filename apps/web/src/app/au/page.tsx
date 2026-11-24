"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, readToken, saveToken } from "@/lib/token";
import { ThemeToggle } from "@/components/theme-toggle";
import { TurnstileField } from "@/components/turnstile-field";
import { applySiteChrome, type PublicSite } from "@/lib/site";

// Kept on the page itself. After an update the browser can still hold an old copy whose style file
// no longer exists. These rules keep the logo small and the form stacked until the new page arrives.
const LOGIN_STYLE = `
body{min-height:100vh;margin:0;color:#f8fafc;background:radial-gradient(ellipse 80% 50% at 50% -10%,rgb(38 191 176 / .16),transparent 55%),#01131a}
html[data-theme="light"] body{color:#0f172a;background:radial-gradient(ellipse 80% 50% at 50% -10%,rgb(38 191 176 / .16),transparent 55%),#f8fafc}
.pay-shell{width:min(520px,calc(100% - 28px));margin:40px auto 70px}
.pay-shell .brand-logo{display:block;height:42px;width:auto;max-width:180px;object-fit:contain}
.pay-shell .kicker{margin:0 0 8px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8}
.pay-shell form.card{display:flex;flex-direction:column;gap:12px;padding:18px;border-radius:18px;background:#031a22;border:1px solid #0e2832}
html[data-theme="light"] .pay-shell form.card{background:#fff;border-color:#e2e8f0}
.pay-shell label{display:flex;flex-direction:column;gap:6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8}
.pay-shell input{box-sizing:border-box;width:100%;padding:11px 12px;border-radius:12px;border:1px solid #0e2832;background:#06212a;color:#f8fafc}
html[data-theme="light"] .pay-shell input{border-color:#e2e8f0;background:#f1f5f9;color:#0f172a}
.pay-shell .btn{display:block;width:100%;border:0;border-radius:999px;padding:12px 16px;background:#0f766e;color:#fff;font-weight:700;cursor:pointer}
.pay-shell .ts-widget{min-height:65px;display:flex;justify-content:center}
`;

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
    api<{ accessToken?: string }>("/auth/me")
      .then((row) => {
        if (row.accessToken) saveToken(row.accessToken);
        router.replace("/admin");
      })
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
      <style>{LOGIN_STYLE}</style>
      <div className="row" style={{ justifyContent: "flex-end" }}><ThemeToggle /></div>
      <p className="kicker">Desk sign in</p>
      {site?.brandLogo
        ? <img className="brand-logo" src={site.brandLogo} alt={!site.brandName || site.brandName === "UniqBD Pay" ? "AU-Getway" : site.brandName} />
        : <h1 className="gate-title">{!site?.brandName || site.brandName === "UniqBD Pay" ? "AU-Getway" : site.brandName}</h1>}
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
