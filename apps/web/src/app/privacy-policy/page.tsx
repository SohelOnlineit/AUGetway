import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import { fetchSiteContent } from "@/lib/catalog/api";
import { metadataForCms } from "@/lib/catalog/seo";
import { fetchSitePage } from "@/lib/content/api";

export const dynamic = "force-dynamic";

const SUPPORT_EMAIL = "support@amarpin.com";
const SITE_URL = "https://amarpin.com";

export async function generateMetadata(): Promise<Metadata> {
  const site = await fetchSiteContent();
  try {
    return metadataForCms(site, await fetchSitePage("PRIVACY"), "/privacy-policy", `Privacy Policy — ${site.siteName}`);
  } catch {
    return metadataForCms(site, null, "/privacy-policy", `Privacy Policy — ${site.siteName}`);
  }
}

type Section = {
  id: string;
  title: string;
  icon: ReactNode;
  paragraphs: string[];
  bullets?: string[];
  steps?: string[];
};

const SECTIONS: Section[] = [
  {
    id: "introduction",
    title: "Privacy Policy for AuGetway",
    icon: <InfoMark />,
    paragraphs: [
      `At AuGetway, accessible from ${SITE_URL}, one of our main priorities is the privacy of our visitors. This Privacy Policy describes the types of data that is collected and recorded by AuGetway and how we use it.`,
      `If you have additional questions or need more information about our Privacy Policy, feel free to contact us at ${SUPPORT_EMAIL}.`,
      "This Policy applies only to our online activities and is valid for visitors to our website with respect to the information that they share and/or collect in AuGetway.",
    ],
  },
  {
    id: "consent",
    title: "Consent",
    icon: <CheckMark />,
    paragraphs: ["By using our website, you agree to our AuGetway Privacy Policy."],
  },
  {
    id: "information",
    title: "Information we collect",
    icon: <FolderMark />,
    paragraphs: [
      "The personal information that you are asked to provide, and the reasons why you are asked to provide it, will be made clear to you at the point we ask you to provide your personal data.",
      "If you contact us directly, we may receive additional information about you such as your name and email address.",
      "When you register for an Account, we may ask for your contact information, including items such as name, company name, address, email address, and telephone number.",
    ],
  },
  {
    id: "overview",
    title: "Overview",
    icon: <InfoMark />,
    paragraphs: [
      "Our refund and returns policy lasts 30 days. If 30 days have passed since your purchase, we can't offer you a full refund or exchange.",
      "To be eligible for a return or refund, your item must be unopened and unused and in the same condition that you received from us. It must also be in the original and unopened packaging.",
      "Several types of goods are exempt from being returned. Perishable goods such as food, flowers, newspapers, or magazines cannot be returned. We also do not accept products that are intimate or sanitary goods, hazardous materials, or flammable liquids or gases.",
      "To complete your return, we require a receipt or proof of purchase.",
      "There are situations where only partial returns are accepted.",
      "Any item that is returned more than 30 days after delivery.",
    ],
  },
  {
    id: "non-returnable",
    title: "Additional non-returnable items",
    icon: <BanMark />,
    paragraphs: ["The following items cannot be returned:"],
    bullets: ["Gift cards.", "Downloadable software products."],
  },
  {
    id: "refunds",
    title: "Refunds",
    icon: <RefreshMark />,
    paragraphs: [
      "Once your return is received and inspected, we will send you an email to notify you that we have received your returned item. We will also notify you of the approval or rejection of your refund.",
      "If you are approved, then your refund will be processed, and a credit will automatically be applied to your credit card or original method of payment.",
    ],
  },
  {
    id: "late-refunds",
    title: "Late or missing refunds",
    icon: <InfoMark />,
    paragraphs: ["If you haven't received a refund yet, please follow the steps below."],
    steps: [
      "First, check your bank account again.",
      "Next, contact your bank. There is often some processing time before a refund is posted.",
      `If you have done all of this and still have not received your refund, please contact us at ${SUPPORT_EMAIL}.`,
    ],
  },
  {
    id: "sale-items",
    title: "Sale items",
    icon: <TagMark />,
    paragraphs: ["Only regular-priced items may be refunded. Sale items cannot be refunded."],
  },
  {
    id: "shipping-returns",
    title: "Shipping returns",
    icon: <TruckMark />,
    paragraphs: ["For shipping-related return issues, the same refund timelines and bank processing rules apply."],
    steps: [
      "If you haven't received a refund yet, first check your bank account again.",
      "Next, contact your bank. There is often some processing time before a refund is posted.",
      `If you've done all of this and you still have not received your refund yet, please contact us at ${SUPPORT_EMAIL}.`,
    ],
  },
];

