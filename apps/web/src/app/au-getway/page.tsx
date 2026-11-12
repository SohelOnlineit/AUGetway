"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, readToken, saveToken } from "@/lib/token";
import { ThemeToggle } from "@/components/theme-toggle";
import { applySiteChrome, type PublicSite } from "@/lib/site";

export default function DeskGatePage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
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
        }),
      });
      saveToken(result.accessToken);
      router.push("/admin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="pay-shell">
      <div className="row" style={{ justifyContent: "flex-end" }}><ThemeToggle /></div>
      <p className="kicker">Desk sign in</p>
      {site?.brandLogo ? <img className="brand-logo" src={site.brandLogo} alt="" /> : null}
      <h1 className="gate-title">{site?.brandName || "UniqBD Pay"}</h1>
      <form className="card" onSubmit={onSubmit}>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input name="password" type="password" autoComplete="current-password" minLength={8} required />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn wide" disabled={pending} type="submit">
          {pending ? "Signing in…" : "Enter desk"}
        </button>
      </form>
    </main>
  );
}
