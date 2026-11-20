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
    return metadataForCms(site, await fetchSitePage("TERMS"), "/terms-conditions", `Terms & Conditions — ${site.siteName}`);
  } catch {
    return metadataForCms(site, null, "/terms-conditions", `Terms & Conditions — ${site.siteName}`);
  }
}

type TermsSection = {
  id: string;
  title: string;
  icon: ReactNode;
  paragraphs: string[];
  bullets?: string[];
  highlight?: string;
};

const SECTIONS: TermsSection[] = [
  {
    id: "introduction",
    title: "Introduction",
    icon: <DocMark />,
    paragraphs: [
      "Welcome to AuGetway!",
      `These Terms of Service govern your use of our website at ${SITE_URL} operated by AuGetway.`,
      "Our Privacy Policy also regulates your use of our Services and explains how we collect, protect and disclose information as a result of your use of our web pages.",
      "Your agreement with us includes these terms and our Privacy Policy. You acknowledge that you have read and understood the agreements and agree to abide by them.",
      `If you do not agree with the Agreement, you may not use the Service, but please email us at ${SUPPORT_EMAIL} so that we can try to find a solution. These Terms apply to all visitors, users, and others who wish to access or use the Services.`,
    ],
  },
  {
    id: "communications",
    title: "Communications",
    icon: <MailMark />,
    paragraphs: [
      "By using our website, you agree to subscribe to newsletters, marketing or promotional materials, and other data we may send.",
      `However, you can opt out of receiving all these contacts from us by following the unsubscribe link or by emailing ${SUPPORT_EMAIL}.`,
    ],
  },
  {
    id: "purchases",
    title: "Purchases",
    icon: <CartMark />,
    paragraphs: [
      "However, you may be asked to give some data applicable to your purchase, including your credit or debit card number, if you wish to buy any product or service available through the Service.",
      "You represent and warrant that:",
    ],
    bullets: [
      "You have the legal right to use any card(s) or other forms of payment for any purchase; and",
      "The data you give to us is correct, accurate, and complete.",
    ],
    highlight:
      "We may use third-party services to process payment and completion of purchases. By submitting your data, you grant this third party the right to disclose data subject to our privacy policy. We reserve the right to reject or cancel your order at any time for reasons including but not limited to product availability, description or price errors, order errors, or other reasons. We have the right to decline or cancel your order if we suspect fraud or unauthorized or illegal transactions.",
  },
  {
    id: "contests",
    title: "Contests, Sweepstakes, and Promotions",
    icon: <TrophyMark />,
    paragraphs: [
      "Any contests, sweepstakes, or other promotions provided by the Services may be governed by separate terms from these Terms of Service.",
      "If you participate in any campaigns, please review our Privacy Policy as well as the applicable rules. If the Terms of Service conflict with promotion-specific terms, the Terms of Promotion will apply.",
    ],
  },
  {
    id: "subscriptions",
    title: "Subscriptions",
    icon: <CardMark />,
    paragraphs: [
      'Some parts of the Service are billed on a subscription basis ("Subscription(s)"). You\'ll be billed in advance on a recurring and periodic basis ("Billing Cycle"). Billing cycles will be set depending on the type of subscription plan you select when purchasing a Subscription.',
      "At the end of each Billing Cycle, your Subscription will automatically renew under the same conditions unless you cancel it or AuGetway cancels it. You may cancel your Subscription renewal either through your online account management portal or by contacting our client support team.",
      "A valid payment method is needed to process the payment for your subscription. You shall provide AuGetway with accurate and complete billing information that may include but isn't limited to full name, address, state, postal or zip code, telephone number, and valid payment method information. By submitting such payment data, you automatically authorize AuGetway to charge all Subscription charges incurred through your account to any such payment methods.",
      "Should automatic billing fail for any reason, AuGetway reserves the right to terminate your access to the Service with immediate effect.",
    ],
    highlight: `Cancel subscriptions: ${SUPPORT_EMAIL}`,
  },
  {
    id: "free-trial",
    title: "Free Trial",
    icon: <TrialMark />,
    paragraphs: [
      'AuGetway may, at its sole discretion, offer a Subscription with a free trial for a limited period of time ("Free Trial"). You may be required to provide your correct billing data in order to sign up for a Free Trial.',
      "If you do enter your billing information when signing up for a Free Trial, you will not be charged by AuGetway until the Free Trial has expired.",
      "On the final day of the Free Trial period, unless you canceled your Subscription, you will be automatically charged the applicable Subscription fees for the type of Subscription you have selected. We provide a free trial for real buyers only.",
      "At any time and without notice, AuGetway reserves the right to (i) modify Terms of Service of the Free Trial offer, or (ii) cancel such Free Trial offer.",
    ],
  },
  {
    id: "fee-changes",
    title: "Fee Changes",
    icon: <FeeMark />,
    paragraphs: [
      "Any Subscription charge change will be effective at the end of the then-current Billing Cycle.",
      "AuGetway will provide you with reasonable prior notice of any change in Subscription fees to give you an opportunity to terminate your Subscription before such change becomes effective.",
      "Your continued use of the Service after the Subscription charge change comes into effect constitutes your agreement to pay the modified Subscription charge amount.",
    ],
  },
  {
    id: "refunds",
    title: "Refunds",
    icon: <RefreshMark />,
    paragraphs: ["We issue refunds for Contracts within 30 days of the original purchase of the Contract."],
  },
  {
    id: "content",
    title: "Content",
    icon: <FileMark />,
    paragraphs: [
      "The content found on or through this Service is the property of AuGetway or used with authorization. You may not distribute, modify, transmit, exercise, download, repost, copy, or use said Content, whether in whole or in part, for commercial purposes or for personal gain, without express advance written authorization from us.",
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    icon: <ChartMark />,
    paragraphs: ["We may use third-party Service Providers to monitor and analyze the use of our Service."],
  },
  {
    id: "minors",
    title: "No Use By Minors",
    icon: <ShieldMark />,
    paragraphs: [
      "The Service is intended for access and use only by persons aged at least eighteen (18) years. By accessing or using the Services, you warrant and represent that you're at least eighteen (18) years of age and with full authority, rights and powers to enter into this Agreement and to comply with all terms and conditions.",
      "Unless you're at least 18 years old, you're prohibited from accessing and using the Services.",
    ],
  },
  {
    id: "accounts",
    title: "Accounts",
    icon: <UserMark />,
    paragraphs: [
      "When you create an account with us, you guarantee that you are over 18 years of age and that the information you provide us is always accurate, complete and current. Incorrect, deficient or obsolete information may result in immediate termination of your account with the Service.",
      "You are responsible for maintaining the confidentiality of your account and password, including but not limited to access to your computer and/or account. You agree to accept responsibility for any and all actions that take place under your account and/or password, whether your password is with our Services or third-party services. You must notify us as soon as you become aware of security breaches or unauthorized use of your account.",
      "You may not use the name of another person or entity as a username or which is not legally available for use, a name or trademark which is subject to the rights of any person or entity other than you, without proper authorization. You may not use an offensive, obscene, or inappropriate name as a username.",
      "We reserve the right to refuse services, close accounts, remove or edit content or cancel orders at our own discretion.",
    ],
  },
  {
    id: "feedback",
    title: "Error Reporting and Feedback",
    icon: <ChatMark />,
    paragraphs: [
      `You can provide us with information and feedback ("Feedback") directly at ${SUPPORT_EMAIL} or through third-party sites and tools, with suggestions for improvements, ideas, problems, complaints and other issues related to our Services. You acknowledge and agree that:`,
    ],
    bullets: [
      "You will not retain, acquire or claim any intellectual property rights or other rights, title or interest in response or support;",
      "The company may create similar concepts of feedback;",
      "The response does not contain confidential information or proprietary information from you or any third party; and",
      "The company is not subject to any confidentiality obligation in the response.",
    ],
    highlight:
      "If you are unable to transfer ownership of Feedback due to applicable binding law, you grant the Company and its affiliates an exclusive, transferable, irrevocable, free, sub-licensed, unlimited and permanent use right to Feedback in any way and for any purpose (including copying, modifying, creating, publishing, distributing and commercializing derivative works).",
  },
  {
    id: "warranty",
    title: "Disclaimer Of Warranty",
    icon: <InfoMark />,
    paragraphs: [
      'These services are provided by the company on an "as is" and "as available" basis. The Company does not provide any representations or warranties of any kind, express or implied, for the conduct of their services, or the information, content, or materials contained therein. You expressly agree that your use of these Services, their Content and any Services or items obtained from us is at your sole risk.',
      "The Company or any person affiliated with the Company makes no warranties or representations regarding integrity, security, reliability, quality, accuracy, or availability. Without limiting the aforesaid matters, the Company does not represent or warrant that errors will be corrected, that the services or servers that make them available will be free from viruses or other malicious elements, or that services will meet your requirements.",
      "The Company hereby disclaims all guarantees of any kind, whether express or implied, statutory or otherwise, including but not limited to any guarantees of merchantability.",
      "The aforesaid does not affect any warranty which may not be waived or limited under applicable law.",
    ],
  },
  {
    id: "contact",
    title: "Contact Us",
    icon: <MailMark />,
    paragraphs: [
      `Please send your feedback, comments, and requests for technical support by email: ${SUPPORT_EMAIL}.`,
    ],
    highlight: `Email: ${SUPPORT_EMAIL}`,
  },
];

export default async function TermsPage() {
  const site = await fetchSiteContent();

  return (
    <StorefrontShell site={site}>
      <div className="policy-page">
        <section className="policy-hero" aria-label="Terms and conditions">
          <div className="touch-bubbles" aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="policy-hero-copy">
            <span className="about-badge">Legal</span>
            <h1>Terms & Conditions</h1>
            <p>
              The rules and guidelines for using AuGetway — purchases, subscriptions, accounts, content, and how to reach our support team.
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
              {section.highlight ? (
                <div className="policy-highlight">
                  <p>{richText(section.highlight)}</p>
                </div>
              ) : null}
            </div>
          </article>
        ))}

        <section className="policy-card policy-help">
          <span className="policy-icon policy-icon--lg">
            <MailMark />
          </span>
          <h2>Questions about our terms?</h2>
          <p>
            Contact us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> for clarification on any section of these Terms & Conditions.
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
  const parts = text.split(/(support@amarpin\.com|https:\/\/amarpin\.com|Privacy Policy)/g);
  return parts.map((part, index) => {
    if (part === SUPPORT_EMAIL) {
      return (
        <a key={index} href={`mailto:${SUPPORT_EMAIL}`}>
          {part}
        </a>
      );
    }
    if (part === SITE_URL) return <span key={index}>{part}</span>;
    if (part === "Privacy Policy") {
      return (
        <Link key={index} href="/privacy-policy">
          {part}
        </Link>
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

function MailMark() {
  return (
    <Glyph>
      <rect x="3.8" y="6" width="16.4" height="12" rx="1.8" />
      <path d="M4.4 7.4L12 12.4l7.6-5" />
    </Glyph>
  );
}

function CartMark() {
  return (
    <Glyph>
      <path d="M6 7h14l-1.4 8.2H7.2L5.2 4.5H3" />
      <circle cx="9" cy="18.6" r="1.1" />
      <circle cx="17" cy="18.6" r="1.1" />
    </Glyph>
  );
}

function TrophyMark() {
  return (
    <Glyph>
      <path d="M8 4.5h8v5.2a4 4 0 0 1-8 0V4.5z" />
      <path d="M8 6.2H5.5v1.6A2.4 2.4 0 0 0 8 10.2M16 6.2h2.5v1.6A2.4 2.4 0 0 1 16 10.2M12 13.7V16M9.2 19.2h5.6" />
    </Glyph>
  );
}

function CardMark() {
  return (
    <Glyph>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="M3.5 10h17M7 14.4h4" />
    </Glyph>
  );
}

function TrialMark() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 8.4V12l2.4 1.6" />
    </Glyph>
  );
}

function FeeMark() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 7.6v8.8M9.6 9.4c.5-.7 1.3-1 2.4-1 1.4 0 2.3.6 2.3 1.6 0 2.2-4.7 1.2-4.7 3.4 0 1 .9 1.7 2.4 1.7 1.1 0 2-.4 2.5-1.1" />
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

function FileMark() {
  return (
    <Glyph>
      <rect x="6" y="4.5" width="12" height="15" rx="1.6" />
      <path d="M9 9h6M9 12.5h6M9 16h4" />
    </Glyph>
  );
}

function ChartMark() {
  return (
    <Glyph>
      <path d="M5 18.5h14" />
      <path d="M7.5 15.5V11M12 15.5V7.5M16.5 15.5v-3" />
    </Glyph>
  );
}

function ShieldMark() {
  return (
    <Glyph>
      <path d="M12 4.2l6 2.1v5.2c0 3.3-2.3 5.6-6 7.2-3.7-1.6-6-3.9-6-7.2V6.3l6-2.1z" />
    </Glyph>
  );
}

function UserMark() {
  return (
    <Glyph>
      <circle cx="12" cy="8.2" r="2.8" />
      <path d="M6.2 18.4c1.2-2.6 3.2-3.8 5.8-3.8s4.6 1.2 5.8 3.8" />
    </Glyph>
  );
}

function ChatMark() {
  return (
    <Glyph>
      <path d="M6.2 16.2l-1.4 3 3.2-1.4A7.2 7.2 0 1 0 6.2 16.2z" />
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