export default async function PrivacyPage() {
  const site = await fetchSiteContent();

  return (
    <StorefrontShell site={site}>
      <div className="policy-page">
        <section className="policy-hero" aria-label="Privacy policy">
          <div className="touch-bubbles" aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="policy-hero-copy">
            <span className="about-badge">Legal</span>
            <h1>Privacy Policy</h1>
            <p>
              How AuGetway collects, uses, and protects your information — plus related refund and returns guidance in one place.
            </p>
          </div>
          <div className="policy-art" aria-hidden>
            <span />
            <span />
            <span>
              <InfoMark />
            </span>
          </div>
        </section>

        {SECTIONS.map((section) => (
          <article className="policy-card" key={section.id} id={section.id}>
            <header>
              <span className="policy-icon">{section.icon}</span>
              <h2>{section.title}</h2>
            </header>
            <div className="policy-body">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{richText(paragraph)}</p>
              ))}
              {section.bullets ? (
                <ul className="policy-steps policy-dots">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>
                      <span aria-hidden />
                      <p>{bullet}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
              {section.steps ? (
                <ol className="policy-steps">
                  {section.steps.map((step, index) => (
                    <li key={step}>
                      <span>{index + 1}</span>
                      <p>{richText(step)}</p>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          </article>
        ))}

        <section className="policy-card policy-help">
          <span className="policy-icon policy-icon--lg">
            <MailMark />
          </span>
          <h2>Need help?</h2>
          <p>
            Contact us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> for any questions about our Privacy Policy or your data.
          </p>
          <div className="policy-actions">
            <Link href="/chat">Live chat</Link>
            <Link href="/contact">Open support page</Link>
          </div>
        </section>
      </div>
    </StorefrontShell>
  );
}

function richText(text: string) {
  const parts = text.split(/(support@amarpin\.com|https:\/\/amarpin\.com)/g);
  return parts.map((part, index) => {
    if (part === SUPPORT_EMAIL) {
      return (
        <a key={index} href={`mailto:${SUPPORT_EMAIL}`}>
          {part}
        </a>
      );
    }
    return part;
  });
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

function InfoMark() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8.1" r="0.7" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

function CheckMark() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="7" />
      <path d="M8.6 12.2l2.2 2.2 4.6-4.8" />
    </Glyph>
  );
}

function FolderMark() {
  return (
    <Glyph>
      <path d="M4.5 8.2h6l1.6 1.8H19.5v8.2a1.4 1.4 0 0 1-1.4 1.4H5.9a1.4 1.4 0 0 1-1.4-1.4V8.2z" />
      <path d="M4.5 8.2V7a1.4 1.4 0 0 1 1.4-1.4h4.2L11.6 7" />
    </Glyph>
  );
}

function BanMark() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="7" />
      <path d="M7.4 16.6l9.2-9.2" />
    </Glyph>
  );
}

function RefreshMark() {
  return (
    <Glyph>
      <path d="M7.2 9.2A5 5 0 0 1 15 7.2L16.4 6" />
      <path d="M16.6 5.2v3.2h-3.2" />
      <path d="M16.8 14.8A5 5 0 0 1 9 16.8L7.6 18" />
      <path d="M7.4 18.8v-3.2h3.2" />
    </Glyph>
  );
}

function TagMark() {
  return (
    <Glyph>
      <path d="M4.5 12.2L12 4.8h6.2v6.2l-7.6 7.6z" />
      <circle cx="15.4" cy="8.4" r="0.9" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

function TruckMark() {
  return (
    <Glyph>
      <path d="M3.5 8.5h10v7h-10z" />
      <path d="M13.5 11.2h3.4l2.6 2.8v1.5h-6" />
      <circle cx="7.2" cy="17.4" r="1.2" />
      <circle cx="16.6" cy="17.4" r="1.2" />
    </Glyph>
  );
}

function MailMark() {
  return (
    <Glyph>
      <rect x="3.8" y="6" width="16.4" height="12" rx="1.8" />
      <path d="M4.4 7.4L12 12.4l7.6-5" />
    </Glyph>
  );
}
