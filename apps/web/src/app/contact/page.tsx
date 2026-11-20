import type { Metadata } from "next";
import { ContactLive } from "@/components/content/ContactLive";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import { DEFAULT_PUBLIC_CONTACT } from "@amarpin/types";
import { fetchSiteContent } from "@/lib/catalog/api";
import { metadataForCms } from "@/lib/catalog/seo";
import { fetchSitePage } from "@/lib/content/api";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await fetchSiteContent();
  try {
    return metadataForCms(site, await fetchSitePage("CONTACT"), "/contact", `Contact — ${site.siteName}`);
  } catch {
    return metadataForCms(site, null, "/contact", `Contact — ${site.siteName}`);
  }
}

export default async function ContactPage() {
  const site = await fetchSiteContent();
  const contact = site.contact ?? DEFAULT_PUBLIC_CONTACT;
  const phoneHref = `tel:${contact.phone.replace(/[^\d+]/g, "")}`;

  return (
    <StorefrontShell site={site}>
      <div className="touch-page">
        <section className="touch-hero" aria-label="Support center">
          <div className="touch-bubbles" aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="touch-hero-copy">
            <p className="touch-kicker">
              <MailMark />
              Support Center
            </p>
            <h1>
              Keep In Touch <span>With Us.</span>
            </h1>
            <p>সরাসরি আমাদের লাইভ সাপোর্ট এ কথা বলতে ডান সাইডে নিচের কর্নারে চ্যাট আইকনে ক্লিক করুন।</p>
            <p className="touch-response">
              <ClockMark />
              Average Response Time: <strong>&lt; 15 minutes</strong>
            </p>
            <p>আমাদের কল সাপোর্ট ওপেন থাকে সকাল ১১ টা থেকে রাত একটা পর্যন্ত। অনুগ্রহ করে হোয়াটসঅ্যাপে কোন প্রকার কল করবেন না।</p>
          </div>
          <div className="touch-hero-art" aria-hidden>
            <EnvelopeArt />
          </div>
          <footer>
            <p>
              Developed by <strong>{site.siteName}</strong> Team @ {new Date().getFullYear()}.
            </p>
            <div className="touch-social">
              <span className="touch-social-item" aria-hidden><span className="touch-social-ring" /><FacebookMark /></span>
              <a className="touch-social-item" href="#contact-email" aria-label="Email"><span className="touch-social-ring" /><MailMark /></a>
              <span className="touch-social-item" aria-hidden><span className="touch-social-ring" /><YouTubeMark /></span>
              <a className="touch-social-item" href={contact.whatsappUrl} aria-label="WhatsApp" target="_blank" rel="noreferrer"><span className="touch-social-ring" /><WhatsAppMark /></a>
              <span className="touch-social-item" aria-hidden><span className="touch-social-ring" /><DiscordMark /></span>
              <span className="touch-social-item" aria-hidden><span className="touch-social-ring" /><TelegramMark /></span>
            </div>
          </footer>
        </section>

        <div className="touch-grid">
          <ContactLive />
          <aside className="touch-side">
            <article className="touch-card touch-info">
              <span><PhoneMark /></span>
              <div>
                <small>Support</small>
                <a href={phoneHref}>{contact.phone}</a>
              </div>
            </article>
            <article className="touch-card touch-info">
              <span><PinMark /></span>
              <div>
                <small>Address</small>
                <p>{contact.address}</p>
              </div>
            </article>
            <article className="touch-card touch-direct">
              <span><WhatsAppMark /></span>
              <h2>Connect Directly</h2>
              <p>Sign in to chat with our support executives via WhatsApp. Don&apos;t Call WhatsApp.</p>
              <a href={contact.whatsappUrl} target="_blank" rel="noreferrer">
                Sign in to WhatsApp
                <ExternalMark />
              </a>
            </article>
            <article className="touch-card touch-secure">
              <span><ShieldMark /></span>
              <h2>100% Secure &amp; Reliable</h2>
              <p>Your message is processed securely. We guarantee strict confidentiality for all support conversations.</p>
            </article>
          </aside>
        </div>
      </div>
    </StorefrontShell>
  );
}

function MailMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m4.5 7.5 7.5 6 7.5-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function ClockMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 8v4.5l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function PhoneMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M8 4.5h2.2l1.2 3-1.6 1.1a12 12 0 0 0 5.6 5.6l1.1-1.6 3 1.2V16a2 2 0 0 1-2.2 2A14.5 14.5 0 0 1 6 6.7 2 2 0 0 1 8 4.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function PinMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="11" r="1.7" fill="currentColor" />
    </svg>
  );
}

function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 4.5a7.5 7.5 0 0 0-6.5 11.2L4.5 19.5l3.9-1A7.5 7.5 0 1 0 12 4.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9.2 9.6c.2 1.4 1.6 3 3.2 3.7.4.2.8 0 .9-.3l.4-.8c.1-.2.3-.2.5-.1l1.2.5c.2.1.3.4.2.6-.3.8-1.1 1.2-1.9 1.1-2.2-.3-4.4-2.4-4.8-4.6-.1-.7.3-1.4 1-1.6.2-.1.4 0 .5.2l.8 1.3Z" fill="currentColor" />
    </svg>
  );
}

function ShieldMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3.5 19 6.2v5.6c0 4.2-2.8 7-7 8.7-4.2-1.7-7-4.5-7-8.7V6.2L12 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m8.8 12 2.1 2.1 4.3-4.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ExternalMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M8 8h8v8M16 8 7 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M14 9h2V6h-2c-1.7 0-3 1.3-3 3v2H9v3h2v6h3v-6h2l.5-3H14v-1c0-.6.4-1 1-1Z" fill="currentColor" />
    </svg>
  );
}

function YouTubeMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="7" width="18" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m11 10 4 2-4 2v-4Z" fill="currentColor" />
    </svg>
  );
}

function DiscordMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M8 16.5s-.4-1.3-.7-2.4C6.4 13.6 6.2 12.8 6.2 12c0-2.6 1.8-3.8 1.8-3.8l.5.7c.7-.3 1.6-.5 2.5-.5s1.8.2 2.5.5l.5-.7s1.8 1.2 1.8 3.8c0 .8-.2 1.6-.3 2.1-.3 1.1-.6 2.4-.6 2.4-1 .3-2 .5-3 .5h-1.8c-1 0-2-.2-3-.5Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="12" r="0.8" fill="currentColor" />
      <circle cx="14" cy="12" r="0.8" fill="currentColor" />
    </svg>
  );
}

function TelegramMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M19.5 5.5 4.8 11l4.2 1.3 1.5 4.6 2.2-2.2 4.2 3.1 2.6-12.3Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function EnvelopeArt() {
  return (
    <svg viewBox="0 0 160 120" aria-hidden>
      <rect x="18" y="28" width="124" height="78" rx="16" fill="rgb(var(--brand) / 0.16)" />
      <path d="M28 40h104l-52 36L28 40Z" fill="rgb(var(--brand))" />
      <path d="M28 40v54c0 6 5 12 12 12h80c7 0 12-6 12-12V40" fill="none" stroke="rgb(var(--brand))" strokeWidth="6" />
      <path d="M122 22l8 8M126 16v10M120 22h12" fill="none" stroke="rgb(var(--brand))" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
