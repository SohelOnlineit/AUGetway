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
    return metadataForCms(site, await fetchSitePage("DISCLAIMERS"), "/disclaimers", `Disclaimers — ${site.siteName}`);
  } catch {
    return metadataForCms(site, null, "/disclaimers", `Disclaimers — ${site.siteName}`);
  }
}

type Section = {
  id: string;
  title: string;
  icon: ReactNode;
  paragraphs: string[];
  links?: boolean;
};

const SECTIONS: Section[] = [
  {
    id: "introduction",
    title: "Disclaimers for AuGetway",
    icon: <DocMark />,
    paragraphs: [
      `If you need any more information about our AuGetway site disclaimer or have any questions, please feel free to contact us at ${SUPPORT_EMAIL}.`,
    ],
  },
  {
    id: "general",
    title: "General disclaimer",
    icon: <InfoMark />,
    paragraphs: [
      `All the information on this website — ${SITE_URL} — is published in good faith and for general information purposes only. AuGetway does not make any warranties about the completeness, reliability, and accuracy of this information. Any action you take upon the information you find on this website (AuGetway) is strictly at your own risk. AuGetway will not be liable for any losses and/or damages in connection with the use of our website.`,
    ],
  },
  {
    id: "external-links",
    title: "External websites",
    icon: <LinkMark />,
    paragraphs: [
      "From our website, you can visit other websites by following hyperlinks to similar external sites we provide. While we strive to provide only quality links to appropriate and ethical websites for our visitors, we have no control over the content and nature of these sites. These links to other websites do not imply a recommendation for all the content found on these sites. Site owners and content may change without notice and may occur before we have the opportunity to remove a link that may have gone bad.",
      "Please also be aware that when you leave our website, other sites may have different privacy policies and terms that are not under our control. Please be sure to check the Privacy Policies of these sites as well as their Terms of Service before engaging in any business or uploading any information on other sites.",
    ],
    links: true,
  },
  {
    id: "gift-card",
    title: "Disclaimer: AuGetway Gift Card",
    icon: <GiftMark />,
    paragraphs: [
      "Each gift card must be redeemed in a single transaction by purchasing any service.",
      "If the value of the transaction exceeds the value of the gift card, then the value of such gift card will be credited to the account as store credit.",
      "If the value of the transaction exceeds the value of the gift card, you will need to cover the deficit through such methods of payment with the store credit available in the account.",
      "Gift cards have a set dollar value that is printed on the front of the card and cannot be used to purchase other gift cards.",
      "Not every gift card is transferable. Cash cannot be paid out.",
      "AuGetway will not be liable for any gift cards stolen, misplaced, or misused without authorization. To avoid suspicion, AuGetway Gift Card will not be required to search or verify during redemption if such a gift card is properly received.",
      "AuGetway will not be liable for any loss or damage to the gift card and the holder of the gift card will not be liable for any loss or damage related to the loss or damage of the gift card.",
      "In spite of the above, if there is any doubt about the authenticity of any gift card from AuGetway, then AuGetway has no choice but to suspend or cancel such gift card without prior notice. AuGetway retains all rights in such cases.",
      "AuGetway reserves the right to disable or void the gift card if it is fraudulently obtained or used in any way to pay for unauthorized services not approved by AuGetway.",
      "Each gift card is subject to further rules, disclaimers and regulations that AuGetway may introduce at any time or from time to time.",
      "Each gift card will automatically expire, without prior notice from AuGetway, on the last day of the second (2nd) year from the day that gift card was first purchased or another period that AuGetway may set.",
    ],
  },
  {
    id: "direct-topup",
    title: "Direct Top Up",
    icon: <GridMark />,
    paragraphs: [
      "Please read the full product description and make sure the game name, server, account name, account number, and purchase amount are correct.",
      "Fill everything correctly. Note: If you make a mistake and we deliver the product to others, it may not be refundable — so type the information correctly and slowly.",
      "Pay in the correct account provided by us. If the customer makes a mistake in the payment and if any customer gives us the wrong transaction number, we will not be able to deliver the product.",
      "All important phrases are highlighted for AuGetway customers so that they can easily order.",
      "If you encounter any difficulties, please contact our 24/7 Live Support for further assistance.",
    ],
  },
  {
    id: "consent",
    title: "Consent",
    icon: <CheckMark />,
    paragraphs: ["By using our AuGetway website, you hereby agree to our disclaimer and agree to its terms."],
  },
  {
    id: "update",
    title: "Update",
    icon: <RefreshMark />,
    paragraphs: [
      "Should we update, amend or make any changes to this document, those changes will be prominently posted here.",
    ],
  },
];

export default async function DisclaimersPage() {
  const site = await fetchSiteContent();

  return (
    <StorefrontShell site={site}>
      <div className="policy-page">
        <section className="policy-hero" aria-label="Disclaimers">
          <div className="touch-bubbles" aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="policy-hero-copy">
            <span className="about-badge">Legal</span>
            <h1>Disclaimers</h1>
            <p>
              Important notices about using AuGetway — website information, gift cards, direct top-ups, and your agreement to these terms.
            </p>
          </div>
          <div className="policy-art" aria-hidden>
            <span />
            <span />
            <span>
              <DocMark />
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
              {section.links ? (
                <div className="policy-highlight">
                  <p>
                    See also: <Link href="/privacy-policy">Privacy Policy</Link>
                    {" · "}
                    <Link href="/terms-conditions">Terms & Conditions</Link>
                  </p>
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
            Contact us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> for questions related to refunds, returns, or disclaimers.
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

function DocMark() {
  return (
    <Glyph>
      <path d="M8 4.5h5.5L18 9v10.2a1.4 1.4 0 0 1-1.4 1.4H8A1.4 1.4 0 0 1 6.6 19.2V5.9A1.4 1.4 0 0 1 8 4.5z" />
      <path d="M13.2 4.8V9H17.4M9 13h6M9 16h4" />
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

function LinkMark() {
  return (
    <Glyph>
      <path d="M10 13.5l4-4" />
      <path d="M9.2 15.2l-1.4 1.4a3 3 0 0 1-4.2-4.2l2.2-2.2a3 3 0 0 1 4.2 0" />
      <path d="M14.8 8.8l1.4-1.4a3 3 0 0 1 4.2 4.2l-2.2 2.2a3 3 0 0 1-4.2 0" />
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

function CheckMark() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="7" />
      <path d="M8.6 12.2l2.2 2.2 4.6-4.8" />
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

function MailMark() {
  return (
    <Glyph>
      <rect x="3.8" y="6" width="16.4" height="12" rx="1.8" />
      <path d="M4.4 7.4L12 12.4l7.6-5" />
    </Glyph>
  );
}
