"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api";
import { applySiteChrome, type PublicSite } from "@/lib/site";

export default function HomePage() {
  const [site, setSite] = useState<PublicSite | null>(null);
  useEffect(() => {
    api<PublicSite>("/public/site").then(setSite).catch(() => undefined);
  }, []);
  useEffect(() => {
    applySiteChrome(site, { layout: true });
  }, [site]);
  const brand = site?.brandName || "UniqBD Pay";
  return (
    <main className="wrap">
      <header className="top">
        <Link href="/" className="brand">
          {site?.brandLogo ? <img className="brand-logo" src={site.brandLogo} alt="" /> : <span className="mark">{brand.slice(0, 1)}</span>}
          {brand}
        </Link>
        <nav className="nav">
          <a href="#flow">How it works</a>
          <ThemeToggle />
        </nav>
      </header>
      <section className="hero">
        <div>
          <p className="kicker">Pay desk for UniqBD</p>
          <h1>Collect a payment without handing over your store.</h1>
          <p className="lede">
            Create a checkout, send the customer a link, and confirm it from the desk or from the UniqBD handset app on your own Android phone.
          </p>
          <div className="row">
            <a href="#flow" className="btn">See the flow</a>
          </div>
        </div>
        <aside className="receipt">
          <header>
            <span>{brand}</span>
            <span>Checkout</span>
          </header>
          <div className="amount">৳ 1,250.00</div>
          <p className="muted">Reference · store order</p>
          <div className="rule" />
          <p>Customer pays the number you publish. You confirm the wallet reference. The order is marked paid on this desk.</p>
        </aside>
      </section>
      <section className="steps" id="flow">
        <article className="card">
          <strong>1. Open a checkout</strong>
          <p>Set the amount and reference from the desk, a bill, a payment link, or your own server key.</p>
        </article>
        <article className="card">
          <strong>2. Customer pays</strong>
          <p>They pick a wallet method, send the exact payable amount, and type the transaction reference.</p>
        </article>
        <article className="card">
          <strong>3. You confirm</strong>
          <p>Mark it paid on the desk, or paste the payment message from your own phone in the handset app.</p>
        </article>
      </section>
    </main>
  );
}
