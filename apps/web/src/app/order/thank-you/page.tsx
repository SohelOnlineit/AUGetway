"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function ThankYouContent() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get("order")?.trim() || null;
  const [emailMasked, setEmailMasked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const email = searchParams.get("email")?.trim();
    if (email) setEmailMasked(email);
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("email")) return;
    url.searchParams.delete("email");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  async function copyOrderNumber() {
    if (!orderNumber) return;
    try {
      await navigator.clipboard.writeText(orderNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <main className="order-thank-you-page">
      <div className="order-thank-you-wrap">
        <div className="order-thank-you-glow" aria-hidden />
        <article className="order-thank-you-card">
          <header className="order-thank-you-hero">
            <div className="order-thank-you-check" aria-hidden>
              <svg viewBox="0 0 24 24">
                <path
                  d="M5 12.5l4.2 4.2L19 7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="order-thank-you-badge">Payment confirmed</span>
            <h1>Thank you for your order!</h1>
            <p className="order-thank-you-lead">
              Your payment was received successfully. We&apos;re preparing your digital delivery now.
            </p>
          </header>

          {orderNumber ? (
            <div className="order-thank-you-receipt">
              <span className="order-thank-you-receipt-icon" aria-hidden>
                <svg viewBox="0 0 24 24">
                  <path
                    d="M7 3h10v18l-2-1.4L13 21l-2-1.4L9 21l-2-1.4L5 21V3h2z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div>
                <span className="order-thank-you-receipt-label">Order number</span>
                <div className="order-thank-you-receipt-row">
                  <strong>#{orderNumber}</strong>
                  <button type="button" className="order-pro-copy" onClick={() => void copyOrderNumber()}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <ol className="order-thank-you-steps" aria-label="Order progress">
            <li className="is-done">
              <span aria-hidden />
              Payment received
            </li>
            <li className="is-active">
              <span aria-hidden />
              Preparing delivery
            </li>
            <li>
              <span aria-hidden />
              Codes sent by email
            </li>
          </ol>

          <ul className="order-thank-you-info">
            <li>
              <strong>ইমেইল নোটিফিকেশন</strong>
              <p>
                {emailMasked ? (
                  <>
                    আপনার অর্ডারের ডেলিভারি সংক্রান্ত সকল ইনফরমেশন <strong>{emailMasked}</strong> এই মেইলে পাঠানো
                    হবে।
                  </>
                ) : (
                  <>আপনার অর্ডারের ডেলিভারি সংক্রান্ত সকল ইনফরমেশন আপনার ইমেইলে পাঠানো হবে।</>
                )}
              </p>
            </li>
            <li>
              <strong>ডেলিভারি সময়</strong>
              <p>
                আপনার অর্ডার ডেলিভারি পেতে ৫–১৫ মিনিটের বেশি বিলম্ব হলে, অবশ্যই অর্ডার নাম্বার নিয়ে আমাদের{" "}
                <Link href="/tickets">সাপোর্ট</Link> এ যোগাযোগ করতে হবে।
              </p>
            </li>
          </ul>

          <div className="order-thank-you-actions">
            <Link className="primary-btn" href="/products">
              Continue shopping
            </Link>
            <Link className="order-thank-you-secondary" href="/login">
              Sign in to track orders
            </Link>
          </div>

          <p className="order-thank-you-footer">
            Questions about your order? <Link href="/tickets">Contact support</Link>
          </p>
        </article>
      </div>
    </main>
  );
}

export default function OrderThankYouPage() {
  return (
    <Suspense fallback={<main className="order-thank-you-page">Loading…</main>}>
      <ThankYouContent />
    </Suspense>
  );
}
