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

function returnHref(url: string, invoiceId: string, paid = false) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password) return "";
  const path = parsed.pathname.replace(/\/+$/, "");
  if (paid && path === `/pay/${invoiceId}`) return "";
  parsed.searchParams.set("invoice_id", invoiceId);
  if (paid) parsed.searchParams.set("status", "SUCCESS");
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
  const [trxWarn, setTrxWarn] = useState(false);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(0);
  const [lang, setLang] = useState<Lang>("bn");
  const langChosen = useRef(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setPicked] = useState("");
  const [picking, setPicking] = useState(true);
  const [copied, setCopied] = useState("");
  const [rulesOn, setRulesOn] = useState(false);
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
    if (langChosen.current) return;
    setLang(card?.site?.checkoutLang === "en" ? "en" : "bn");
  }, [card?.site?.checkoutLang]);

  useEffect(() => {
    setRulesOn(false);
  }, [card?.method?.id]);

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
    }, 2000);
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
      const message = cause instanceof Error ? cause.message : "Could not submit";
      if (message.includes("TRX_USED") || /already used/i.test(message)) setTrxWarn(true);
      else setError(message);
    } finally {
      setPending(false);
    }
  }

  const showMethodTabs = card?.site?.methodTabs === "1";
  const methods = (card?.methods ?? []).filter((method) => !showMethodTabs || filter === "all" || methodKind(method.label) === filter);
  const showPicker = !card || card.status === "open" || (card.status === "waiting" && picking);
  const onVerify = Boolean(card && !showPicker && card.method && (card.status === "waiting" || card.status === "pending"));
  const amount = card ? moneyText(card.payable) : "0.00";
  const subtotal = card ? moneyText(card.amount) : "0.00";
  const currency = card?.currency || card?.site?.currency || "BDT";
  const symbol = card?.site?.currencySymbol || "";
  const reference = card?.reference || card?.publicId || "";
  const priced = (value: string) => (symbol ? `${symbol} ${value}` : `${value} ${currency}`);
  const supportHref = card?.site?.supportPhone ? `tel:${card.site.supportPhone}` : card?.site?.supportEmail ? `mailto:${card.site.supportEmail}` : "";
  const supportLabel = card?.site?.supportPhone || card?.site?.supportEmail || text(lang, "Support", "সহায়তা");
  const cancelHref = returnHref(card?.cancelUrl ?? "", params.publicId);
  const successHref = card?.status === "paid"
    ? returnHref(card.successUrl ?? "", params.publicId, true) || returnHref(card.cancelUrl ?? "", params.publicId, true)
    : "";
  const cartHref = card?.status === "paid" ? successHref || cancelHref : cancelHref;
  const cartLabel = text(lang, "Back to cart", "কার্টে ফিরে যান");
  const returnMs = 5000;
  const [leaveLeft, setLeaveLeft] = useState(returnMs);
  useEffect(() => {
    if (!successHref) return;
    const started = Date.now();
    setLeaveLeft(returnMs);
    const tick = window.setInterval(() => {
      setLeaveLeft(Math.max(0, returnMs - (Date.now() - started)));
    }, 50);
    const go = window.setTimeout(() => window.location.assign(successHref), returnMs);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(go);
    };
  }, [successHref]);
  const leaveShown = (leaveLeft / 1000).toFixed(1);
  const doorOpen = successHref ? Math.min(68, (1 - leaveLeft / returnMs) * 68) : 0;
  function cartButton(compact = false, onBack?: () => void) {
    const label = compact ? text(lang, "Back", "ফিরে") : cartLabel;
    const mark = <span className="ck-cart-mark"><svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg></span>;
    if (onBack) return <button type="button" className="ck-cart" onClick={onBack} aria-label={label}>{mark}{label}</button>;
    if (cartHref) return <a className="ck-cart" href={cartHref} aria-label={cartLabel}>{mark}{label}</a>;
    return <button type="button" className="ck-cart" onClick={() => window.history.back()} aria-label={cartLabel}>{mark}{label}</button>;
  }
  function brandMark() {
    return (
      <div className="ck-brand" aria-label={card?.site?.brandName || "AU-Getway"}>
        {card?.site?.brandLogo ? <img className="ck-site-logo" src={card.site.brandLogo} alt="" /> : null}
        <span className="ck-word">{customBrand(card?.site) ? card?.site?.brandName : "AU-Getway"}</span>
      </div>
    );
  }
  function trxRow() {
    return (
      <div className="ck-trx-row">
        <span>Trx ID:</span>
        <strong>{reference ? shortId(reference) : "…"}</strong>
        <button type="button" className="ck-icon-btn" aria-label="Copy transaction id" onClick={() => reference && flashCopy("trx", reference)}>
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        </button>
        {copied === "trx" ? <em>{text(lang, "Copied", "কপি")}</em> : null}
      </div>
    );
  }
  function langButton(line = false) {
    return (
      <button type="button" className={line ? "ck-lang ck-lang-line" : "ck-lang"} onClick={() => { langChosen.current = true; setLang(lang === "bn" ? "en" : "bn"); }}>
        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>
        {lang === "bn" ? "English" : "বাংলা"}
      </button>
    );
  }
  function expiryPill(place: "side" | "pay") {
    if (card && card.status !== "paid" && card.status !== "failed" && card.status !== "expired") {
      return <div className={`ck-expiry ck-expiry-${place}`}><i />Expires in <b>{now ? leftClock(card.expiresAt, now) : "—"}</b></div>;
    }
    if (place === "side" && card?.status === "paid") {
      return <div className="ck-expiry ck-expiry-side"><i />{text(lang, "Payment verified", "পেমেন্ট সফল হয়েছে")}</div>;
    }
    return null;
  }

  return (
    <main className="ck-page">
      <section className="ck-card">
        {showPicker || onVerify ? (
          <header className="ck-mhead">
            {onVerify && card?.status === "waiting" ? cartButton(true, () => setPicking(true)) : cartButton(true)}
            {brandMark()}
            <span className="ck-step">{onVerify ? text(lang, "Step 2 of 2", "ধাপ ২ / ২") : text(lang, "Step 1 of 2", "ধাপ ১ / ২")}</span>
            {trxRow()}
            <ThemeToggle />
            <h2>{onVerify ? card?.method?.label : text(lang, "Payment options", "পেমেন্ট মাধ্যমসমূহ")}</h2>
          </header>
        ) : null}
        <aside className="ck-side">
          <div className="ck-side-top">
            {brandMark()}

            <div className="ck-trx">
              {trxRow()}
              {expiryPill("side")}
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
          {langButton()}
          <ThemeToggle />
          </div>
        </aside>

        <section className="ck-main">
          <div className="ck-main-top">
          {showPicker || card?.status === "paid" ? null : <div className="ck-cart-row">{cartButton()}</div>}
          {showPicker ? (
            <div className="ck-picker">
              <header>
                {cartButton()}
                <h2>{text(lang, "Payment options", "পেমেন্ট মাধ্যমসমূহ")}</h2>
                <span className="ck-step">{text(lang, "Step 1 of 2", "ধাপ ১ / ২")}</span>
              </header>
              {showMethodTabs ? <div className="ck-tabs">
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
              </div> : null}
              <div className="ck-grid">
                {methods.map((method) => (
                  <button type="button" key={method.id} className={picked === method.id ? "ck-tile on" : "ck-tile"} onClick={() => setPicked(method.id)}>
                    <span className="ck-check">✓</span>
                    <span className="ck-logo-box"><MethodMark label={method.label} /></span>
                    {method.logoCaption?.trim() ? <span className="ck-logo-caption">{method.logoCaption.trim()}</span> : null}
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
                <span className="ck-active-stack">
                  <span className="ck-active" aria-label={card.method.label}><MethodMark label={card.method.label} /></span>
                  {card.method.logoCaption?.trim() ? <span className="ck-logo-caption">{card.method.logoCaption.trim()}</span> : null}
                </span>
                {cartButton()}
              </div>
              {card.method.qrImage ? <img className="ck-qr" src={card.method.qrImage} alt="" /> : null}
              {card.method.accountNumber ? (
                <div className="ck-number">
                  <div className="ck-copy">
                    <button type="button" className={rulesOn ? "ck-info on" : "ck-info"} aria-expanded={rulesOn} aria-label={text(lang, "Payment rules", "পেমেন্টের নিয়ম")} onClick={() => setRulesOn((open) => !open)}>
                      i
                    </button>
                    <div>
                      <small>{card.method.internalLabel?.trim() || text(lang, "Send to this number", "নিচের নাম্বারে বিকাশের পেমেন্ট অপশন থেকে পেমেন্ট করুন।")}</small>
                      <b>{card.method.accountNumber}</b>
                    </div>
                    <CopyButton done={copied === "num"} onClick={() => flashCopy("num", card.method?.accountNumber ?? "")} />
                  </div>
                  {rulesOn ? <p className="ck-rules">{card.method.instructions?.trim() || text(lang, "No payment rules have been added for this gateway.", "এই গেটওয়ের জন্য এখনো কোনো পেমেন্ট নিয়ম যোগ করা হয়নি।")}</p> : null}
                </div>
              ) : null}
              <div className="ck-copy">
                <div>
                  <small>{text(lang, "Send exactly", "টাকা পাঠানোর সঠিক পরিমাণ।")}</small>
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
                  <div className="ck-wait-box">
                    <p className="ck-wait"><i />{text(lang, "Waiting For Your Payment..", "পেমেন্টের জন্য অপেক্ষা করা হচ্ছে...")}</p>
                    <p className="ck-note">{text(lang, "After Making Your Payment, Please Wait 10 Seconds For Automatic Verification. If Your Payment is Not Verified Automatically, Enter Your Transaction ID in The Box To Complete The Verification.", "পেমেন্টের পর ১০ সেকেন্ড অপেক্ষা করুন, অটো ভেরিফিকেশন না হলে ট্রানজেকশন বক্সে আপনার Transaction ID দিয়ে ভেরিফিকেশন সম্পন্ন করুন।")}</p>
                  </div>
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
              <div className="ck-pay-line">{expiryPill("pay")}{langButton(true)}</div>
              <button className="ck-pay on" disabled={pending} type="submit">
                {text(lang, card.method.verifyBy === "unique_amount" ? "Submit" : "I have paid", card.method.verifyBy === "unique_amount" ? "সাবমিট করুন" : "পেমেন্ট যাচাই করুন")}
              </button>
            </form>
          ) : null}

          {card?.status === "paid" ? (
            <div className="ck-done">
              {successHref ? (
                <div className="ck-door" aria-hidden="true">
                  <div className="ck-door-frame">
                    <span className="ck-door-glow" />
                    <span className="ck-door-panel" style={{ transform: `perspective(480px) rotateY(-${doorOpen}deg)` }}>
                      <span className="ck-door-window" />
                      <span className="ck-door-knob" />
                    </span>
                  </div>
                </div>
              ) : (
                <span className="ck-done-mark" aria-hidden="true">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
              )}
              <h2>{text(lang, "Payment successful", "পেমেন্ট সফল হয়েছে")}</h2>
              <p>{text(lang, "Your transaction has been verified.", "আপনার লেনদেন যাচাই হয়েছে।")}</p>
              <strong className="ck-done-amount">{priced(amount)}</strong>
              {successHref ? (
                <>
                  <p className="ck-done-wait">{text(lang, "Taking you back to the shop in", "শপে ফিরে যাচ্ছে")}</p>
                  <strong className="ck-done-count">{leaveShown}<small>s</small></strong>
                  <a className="ck-pay on" href={successHref}>{cartLabel}</a>
                </>
              ) : (
                <p className="ck-done-wait">{text(lang, "You can close this page.", "এই পেজটি বন্ধ করতে পারেন।")}</p>
              )}
            </div>
          ) : null}
          {card?.status === "failed" ? <div className="ck-done"><h2>{text(lang, "Payment was not accepted", "পেমেন্ট গ্রহণ করা হয়নি")}</h2></div> : null}
          {card?.status === "expired" ? <div className="ck-done"><h2>{text(lang, "This checkout has expired", "চেকআউটের সময় শেষ")}</h2></div> : null}
          {error ? <p className="ck-error">{error}</p> : null}
          </div>

          <footer className="ck-foot">
            {showPicker ? <div className="ck-pay-line">{expiryPill("pay")}{langButton(true)}</div> : null}
            {showPicker ? (
              <button type="button" className={picked ? "ck-pay on" : "ck-pay"} disabled={!picked || pending} onClick={paySelected}>
                <PayMark />
                <span>{text(lang, `Pay ${priced(amount)}`, `পেমেন্ট করুন ${priced(amount)}`)}</span>
              </button>
            ) : null}
            {card?.status === "paid" ? null : cancelHref ? (
              <a className="ck-cancel" href={cancelHref}>{text(lang, "Cancel and return to merchant", "বাতিল করে মার্চেন্টে ফিরে যান")}</a>
            ) : (
              <button type="button" className="ck-cancel" onClick={() => window.history.back()}>{text(lang, "Cancel and return to merchant", "বাতিল করে মার্চেন্টে ফিরে যান")}</button>
            )}
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
      {trxWarn ? (
        <div className="ck-warn" role="alertdialog" aria-modal="true" aria-labelledby="ck-warn-title">
          <div className="ck-warn-card">
            <div className="ck-warn-ico" aria-hidden="true">
              <i />
              <i />
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M12 8.2v5.2" />
                  <path d="M12 16.8h.01" />
                  <path d="M10.3 4.8 2.9 17.6A2 2 0 0 0 4.6 20.6h14.8a2 2 0 0 0 1.7-3L13.7 4.8a2 2 0 0 0-3.4 0Z" />
                </svg>
              </span>
            </div>
            <h2 id="ck-warn-title">এই ট্রানজেকশন আইডি আগে সাবমিট করা হয়েছে</h2>
            <p>পেন্ডিং বা পেইড অর্ডারে একটি ট্রানজেকশন আইডি একবারই সাবমিট করা যাবে।</p>
            <button type="button" className="ck-pay on" onClick={() => setTrxWarn(false)}>ঠিক আছে</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
