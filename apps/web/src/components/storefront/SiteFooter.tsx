import Link from "next/link";
import { DEFAULT_PUBLIC_CONTACT, type PublicSiteContent } from "@amarpin/types";
import { fetchCategories } from "@/lib/catalog/api";

const NETWORKS = [
  { label: "Facebook", hosts: ["facebook.com", "fb.com"], path: "M14 8h2V5h-2c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.2l.8-3H13V9c0-.6.4-1 1-1z" },
  { label: "YouTube", hosts: ["youtube.com", "youtu.be"], path: "M22 12.2s0-3.2-.4-4.6c-.2-.9-.9-1.6-1.8-1.8C18.2 5.4 12 5.4 12 5.4s-6.2 0-7.8.4c-.9.2-1.6.9-1.8 1.8C2 9 2 12.2 2 12.2s0 3.2.4 4.6c.2.9.9 1.6 1.8 1.8 1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4c.9-.2 1.6-.9 1.8-1.8.4-1.4.4-4.6.4-4.6zM10 15.5v-6.5l5.2 3.3L10 15.5z" },
  { label: "WhatsApp", hosts: ["wa.me", "whatsapp.com"], path: "M12 4a8 8 0 0 0-6.9 12L4 20l4.2-1.1A8 8 0 1 0 12 4zm4.4 11.3c-.2.5-1 .9-1.4 1-.4.1-.8.1-1.3 0-.3-.1-.7-.2-1.2-.5-2.1-1.1-3.5-3.6-3.6-3.8-.1-.2-.8-1.1-.8-2.1s.5-1.5.7-1.7c.2-.2.4-.3.6-.3h.4c.1 0 .3 0 .5.4.2.5.6 1.6.7 1.7.1.1.1.3 0 .4-.1.2-.2.3-.3.5l-.2.2c-.1.1-.2.2-.1.4.1.2.6 1 1.3 1.6.9.8 1.6 1 1.8 1.1.2.1.3.1.4-.1.1-.1.5-.6.6-.8.1-.2.3-.2.5-.1.2.1 1.3.6 1.5.7.2.1.3.2.4.3.1.2 0 .5-.2 1z" },
  { label: "Discord", hosts: ["discord.com", "discord.gg"], path: "M8 15s-.4-1.4-.7-2.6C6.2 12 6 11.2 6 10.4 6 7.4 8.2 6 8.2 6l.6.8C9.6 6.5 10.7 6.2 12 6.2s2.4.3 3.2.6l.6-.8S18 7.4 18 10.4c0 .8-.2 1.6-.3 2-.3 1.2-.7 2.6-.7 2.6-1.2.4-2.3.6-3.4.6h-2.2c-1.1 0-2.2-.2-3.4-.6zM10 12.2a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8zm4 0a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8z" },
  { label: "Telegram", hosts: ["t.me", "telegram.me", "telegram.org"], path: "M21 5L3.5 11.7c-.8.3-.8 1.4.1 1.6l4.4 1.4 1.7 5.2c.2.7 1.1.9 1.6.4l2.4-2.4 4.6 3.4c.6.4 1.4.1 1.6-.6L21.8 6.2c.2-.9-.7-1.6-1.5-1.2z" },
] as const;

const EMAIL_PATH = "M4 7h16v10H4zM4 7l8 6 8-6";

const USEFUL = [
  { href: "/about", label: "About" },
  { href: "/refund-and-returns-policy", label: "Refund And Returns Policy" },
  { href: "/terms-conditions", label: "Terms & Conditions" },
  { href: "/disclaimers", label: "Disclaimers" },
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/contact", label: "Contact us" },
];

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function profileLinks(sameAs: string[], whatsappUrl: string) {
  const links: Array<{ label: string; href: string; path: string }> = [
    { label: "Email", href: "/contact", path: EMAIL_PATH },
  ];
  const used = new Set<string>();
  for (const url of sameAs) {
    const host = hostOf(url);
    const network = NETWORKS.find((item) =>
      item.hosts.some((name) => host === name || host.endsWith(`.${name}`)),
    );
    if (!network || used.has(network.label)) continue;
    used.add(network.label);
    links.push({ label: network.label, href: url, path: network.path });
  }
  if (!used.has("WhatsApp")) {
    const whatsapp = NETWORKS.find((item) => item.label === "WhatsApp");
    if (whatsapp) links.push({ label: whatsapp.label, href: whatsappUrl, path: whatsapp.path });
  }
  return links;
}

export async function SiteFooter({ site }: { site: PublicSiteContent }) {
  const siteName = site.siteName;
  let categoryLinks: Array<{ href: string; label: string }> = [];
  try {
    const categories = await fetchCategories();
    const top = categories.filter((category) => !category.parentId);
    categoryLinks = (top.length > 0 ? top : categories).slice(0, 6).map((category) => ({
      href: `/category/${category.slug}`,
      label: category.name,
    }));
  } catch {
    categoryLinks = [];
  }
  const menu = [
    { href: "/request-product", label: "Product Requests" },
    { href: "/products", label: "All products" },
    ...categoryLinks,
    { href: "/reviews", label: "Reviews" },
    { href: "/blog", label: "Blog" },
  ];
  const account = [
    { href: "/login", label: "Sign in" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/orders", label: "My gift cards" },
  ];
  const paymentSrc =
    siteName === "UniQbd" ? "/images/uniqbd-payment-gateway.png" : "/images/amarpin-payment-gateway.png";
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-main">
          <div className="site-footer-brand">
            <Link href="/" className="site-logo" aria-label={siteName}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={site.lightLogoPath || (site.siteName === "UniQbd" ? "/logo/uniqbd-logo-light.png" : "/logo/amarpin-logo-light.png")}
                alt={site.logoAlt || ""}
                className="site-logo-img site-logo-img--light"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={site.darkLogoPath || (site.siteName === "UniQbd" ? "/logo/uniqbd-logo-dark.png" : "/logo/amarpin-logo-dark.png")}
                alt=""
                className="site-logo-img site-logo-img--dark"
              />
            </Link>
            <p>
              {siteName} offers a seamless online shopping experience with an easy,
              hassle-free checkout process. All products are delivered through
              trusted and secure payment gateways.
            </p>
            <div className="site-footer-social">
              {profileLinks(site.sameAs, site.contact?.whatsappUrl || DEFAULT_PUBLIC_CONTACT.whatsappUrl).map((item) => (
                <SocialIcon key={item.label} label={item.label} href={item.href} path={item.path} />
              ))}
            </div>
          </div>
          <nav className="site-footer-nav" aria-label="Footer">
            <FooterColumn title="Footer menu" links={menu} />
            <FooterColumn title="Account" links={account} />
            <FooterColumn title="Useful links" links={USEFUL} />
          </nav>
        </div>
        <div className="site-footer-bottom">
          <p>© {new Date().getFullYear()} {siteName}. All Rights Reserved.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={paymentSrc}
            alt="bKash, Nagad, Rocket, Upay, and bank transfer"
          />
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <p>{title}</p>
      <ul>
        {links.map((link) => (
          <li key={link.label}>
            <Link href={link.href}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SocialIcon({ label, href, path }: { label: string; href: string; path: string }) {
  const external = href.startsWith("http");
  return (
    <Link
      href={href}
      className="touch-social-item"
      aria-label={label}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      <span className="touch-social-ring" />
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
