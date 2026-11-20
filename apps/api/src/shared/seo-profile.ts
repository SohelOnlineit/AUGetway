import { SEO_VERIFIERS, type SeoVerificationLink, type SeoVerifierId } from "@amarpin/types";

export const SEO_LOCALES = ["en_US", "en_GB", "bn_BD"] as const;
export type SeoLocale = (typeof SEO_LOCALES)[number];

export const FIXED_ROUTE_SEO = [
  { key: "HOME", path: "/" },
  { key: "PRODUCTS", path: "/products" },
  { key: "BLOG", path: "/blog" },
  { key: "REQUEST_PRODUCT", path: "/request-product" },
] as const;

export type FixedRouteSeoKey = (typeof FIXED_ROUTE_SEO)[number]["key"];

export type SeoProfile = {
  indexing: boolean;
  twitterHandle: string | null;
  googleSiteVerification: string | null;
  bingSiteVerification: string | null;
  ogLocale: SeoLocale;
  sameAs: string[];
  titleSuffix: string | null;
  verifications: SeoVerificationLink[];
};

export type StoredRouteSeo = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  canonicalPath: string | null;
  noindex: boolean;
  nofollow: boolean;
  updatedAt: string | null;
};

export function seoProfileKey(settingsKey: string) {
  return `seo.profile.${settingsKey}`;
}

export function seoRoutesKey(settingsKey: string) {
  return `seo.routes.${settingsKey}`;
}

export function emptySeoProfile(): SeoProfile {
  return {
    indexing: true,
    twitterHandle: null,
    googleSiteVerification: null,
    bingSiteVerification: null,
    ogLocale: "en_US",
    sameAs: [],
    titleSuffix: null,
    verifications: [],
  };
}

export function parseSeoProfile(raw: string | null | undefined): SeoProfile {
  const base = emptySeoProfile();
  if (!raw) return base;
  try {
    const value = JSON.parse(raw) as Partial<SeoProfile>;
    return {
      indexing: value.indexing === false ? false : true,
      twitterHandle: cleanHandle(value.twitterHandle),
      ogLocale: isLocale(value.ogLocale) ? value.ogLocale : "en_US",
      sameAs: cleanSameAs(value.sameAs),
      titleSuffix: cleanSuffix(value.titleSuffix),
      ...withVerifierFields(value),
    };
  } catch {
    return base;
  }
}

export function parseRouteStore(raw: string | null | undefined): Partial<Record<FixedRouteSeoKey, StoredRouteSeo>> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const next: Partial<Record<FixedRouteSeoKey, StoredRouteSeo>> = {};
    for (const item of FIXED_ROUTE_SEO) {
      const row = (value as Record<string, unknown>)[item.key];
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const source = row as Partial<StoredRouteSeo>;
      next[item.key] = {
        title: text(source.title, 200),
        description: text(source.description, 500),
        imageUrl: text(source.imageUrl, 500),
        canonicalPath: text(source.canonicalPath, 240),
        noindex: source.noindex === true,
        nofollow: source.nofollow === true,
        updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
      };
    }
    return Object.keys(next).length ? next : null;
  } catch {
    return null;
  }
}

export function cleanHandle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const handle = value.trim().replace(/^@+/, "");
  if (!handle) return null;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    throw new Error("Twitter handle must be 1–15 letters, numbers, or underscores");
  }
  return handle;
}

export function cleanVerifications(value: unknown): SeoVerificationLink[] {
  if (!Array.isArray(value)) return [];
  const next: SeoVerificationLink[] = [];
  for (const row of value) {
    if (next.length >= 8) break;
    if (!row || typeof row !== "object") continue;
    const provider = (row as { provider?: unknown }).provider;
    if (!isVerifier(provider)) {
      throw new Error("Choose a verification site");
    }
    const code = cleanToken((row as { code?: unknown }).code);
    if (!code) continue;
    const name = provider === "other" ? cleanMetaName((row as { name?: unknown }).name) : null;
    if (provider === "other" && !name) {
      throw new Error("Other sites need the meta name, such as google-site-verification");
    }
    const key = provider === "other" ? `other:${name}` : provider;
    const index = next.findIndex((item) => (item.provider === "other" ? `other:${item.name}` : item.provider) === key);
    const link = { provider, name, code };
    if (index >= 0) next[index] = link;
    else next.push(link);
  }
  return next;
}

function withVerifierFields(value: Partial<SeoProfile>) {
  const verifications = Array.isArray(value.verifications)
    ? cleanVerifications(value.verifications)
    : legacyVerifications(value.googleSiteVerification, value.bingSiteVerification);
  return {
    verifications,
    googleSiteVerification: verifications.find((item) => item.provider === "google")?.code ?? null,
    bingSiteVerification: verifications.find((item) => item.provider === "bing")?.code ?? null,
  };
}

function legacyVerifications(google: unknown, bing: unknown): SeoVerificationLink[] {
  const links: SeoVerificationLink[] = [];
  const googleCode = typeof google === "string" ? cleanToken(google) : null;
  const bingCode = typeof bing === "string" ? cleanToken(bing) : null;
  if (googleCode) links.push({ provider: "google", name: null, code: googleCode });
  if (bingCode) links.push({ provider: "bing", name: null, code: bingCode });
  return links;
}

function isVerifier(value: unknown): value is SeoVerifierId {
  return typeof value === "string" && SEO_VERIFIERS.some((item) => item.id === value);
}

function cleanMetaName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().toLowerCase();
  if (!name) return null;
  if (!/^[a-z][a-z0-9:_-]{2,40}$/.test(name)) {
    throw new Error("Meta name can use letters, numbers, colon, underscore, and hyphen");
  }
  return name;
}

export function cleanToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (!token) return null;
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(token)) {
    throw new Error("Verification code must be the code from Search Console, without the meta tag");
  }
  return token;
}

export function cleanSuffix(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const suffix = value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
  return suffix || null;
}

export function cleanSameAs(value: unknown): string[] {
  return readSameAs(value, false);
}

export function requireSameAs(value: unknown): string[] {
  return readSameAs(value, true);
}

function readSameAs(value: unknown, strict: boolean): string[] {
  const lines = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n/)
      : [];
  const urls: string[] = [];
  for (const line of lines) {
    if (typeof line !== "string") continue;
    const raw = line.trim();
    if (!raw) continue;
    if (urls.length >= 8) {
      if (strict) throw new Error("Add at most 8 profile links");
      break;
    }
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      if (strict) throw new Error(`Profile link must be a full URL: ${raw}`);
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      if (strict) throw new Error(`Profile link must start with http:// or https://: ${raw}`);
      continue;
    }
    urls.push(url.toString());
  }
  return urls;
}

function isLocale(value: unknown): value is SeoLocale {
  return typeof value === "string" && (SEO_LOCALES as readonly string[]).includes(value);
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().slice(0, max);
  return clean || null;
}
