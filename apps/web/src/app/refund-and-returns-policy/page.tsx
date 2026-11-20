import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import { fetchSiteContent } from "@/lib/catalog/api";
import { metadataForCms } from "@/lib/catalog/seo";
import { fetchSitePage } from "@/lib/content/api";

export const dynamic = "force-dynamic";

const SUPPORT_EMAIL = "support@amarpin.com";
const RETURN_ADDRESS =
  "Rajabari, Turag, Dhaka — House 13, Road 01, Block B, Ward 54, Dhaka 1711";

export async function generateMetadata(): Promise<Metadata> {
  const site = await fetchSiteContent();
  try {
    return metadataForCms(
      site,
      await fetchSitePage("REFUND_POLICY"),
      "/refund-and-returns-policy",
      `Refund And Returns Policy — ${site.siteName}`,
    );
  } catch {
    return metadataForCms(site, null, "/refund-and-returns-policy", `Refund And Returns Policy — ${site.siteName}`);
  }
}

type PolicySection = {
  id: string;
  title: string;
  icon: ReactNode;
  paragraphs: string[];
  steps?: string[];
  highlight?: boolean;
};

const SECTIONS: PolicySection[] = [
  {
    id: "overview",
    title: "Overview",
    icon: <ClipboardMark />,
    paragraphs: [
      "Once your return is received and audited, we will send you an email to notify you that we have received your returned item. We will also notify you of the approval or rejection of your refund.",
      "If you are approved, your refund will be issued and a credit will automatically be applied to your credit card or original method of payment.",
    ],
  },
  {
    id: "refunds",
    title: "Refunds",
    icon: <RefreshMark />,
    paragraphs: [
      "Once your return is received and audited, we will send you an email to notify you that we have received your returned item. We will also notify you of the approval or rejection of your refund.",
      "If you are approved, your refund will be issued and a credit will automatically be applied to your credit card or original method of payment.",
    ],
  },
  {
    id: "late-refunds",
    title: "Late or missing refunds",
    icon: <InfoMark />,
    paragraphs: [
      "If you have not received a refund yet, please follow the steps below before contacting us.",
    ],
    steps: [
      "First, check your bank account again.",
      "Next, contact your bank — there is often some processing time before a refund is posted.",
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
    id: "late-returns",
    title: "Late or missing returns",
    icon: <InfoMark />,
    paragraphs: [
      "If you have not received confirmation for your return yet, please follow the steps below.",
    ],
    steps: [
      "First, check your bank account or payment statement again.",
      "Next, contact your bank — processing time may apply before a refund is posted.",
      `If you still need help, please contact us at ${SUPPORT_EMAIL}.`,
    ],
  },
  {
    id: "exchanges",
    title: "Exchanges",
    icon: <ExchangeMark />,
    paragraphs: [
      "We only replace products if they are damaged or if the same product was delivered two or more times.",
      "If you want to exchange the same item, send us an email and return your item to the address below.",
    ],
    highlight: true,
  },
  {
    id: "gifts",
    title: "Gifts",
    icon: <GiftMark />,
    paragraphs: [
      "If the item was marked as a gift when purchased and shipped directly to you, you will receive a gift credit for your return amount. Upon receipt of the returned item, a gift certificate will be mailed to you.",
      "If the product was not marked as a gift at the time of purchase, or the giver later had the order shipped to you, we will return it to the giver and they will be informed about your return.",
    ],
  },
  {
    id: "shipping-returns",
    title: "Shipping returns",
    icon: <TruckMark />,
    paragraphs: [
      "For shipping-related return issues, the same refund timelines and bank processing rules apply.",
      "Only regular-priced items may be refunded. Trade or promotional sale items cannot be refunded.",
      "If the product was not marked as a gift at the time of purchase, or the giver later had the order shipped to you, we will return it to the giver and they will be informed about your return.",
    ],
    steps: [
      "First, check your bank account again if you have not received a refund yet.",
      "Next, contact your bank — there is usually processing time before a refund appears.",
      `If you have done all of this and still have not received your refund, contact us at ${SUPPORT_EMAIL}.`,
    ],
  },
];

export default async function RefundPolicyPage() {
  const site = await fetchSiteContent();

  return (
    <StorefrontShell site={site}>
      <div className="policy-page">
        <section className="policy-hero" aria-label="Refund and returns policy">
          <div className="touch-bubbles" aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="policy-hero-copy">
            <span className="about-badge">Customer policy</span>
            <h1>Refund And Returns Policy</h1>
            <p>
              Everything you need to know about refunds, returns, exchanges, gifts, and shipping — clear steps and support contacts in one place.
            </p>
          </div>
          <PolicyArt />
        </section>

        {SECTIONS.map((section) => (
          <article className="policy-card" key={section.id} id={section.id}>
            <header>
              <span className="policy-icon">{section.icon}</span>
              <h2>{section.title}</h2>
            </header>
            <div className="policy-body">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.steps ? (
                <ol className="policy-steps">
                  {section.steps.map((step, index) => (
                    <li key={step}>
                      <span>{index + 1}</span>
                      <p>{linkEmail(step)}</p>
                    </li>
                  ))}
                </ol>
              ) : null}
              {section.highlight ? (
                <div className="policy-highlight">
                  <p>
                    Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                  </p>
                  <strong>{RETURN_ADDRESS}</strong>
                </div>
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
            Contact us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> for any questions about refunds, returns, or exchanges.
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

function linkEmail(text: string) {
  const parts = text.split(SUPPORT_EMAIL);
  if (parts.length < 2) return text;
  return (
    <>
      {parts[0]}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      {parts[1]}
    </>
  );
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

function ClipboardMark() {
  return (
    <Glyph>
      <rect x="7" y="5" width="10" height="14" rx="1.6" />
      <path d="M9.2 5.2h5.6v2.2H9.2z" />
      <path d="M9.5 11.2h5M9.5 14.2h3.4" />
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

function InfoMark() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8.1" r="0.7" fill="currentColor" stroke="none" />
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

function ExchangeMark() {
  return (
    <Glyph>
      <path d="M6 8.5h10.2" />
      <path d="M13.2 5.8L16.4 8.5 13.2 11.2" />
      <path d="M18 15.5H7.8" />
      <path d="M10.8 12.8L7.6 15.5 10.8 18.2" />
    </Glyph>
  );
}

function GiftMark() {
  return (
    <Glyph>
      <rect x="4.5" y="10" width="15" height="8.5" rx="1.4" />
      <path d="M4.5 13.4h15M12 10v8.5" />
      <path d="M12 10c-1-2.2-3.8-2-3.8-.4S12 10 12 10s2.4-1.2 3.8-.4S13 7.8 12 10z" />
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

function PolicyArt() {
  return (
    <div className="policy-art" aria-hidden>
      <span />
      <span />
      <span>
        <RefreshMark />
      </span>
    </div>
  );
}
