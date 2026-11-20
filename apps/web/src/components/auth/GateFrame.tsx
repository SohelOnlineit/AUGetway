import type { ReactNode } from "react";

export function GateFrame({
  title,
  lede,
  children,
  footer,
  heroSrc,
}: {
  title: string;
  lede: string;
  children: ReactNode;
  footer: ReactNode;
  heroSrc?: string;
}) {
  return (
    <main className="gate-page">
      <section className="gate-card">
        <div className="gate-side">
          <GateArt heroSrc={heroSrc} />
        </div>
        <div className="gate-copy">
          <h1>{title}</h1>
          <p className="gate-lede">{lede}</p>
          {children}
          {footer}
        </div>
      </section>
    </main>
  );
}

function GateArt({ heroSrc }: { heroSrc?: string }) {
  return (
    <div className="gate-art">
      {heroSrc ? (
        <div className="gate-hero">
          <img src={heroSrc} alt="Gift cards and game top-ups" />
        </div>
      ) : null}
      <ul className="gate-points">
        <li>
          <span className="gate-point-icon" aria-hidden>
            <BoltIcon />
          </span>
          <span>
            <strong>Fast delivery</strong>
            <small>Many products arrive in minutes</small>
          </span>
        </li>
        <li>
          <span className="gate-point-icon" aria-hidden>
            <ShieldIcon />
          </span>
          <span>
            <strong>Secure payment</strong>
            <small>Your payment is protected</small>
          </span>
        </li>
      </ul>
    </div>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M13 2.8 5.2 13.4h5.3L9.6 21.2 18.8 10h-5.4L13 2.8Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3.2 19.2 6v5.6c0 4.1-2.7 6.7-7.2 8.4-4.5-1.7-7.2-4.3-7.2-8.4V6L12 3.2Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m8.7 12.1 2.2 2.2 4.3-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m4.5 7.5 7.5 6 7.5-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="6" y="10.5" width="12" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="8" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M11 12h9l-1.6 2H16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EyeIcon({ off = false }: { off?: boolean }) {
  return off ? (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 5.5 19 19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9.2 9.4A3.2 3.2 0 0 0 14.6 15M7 7.8C5.2 9 3.8 10.8 3 12c1.6 2.6 4.8 6 9 6 1.4 0 2.7-.4 3.8-1M10.2 6.2A9 9 0 0 1 12 6c4.2 0 7.4 3.4 9 6a12 12 0 0 1-2.2 2.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M3 12c1.6-2.6 4.8-6 9-6s7.4 3.4 9 6c-1.6 2.6-4.8 6-9 6s-7.4-3.4-9-6Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M5 12h12M13 7.5 17.5 12 13 16.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UserPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.8 19c1.2-2.4 3-3.6 5.2-3.6s4 1.2 5.2 3.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M18 8.5v5M15.5 11H20.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
