import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DEFAULT_PUBLIC_CONTACT } from "@amarpin/types";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import { fetchSiteContent } from "@/lib/catalog/api";
import { metadataForCms } from "@/lib/catalog/seo";
import { fetchSitePage } from "@/lib/content/api";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await fetchSiteContent();
  try {
    return metadataForCms(site, await fetchSitePage("ABOUT"), "/about", `About — ${site.siteName}`);
  } catch {
    return metadataForCms(site, null, "/about", `About — ${site.siteName}`);
  }
}

const HIGHLIGHTS = [
  {
    title: "Instant delivery",
    body: "Most digital products are fulfilled automatically after payment — codes and top-ups reach you in minutes, not days.",
    icon: <BoltMark />,
  },
  {
    title: "Secure payments",
    body: "Pay with wallet balance, bKash, Nagad, or other trusted gateways. Every transaction is verified before your order is processed.",
    icon: <ShieldMark />,
  },
  {
    title: "Wide catalog",
    body: "From gaming top-ups and gift cards to subscriptions and digital goods — browse categories curated for gamers and everyday shoppers.",
    icon: <CatalogMark />,
  },
  {
    title: "Real support",
    body: "Questions before or after purchase? Reach our team through live chat, tickets, and email — we are here when you need us.",
    icon: <ChatMark />,
  },
];

const OFFERINGS = [
  {
    title: "Gaming top-ups",
    body: "Recharge your favourite games quickly with region-aware products and transparent pricing in BDT.",
    icon: <GameMark />,
  },
  {
    title: "Gift cards & vouchers",
    body: "Digital gift cards for streaming, apps, and entertainment — ready to redeem after checkout.",
    icon: <GiftMark />,
  },
  {
    title: "Customer wallet",
    body: "Add balance once and pay faster on repeat orders. Track spending from your personal dashboard.",
    icon: <WalletMark />,
  },
  {
    title: "Order tracking",
    body: "View order history, download delivered codes, and manage your account from one secure place.",
    icon: <TrackMark />,
  },
];

const STEPS = [
  {
    step: "01",
    title: "Browse & choose",
    body: "Explore products by category, compare options, and add items to your cart in a few clicks.",
    icon: <SearchMark />,
  },
  {
    step: "02",
    title: "Pay securely",
    body: "Complete checkout with wallet, mobile banking, or other supported payment methods.",
    icon: <CardMark />,
  },
  {
    step: "03",
    title: "Receive instantly",
    body: "Get your digital goods delivered to your account and email as soon as payment is confirmed.",
    icon: <ReceiveMark />,
  },
];

const BELIEFS = [
  "Transparency in pricing — what you see is what you pay.",
  "Security first — verified payments and protected accounts.",
  "Speed matters — digital products should arrive without delay.",
  "Support with care — real people when automation is not enough.",
];

