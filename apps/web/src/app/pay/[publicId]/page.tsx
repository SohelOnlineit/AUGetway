"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { CheckoutCard } from "@uniqpay/types";
import { api } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";
import { applySiteChrome, customBrand } from "@/lib/site";

type Lang = "bn" | "en";
type Filter = "all" | "mfs" | "bank";

async function readReceipt(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return "";
  if (!value.type.startsWith("image/")) throw new Error("Receipt must be an image");
  if (value.size > 1_200_000) throw new Error("Receipt must be under 1.2 MB");
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the receipt"));
    reader.readAsDataURL(value);
  });
}

function returnHref(url: string, invoiceId: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password) return "";
  const join = parsed.search ? "&" : "?";
  return `${parsed.toString()}${join}invoice_id=${encodeURIComponent(invoiceId)}`;
}

function safeHttp(url: string | null | undefined) {
  if (!url) return "";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password) return "";
  return parsed.toString();
}

function moneyText(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : value;
}

function leftClock(expiresAt: string, now: number) {
  const left = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function shortId(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 14)}...`;
}

function methodKind(label: string): Filter | "other" {
  const name = label.toLowerCase();
  if (["bkash", "nagad", "rocket", "upay", "cellfin", "tap"].some((key) => name.includes(key))) return "mfs";
  if (["bank", "qr", "bangla", "brac", "islami", "city", "ebl", "eastern", "dutch", "dbbl"].some((key) => name.includes(key))) return "bank";
  return "other";
}

function text(lang: Lang, en: string, bn: string) {
  return lang === "bn" ? bn : en;
}

async function copyValue(value: string) {
  await navigator.clipboard.writeText(value);
}

function CopyButton({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <button type="button" className={done ? "ck-copy-btn done" : "ck-copy-btn"} aria-label={done ? "Copied" : "Copy"} onClick={onClick}>
      <svg className="ico-copy" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      <svg className="ico-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </button>
  );
}

const BRAND_LOGOS: { key: string; src: string; alt: string }[] = [
  { key: "bkash", src: "/gateways/bkash.png?v=4", alt: "bKash" },
  { key: "nagad", src: "/gateways/nagad.png?v=3", alt: "Nagad" },
  { key: "rocket", src: "/gateways/rocket.png?v=3", alt: "Rocket" },
  { key: "upay", src: "/gateways/upay.png?v=3", alt: "Upay" },
  { key: "upai", src: "/gateways/upay.png?v=3", alt: "Upay" },
];

function MethodMark({ label }: { label: string }) {
  const name = label.toLowerCase();
  const brand = BRAND_LOGOS.find((item) => name.includes(item.key));
  if (brand) return <img className="ck-brand-logo" src={brand.src} alt={brand.alt} />;
  if (name.includes("binance")) {
    return (
      <span className="ck-logo binance">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2l3.1 3.1-3.1 3.1-3.1-3.1L12 2.2zm-6.7 6.7l3.1 3.1-3.1 3.1L2.2 12l3.1-3.1zM12 8.9l3.1 3.1-3.1 3.1-3.1-3.1L12 8.9zm6.7 0l3.1 3.1-3.1 3.1-3.1-3.1 3.1-3.1zM12 15.6l3.1 3.1-3.1 3.1-3.1-3.1 3.1-3.1z" /></svg>
        BINANCE
      </span>
    );
  }
  return <span className="ck-logo plain">{label.trim()}</span>;
}

function PayMark() {
  return (
    <span className="ck-pay-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <rect x="3" y="5.5" width="18" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M3 10h18" fill="none" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    </span>
  );
}

export default function PayPage() {
  const params = useParams<{ publicId: string }>();
  const [card, setCard] = useState<CheckoutCard | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(0);
  const [lang, setLang] = useState<Lang>("en");
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setPicked] = useState("");
  const [picking, setPicking] = useState(true);
  const [copied, setCopied] = useState("");
  const chromeApplied = useRef(false);
  const generation = useRef(0);

  async function load(resetPick = false) {
    const gen = generation.current;
    const next = await api<CheckoutCard>(`/public/pay/${params.publicId}`);
    if (gen !== generation.current) return next;
    setCard(next);
    if (resetPick) setPicking(next.status === "open" || !next.method);
    return next;
  }

  useEffect(() => {
    load(true).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Checkout not found"));
  }, [params.publicId]);

  useEffect(() => {
    if (!card?.site || chromeApplied.current) return;
    chromeApplied.current = true;
    applySiteChrome(card.site, { layout: true });
  }, [card?.site]);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!card || card.status === "paid" || card.status === "failed" || card.status === "expired") return;
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [card?.status, params.publicId]);

  async function flashCopy(key: string, value: string) {
    try {
      await copyValue(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? "" : current)), 1600);
    } catch {
      setError(text(lang, "Could not copy", "কপি করা যায়নি"));
    }
  }

  async function paySelected() {
    if (!picked) return;
    setPending(true);
    setError("");
    const gen = ++generation.current;
    try {
      const next = await api<CheckoutCard>(`/public/pay/${params.publicId}/method`, {
        method: "POST",
        body: JSON.stringify({ methodId: picked }),
      });
      if (gen !== generation.current) return;
      generation.current = gen + 1;
      setCard(next);
      setPicking(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not choose method");
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      setCard(await api<CheckoutCard>(`/public/pay/${params.publicId}/proof`, {
        method: "POST",
        body: JSON.stringify({
          providerRef: String(form.get("providerRef") ?? ""),
          payerAccount: String(form.get("payerAccount") ?? ""),
          receipt: await readReceipt(form.get("receipt")),
        }),
      }));
      setPicking(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit");
    } finally {
      setPending(false);
    }
  }

  const methods = (card?.methods ?? []).filter((method) => filter === "all" || methodKind(method.label) === filter);
  const showPicker = !card || card.status === "open" || (card.status === "waiting" && picking);
  const amount = card ? moneyText(card.payable) : "0.00";
  const subtotal = card ? moneyText(card.amount) : "0.00";
  const currency = card?.currency || card?.site?.currency || "BDT";
  const symbol = card?.site?.currencySymbol || "";
  const reference = card?.reference || card?.publicId || "";
  const priced = (value: string) => (symbol ? `${symbol} ${value}` : `${value} ${currency}`);
  const supportHref = card?.site?.supportPhone ? `tel:${card.site.supportPhone}` : card?.site?.supportEmail ? `mailto:${card.site.supportEmail}` : "";
  const supportLabel = card?.site?.supportPhone || card?.site?.supportEmail || text(lang, "Support", "সহায়তা");
  const cartHref = safeHttp(card?.cancelUrl);
  const cartLabel = text(lang, "Back to cart", "কার্টে ফিরে যান");
  function cartButton() {
    const mark = <span className="ck-cart-mark"><svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg></span>;
    if (cartHref) return <a className="ck-cart" href={cartHref}>{mark}{cartLabel}</a>;
    return <button type="button" className="ck-cart" onClick={() => window.history.back()}>{mark}{cartLabel}</button>;
  }

  return (
    <main className="ck-page">
      <section className="ck-card">
        <aside className="ck-side">
          <div className="ck-side-top">
            <div className="ck-brand" aria-label={card?.site?.brandName || "UniQbd"}>
              {card?.site?.brandLogo ? <img className="ck-site-logo" src={card.site.brandLogo} alt="" /> : (
                <span className="ck-bag" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M6.5 8.5h11l-.8 11.2a1.5 1.5 0 0 1-1.5 1.3H8.8a1.5 1.5 0 0 1-1.5-1.3L6.5 8.5Z" stroke="#00F5A0" strokeWidth="1.7" />
                    <path d="M9 8.4V6.8A3 3 0 0 1 12 3.8a3 3 0 0 1 3 3v1.6" stroke="#00F5A0" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </span>
              )}
              {customBrand(card?.site) ? <span className="ck-word">{card?.site?.brandName}</span> : <span className="ck-word">Uni<span>Q</span>bd</span>}
            </div>

            <div className="ck-trx">
              <div className="ck-trx-row">
                <span>Trx ID:</span>
                <strong>{reference ? shortId(reference) : "…"}</strong>
                <button type="button" className="ck-icon-btn" aria-label="Copy transaction id" onClick={() => reference && flashCopy("trx", reference)}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </button>
                {copied === "trx" ? <em>{text(lang, "Copied", "কপি")}</em> : null}
              </div>
              {card && card.status !== "paid" && card.status !== "failed" && card.status !== "expired" ? (
                <div className="ck-expiry"><i />Expires in <b>{now ? leftClock(card.expiresAt, now) : "—"}</b></div>
              ) : null}
              {card?.status === "paid" ? <div className="ck-expiry"><i />{text(lang, "Payment verified", "পেমেন্ট সফল হয়েছে")}</div> : null}
            </div>

            <div className="ck-amount">
              <p>{text(lang, "Payable amount", "পরিশোধযোগ্য পরিমাণ")}</p>
              <strong>{symbol ? priced(amount) : <>{amount} <span>{currency}</span></>}</strong>
              {card?.site?.checkoutNote ? <p className="ck-site-note">{card.site.checkoutNote}</p> : null}
              <div className="ck-break">
                <div><span>{text(lang, "Subtotal", "সাবটোটাল")}</span><b>{priced(subtotal)}</b></div>
                <div className="total"><span>{text(lang, "Total", "সর্বমোট")}</span><b>{priced(amount)}</b></div>
              </div>
            </div>
          </div>
          <div className="ck-tools">
          <button type="button" className="ck-lang" onClick={() => setLang(lang === "bn" ? "en" : "bn")}>
            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>
            {lang === "bn" ? "English" : "বাংলা"}
          </button>
          <ThemeToggle />
          </div>
        </aside>

        <section className="ck-main">
          <div className="ck-main-top">
          {showPicker ? null : <div className="ck-cart-row">{cartButton()}</div>}
          {showPicker ? (
            <div className="ck-picker">
              <header>
                {cartButton()}
                <h2>{text(lang, "Payment options", "পেমেন্ট মাধ্যমসমূহ")}</h2>
                <span className="ck-step">{text(lang, "Step 1 of 2", "ধাপ ১ / ২")}</span>
              </header>
              <div className="ck-tabs">
                <button type="button" className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h4v4H4zM14 6h4v4h-4zM4 16h4v4H4zM14 16h4v4h-4z" /></svg>
                  {text(lang, "All options", "সবগুলো")}
                </button>
                <button type="button" className={filter === "mfs" ? "on" : ""} onClick={() => setFilter("mfs")}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 3h8a2 2 0 012 2v14a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zm4 16h.01" /></svg>
                  {text(lang, "Mobile banking", "মোবাইল ব্যাংকিং")}
                </button>
                <button type="button" className={filter === "bank" ? "on" : ""} onClick={() => setFilter("bank")}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 10h16M6 10V6l6-3 6 3v4M6 10v8m6-8v8m6-8v8M4 18h16" /></svg>
                  {text(lang, "Bank transfer", "ব্যাংক ট্রান্সফার")}
                </button>
              </div>
              <div className="ck-grid">
                {methods.map((method) => (
                  <button type="button" key={method.id} className={picked === method.id ? "ck-tile on" : "ck-tile"} onClick={() => setPicked(method.id)}>
                    <span className="ck-check">✓</span>
                    <span className="ck-logo-box"><MethodMark label={method.label} /></span>
                    <span className="ck-line" />
                    <span className="ck-name">{method.label}</span>
                  </button>
                ))}
              </div>
              {card && methods.length === 0 ? <p className="ck-empty">{text(lang, "No payment method is turned on.", "কোনো পেমেন্ট মাধ্যম চালু নেই।")}</p> : null}
            </div>
          ) : null}

          {card && !showPicker && card.method && (card.status === "waiting" || card.status === "pending") ? (
            <form className="ck-verify" onSubmit={onSubmit}>
              <div className="ck-verify-top">
                {card.status === "waiting" ? (
                  <button type="button" className="ck-back" onClick={() => setPicking(true)}>
                    <span className="ck-back-mark" aria-hidden="true">
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </span>
                    {text(lang, "Change method", "পেমেন্ট মাধ্যম পরিবর্তন")}
                  </button>
                ) : <span />}
                <span className="ck-active" aria-label={card.method.label}><MethodMark label={card.method.label} /></span>
                {cartButton()}
              </div>
              <p className="ck-note">
                {card.method.instructions || text(lang, `Send exactly ${amount} ${currency}.`, `ঠিক ${amount} ${currency} পাঠান।`)}
              </p>
              {card.method.qrImage ? <img className="ck-qr" src={card.method.qrImage} alt="" /> : null}
              {card.method.accountNumber ? (
                <div className="ck-copy">
                  <div>
                    <small>{text(lang, "Send to this number", "এই নম্বরে টাকা পাঠান")}</small>
                    <b>{card.method.accountNumber}</b>
                  </div>
                  <CopyButton done={copied === "num"} onClick={() => flashCopy("num", card.method?.accountNumber ?? "")} />
                </div>
              ) : null}
              <div className="ck-copy">
                <div>
                  <small>{text(lang, "Send exactly", "পাঠানোর সঠিক পরিমাণ")}</small>
                  <b>{priced(amount)}</b>
                </div>
                <CopyButton done={copied === "amt"} onClick={() => flashCopy("amt", amount)} />
              </div>
              {card.method.verifyBy === "sender_number" ? (
                <label className="ck-field">
                  <span>{text(lang, "Sender number", "যে নম্বর থেকে পাঠাবেন")}</span>
                  <input name="payerAccount" required inputMode="numeric" pattern="01[3-9][0-9]{8}" placeholder="01XXXXXXXXX" />
                </label>
              ) : null}
              {card.method.verifyBy === "unique_amount" ? (
                <>
                  <p className="ck-wait"><i />{text(lang, "Waiting for your payment...", "পেমেন্টের জন্য অপেক্ষা করা হচ্ছে...")}</p>
                  <p className="ck-note">{text(lang, "After you pay, wait 15 seconds. If it is not verified automatically, enter your Transaction ID in the box to finish verification.", "পেমেন্টের পর ১৫ সেকেন্ড অপেক্ষা করুন, অটো ভেরিফিকেশন না হলে ট্রানজেকশন বক্সে আপনার Transaction ID দিয়ে ভেরিফিকেশন সম্পন্ন করুন।")}</p>
                  <label className="ck-field">
                    <span>{text(lang, "Enter Transaction ID", "ট্রানজেকশন আইডি লিখুন")}</span>
                    <input className="ck-ref" name="providerRef" minLength={8} maxLength={20} autoComplete="off" placeholder="8N70O2M4RB" />
                  </label>
                </>
              ) : null}
              {card.method.verifyBy !== "unique_amount" && card.method.verifyBy !== "sender_number" ? (
                <>
                  <label className="ck-field">
                    <span>{text(lang, "Enter Transaction ID *", "ট্রানজেকশন আইডি লিখুন *")}</span>
                    <input className="ck-ref" name="providerRef" required minLength={8} maxLength={20} autoComplete="off" placeholder="8N70O2M4RB" />
                  </label>
                  <label className="ck-field">
                    <span>{text(lang, "Your wallet number", "আপনার ওয়ালেট নম্বর")}</span>
                    <input name="payerAccount" required minLength={6} />
                  </label>
                </>
              ) : null}
              {card.method.acceptProof ? (
                <label className="ck-field">
                  <span>{text(lang, "Receipt image", "রসিদের ছবি")}</span>
                  <input name="receipt" type="file" accept="image/*" />
                </label>
              ) : null}
              {card.status === "pending" ? <p className="ck-note">{text(lang, "This payment is pending a check.", "পেমেন্টটি যাচাইয়ের অপেক্ষায়।")}</p> : null}
              {card.providerRef ? <p className="ck-note">{text(lang, `Waiting for confirmation of ${card.providerRef}.`, `${card.providerRef} নিশ্চিত হওয়ার অপেক্ষায়।`)}</p> : null}
              <button className="ck-pay on" disabled={pending} type="submit">
                {text(lang, card.method.verifyBy === "unique_amount" ? "Submit" : "I have paid", card.method.verifyBy === "unique_amount" ? "সাবমিট করুন" : "পেমেন্ট যাচাই করুন")}
              </button>
            </form>
          ) : null}

          {card?.status === "paid" ? (
            <div className="ck-done">
              <h2>{text(lang, "Payment successful", "পেমেন্ট সফল হয়েছে")}</h2>
              <p>{text(lang, "Your transaction has been verified.", "আপনার লেনদেন যাচাই হয়েছে।")}</p>
              {card.successUrl && returnHref(card.successUrl, params.publicId) ? <a className="ck-pay on" href={returnHref(card.successUrl, params.publicId)}>{text(lang, "Return to merchant", "মার্চেন্টে ফিরে যান")}</a> : null}
            </div>
          ) : null}
          {card?.status === "failed" ? <div className="ck-done"><h2>{text(lang, "Payment was not accepted", "পেমেন্ট গ্রহণ করা হয়নি")}</h2></div> : null}
          {card?.status === "expired" ? <div className="ck-done"><h2>{text(lang, "This checkout has expired", "চেকআউটের সময় শেষ")}</h2></div> : null}
          {error ? <p className="ck-error">{error}</p> : null}
          </div>

          <footer className="ck-foot">
            {showPicker ? (
              <button type="button" className={picked ? "ck-pay on" : "ck-pay"} disabled={!picked || pending} onClick={paySelected}>
                <PayMark />
                <span>{text(lang, `Pay ${priced(amount)}`, `পেমেন্ট করুন ${priced(amount)}`)}</span>
              </button>
            ) : null}
            {card?.cancelUrl ? (
              <a className="ck-cancel" href={card.cancelUrl}>{text(lang, "Cancel and return to merchant", "বাতিল করে মার্চেন্টে ফিরে যান")}</a>
            ) : showPicker ? (
              <span className="ck-cancel">{text(lang, "Cancel and return to merchant", "বাতিল করে মার্চেন্টে ফিরে যান")}</span>
            ) : null}
            {card?.site?.faqContent ? (
              <div className="ck-faq">
                <strong>{card.site.faqTitle || text(lang, "FAQ", "প্রশ্নোত্তর")}</strong>
                <p>{card.site.faqContent}</p>
              </div>
            ) : null}
            <div className="ck-secure">
              <span>
                <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636l-3.536 3.536m0 5.656 3.536 3.536M9.172 9.172 5.636 5.636m3.536 9.192-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                {supportHref ? <a href={supportHref}>{supportLabel}</a> : supportLabel}
              </span>
              <span className="ssl">
                <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                256-Bit SSL Encrypted
              </span>
            </div>
          </footer>
        </section>
      </section>
    </main>
  );
}