export default async function AboutPage() {
  const site = await fetchSiteContent();
  const whatsappUrl = site.contact?.whatsappUrl || DEFAULT_PUBLIC_CONTACT.whatsappUrl;

  return (
    <StorefrontShell site={site}>
      <div className="about-page">
        <section className="about-hero" aria-label="About AuGetway">
          <div className="touch-bubbles" aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="about-hero-copy">
            <h1>About AuGetway</h1>
            <p>
              <strong>AuGetway</strong> বাংলাদেশের অন্যতম বিশ্বস্ত ডিজিটাল গিফট কার্ড, গেম ক্রেডিট এবং সফটওয়্যার লাইসেন্স বিক্রয়কারী অনলাইন প্ল্যাটফর্ম। ২০২০ সালে যাত্রা শুরুর পর থেকে আমরা বাংলাদেশের গ্রাহকদের জন্য নিরাপদ, দ্রুত এবং নির্ভরযোগ্য ডিজিটাল সেবা প্রদানে প্রতিশ্রুতিবদ্ধ।
            </p>
            <p>
              গ্রাহকদের চাহিদা ও প্রযুক্তির পরিবর্তনের সঙ্গে তাল মিলিয়ে <strong>AuGetway</strong> নিয়মিতভাবে নতুন ডিজিটাল পণ্য ও সেবার পরিসর সম্প্রসারণ করে চলেছে, যাতে এক জায়গা থেকেই সহজে সব ধরনের ডিজিটাল পণ্য কেনা যায়।
            </p>
            <p>
              আমাদের লক্ষ্য হলো বাংলাদেশের প্রতিটি গ্রাহকের জন্য এমন একটি বিশ্বস্ত প্ল্যাটফর্ম তৈরি করা, যেখানে সপ্তাহের ৭ দিন, দিনের ২৪ ঘণ্টা নিরাপদে ও সহজে অনলাইনে কেনাকাটা করা যায়।
            </p>
            <p>
              <strong>AuGetway</strong>-এর সকল ডিজিটাল পণ্য দ্রুত ইমেইলের মাধ্যমে সরবরাহ করা হয়, যাতে গ্রাহকরা স্বল্প সময়ের মধ্যেই তাদের ক্রয়কৃত পণ্য ব্যবহার করতে পারেন। দ্রুত ডেলিভারি, নিরাপদ লেনদেন এবং ভালো গ্রাহকসেবাই আমাদের সর্বোচ্চ অগ্রাধিকার।
            </p>
          </div>
          <footer>
            <p>
              Developed by <strong>AuGetway</strong> Team @ 2020.
            </p>
            <div className="touch-social">
              <span className="touch-social-item" aria-hidden>
                <span className="touch-social-ring" />
                <FacebookMark />
              </span>
              <a className="touch-social-item" href="/contact#contact-email" aria-label="Email">
                <span className="touch-social-ring" />
                <MailMark />
              </a>
              <span className="touch-social-item" aria-hidden>
                <span className="touch-social-ring" />
                <YouTubeMark />
              </span>
              <a className="touch-social-item" href={whatsappUrl} aria-label="WhatsApp" target="_blank" rel="noreferrer">
                <span className="touch-social-ring" />
                <WhatsAppMark />
              </a>
              <span className="touch-social-item" aria-hidden>
                <span className="touch-social-ring" />
                <DiscordMark />
              </span>
              <span className="touch-social-item" aria-hidden>
                <span className="touch-social-ring" />
                <TelegramMark />
              </span>
            </div>
          </footer>
        </section>

        <section className="about-split">
          <article className="about-card">
            <Badge icon={<BookMark />}>Our story</Badge>
            <h2>Shopping digital goods should feel effortless</h2>
            <p>
              AuGetway started with a clear goal: remove the friction from buying digital products in Bangladesh. No confusing checkout, no long waits, and no uncertainty about whether your payment went through.
            </p>
            <p>
              We combine a modern storefront, automated delivery, and human support so you can focus on what you purchased — whether that is topping up a game, sending a gift card, or stocking your wallet for the next order.
            </p>
            <p>
              Every part of the experience — from browsing categories to tracking orders in your dashboard — is designed to be clear, fast, and trustworthy.
            </p>
          </article>
          <article className="about-card">
            <Badge icon={<HeartMark />}>What we believe</Badge>
            <h2>Built on trust</h2>
            <ul className="about-beliefs">
              {BELIEFS.map((item) => (
                <li key={item}>
                  <span aria-hidden>
                    <CheckMark />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="about-card about-block">
          <div className="about-heading">
            <Badge icon={<StarMark />}>Why customers choose us</Badge>
            <h2>Built for speed, security, and scale</h2>
          </div>
          <div className="about-highlights">
            {HIGHLIGHTS.map((item) => (
              <article key={item.title}>
                <span className="about-mark">{item.icon}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="about-card about-block">
          <div className="about-heading">
            <Badge icon={<GridMark />}>What we offer</Badge>
            <h2>Everything you need in one place</h2>
            <p>AuGetway is more than a shop — it is a complete platform for discovering, purchasing, and managing digital products.</p>
          </div>
          <div className="about-offers">
            {OFFERINGS.map((item) => (
              <article key={item.title}>
                <span className="about-mark">{item.icon}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="about-card about-block">
          <div className="about-heading">
            <Badge icon={<RouteMark />}>How it works</Badge>
            <h2>Three simple steps</h2>
          </div>
          <div className="about-steps">
            {STEPS.map((item) => (
              <article key={item.step}>
                <span className="about-mark">{item.icon}</span>
                <small>Step {item.step}</small>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="about-card about-ready">
          <span className="about-mark about-mark--lg">
            <SparkMark />
          </span>
          <h2>Ready to shop smarter?</h2>
          <p>
            Join thousands of customers who rely on AuGetway for fast digital delivery, flexible payments, and responsive support.
          </p>
          <div className="about-actions">
            <Link href="/products">Start shopping</Link>
            <Link href="/register">Create account</Link>
          </div>
        </section>
      </div>
    </StorefrontShell>
  );
}

function Badge({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="about-badge">
      {icon}
      {children}
    </span>
  );
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

function FacebookMark() {
  return (
    <Glyph>
      <path d="M14 8h2V5h-2c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.2l.8-3H13V9c0-.6.4-1 1-1z" />
    </Glyph>
  );
}

function MailMark() {
  return (
    <Glyph>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </Glyph>
  );
}

function YouTubeMark() {
  return (
    <Glyph>
      <rect x="3" y="7" width="18" height="10" rx="3" />
      <path d="M11 10.2v3.6l3.2-1.8L11 10.2z" />
    </Glyph>
  );
}

function WhatsAppMark() {
  return (
    <Glyph>
      <path d="M12 4.5a7.2 7.2 0 0 0-6.2 10.8L5 19.2l4.1-1.1A7.2 7.2 0 1 0 12 4.5z" />
      <path d="M9.2 10.2c.2 1.6 1.5 3 3.1 3.6.4.1.8 0 1-.3l.4-.7" />
    </Glyph>
  );
}

function DiscordMark() {
  return (
    <Glyph>
      <path d="M8 16s-.4-1.3-.7-2.4C6.4 13.2 6.2 12.5 6.2 11.8 6.2 9 8.2 7.7 8.2 7.7l.6.7c.7-.3 1.7-.6 2.9-.6s2.2.3 2.9.6l.6-.7s2 1.3 2 4.1c0 .7-.2 1.4-.3 1.8-.3 1.1-.6 2.4-.6 2.4-1.1.4-2.1.6-3.1.6h-2.1c-1 0-2-.2-3.1-.6z" />
      <circle cx="10" cy="12" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="14" cy="12" r="0.7" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

function TelegramMark() {
  return (
    <Glyph>
      <path d="M20 5.5L4.2 11.4c-.7.3-.7 1.3.1 1.5l3.8 1.2 1.5 4.5c.2.6 1 .8 1.4.3l2.1-2.1 4 2.9c.5.4 1.2.1 1.4-.5l2.2-12.2c.2-.8-.6-1.4-1.3-1.1z" />
    </Glyph>
  );
}

function BookMark() {
  return (
    <Glyph>
      <path d="M7 5.5h8.5A2.5 2.5 0 0 1 18 8v10.5H9.2A2.2 2.2 0 0 0 7 20.7V5.5z" />
      <path d="M7 5.5A2.2 2.2 0 0 0 4.8 7.7V17" />
    </Glyph>
  );
}

function HeartMark() {
  return (
    <Glyph>
      <path d="M12 18.5s-6-3.7-6-8A3.4 3.4 0 0 1 12 8a3.4 3.4 0 0 1 6 2.5c0 4.3-6 8-6 8z" />
    </Glyph>
  );
}

function StarMark() {
  return (
    <Glyph>
      <path d="M12 4.8l1.7 3.6 4 .5-2.9 2.7.7 3.9L12 13.7 8.5 15.5l.7-3.9L6.3 8.9l4-.5L12 4.8z" />
    </Glyph>
  );
}

function GridMark() {
  return (
    <Glyph>
      <rect x="4.5" y="4.5" width="6" height="6" rx="1.2" />
      <rect x="13.5" y="4.5" width="6" height="6" rx="1.2" />
      <rect x="4.5" y="13.5" width="6" height="6" rx="1.2" />
      <rect x="13.5" y="13.5" width="6" height="6" rx="1.2" />
    </Glyph>
  );
}

function RouteMark() {
  return (
    <Glyph>
      <circle cx="7" cy="7" r="2" />
      <circle cx="17" cy="17" r="2" />
      <path d="M9 8.2c2.2 0 3.2 1.4 4 3.2S15 14.5 17 14.5" />
    </Glyph>
  );
}

function BoltMark() {
  return (
    <Glyph>
      <path d="M13 3.5L6.5 13h5l-1 7.5 7-10h-5l.5-7z" />
    </Glyph>
  );
}

function ShieldMark() {
  return (
    <Glyph>
      <path d="M12 3.8l6.2 2.2v5.4c0 3.6-2.5 6.2-6.2 7.8-3.7-1.6-6.2-4.2-6.2-7.8V6L12 3.8z" />
      <path d="M9.2 12.1l1.8 1.8 3.8-4" />
    </Glyph>
  );
}

function CatalogMark() {
  return (
    <Glyph>
      <path d="M8 6h11M8 12h11M8 18h11" />
      <circle cx="5" cy="6" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="5" cy="18" r="0.8" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

function ChatMark() {
  return (
    <Glyph>
      <path d="M6 16.5l-1.5 3.2 3.4-1.6A8 8 0 1 0 6 16.5z" />
    </Glyph>
  );
}

function GameMark() {
  return (
    <Glyph>
      <rect x="3.5" y="8" width="17" height="8.5" rx="3" />
      <path d="M8 12.2h3M9.5 10.7v3" />
      <circle cx="15.2" cy="11.4" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="17" cy="13.2" r="0.7" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

function GiftMark() {
  return (
    <Glyph>
      <rect x="4" y="10" width="16" height="9" rx="1.4" />
      <path d="M4 13.5h16M12 10v9" />
      <path d="M12 10c-1.2-2.4-4.2-2.2-4.2-.4S12 10 12 10s2.6-1.4 4.2-.4S13.2 7.6 12 10z" />
    </Glyph>
  );
}

function WalletMark() {
  return (
    <Glyph>
      <rect x="3.5" y="6.5" width="17" height="12" rx="2" />
      <path d="M3.5 10h17" />
      <circle cx="16.5" cy="14.2" r="0.8" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

function TrackMark() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="7.2" />
      <path d="M12 8.2V12l2.6 1.6" />
    </Glyph>
  );
}

function SearchMark() {
  return (
    <Glyph>
      <circle cx="11" cy="11" r="5.2" />
      <path d="M15.2 15.2L19 19" />
    </Glyph>
  );
}

function CardMark() {
  return (
    <Glyph>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="M3.5 10h17M7 14.5h4" />
    </Glyph>
  );
}

function ReceiveMark() {
  return (
    <Glyph>
      <path d="M12 4.5v9" />
      <path d="M8.5 10.5L12 14l3.5-3.5" />
      <path d="M5 17.5h14" />
    </Glyph>
  );
}

function SparkMark() {
  return (
    <Glyph>
      <path d="M12 4.2v3.2M12 16.6v3.2M4.2 12h3.2M16.6 12h3.2" />
      <circle cx="12" cy="12" r="2.2" />
    </Glyph>
  );
}

function CheckMark() {
  return (
    <Glyph>
      <path d="M8 12.2l2.4 2.4L16.2 9" />
    </Glyph>
  );
}
