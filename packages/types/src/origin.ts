/** Where a customer came from before checkout. Direct means no outside website. */

const SOURCES: Array<{ label: string; hosts: string[]; aliases: string[] }> = [
  { label: "Facebook", hosts: ["facebook.com", "fb.com", "fb.me"], aliases: ["facebook", "fb"] },
  { label: "Instagram", hosts: ["instagram.com"], aliases: ["instagram", "ig"] },
  { label: "YouTube", hosts: ["youtube.com", "youtu.be"], aliases: ["youtube", "yt"] },
  { label: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com", "openai.com"], aliases: ["chatgpt", "openai"] },
  { label: "Google", hosts: ["google.com"], aliases: ["google"] },
  { label: "TikTok", hosts: ["tiktok.com"], aliases: ["tiktok"] },
  { label: "WhatsApp", hosts: ["whatsapp.com", "wa.me"], aliases: ["whatsapp", "wa"] },
  { label: "Telegram", hosts: ["telegram.org", "t.me", "telegram.me"], aliases: ["telegram"] },
  { label: "X", hosts: ["x.com", "twitter.com", "t.co"], aliases: ["twitter", "x"] },
  { label: "LinkedIn", hosts: ["linkedin.com"], aliases: ["linkedin"] },
  { label: "Pinterest", hosts: ["pinterest.com"], aliases: ["pinterest"] },
  { label: "Reddit", hosts: ["reddit.com"], aliases: ["reddit"] },
  { label: "Snapchat", hosts: ["snapchat.com"], aliases: ["snapchat"] },
  { label: "Bing", hosts: ["bing.com"], aliases: ["bing"] },
];

export const PINNED_ORDER_ORIGINS = ["Direct", "Facebook", "YouTube", "Google", "ChatGPT"] as const;

export function normalizeOriginSource(raw?: string | null): string {
  const value = raw?.trim().slice(0, 80) ?? "";
  if (!value) return "Direct";
  const lower = value.toLowerCase().replace(/^www\./, "");
  if (lower === "direct" || lower === "(direct)" || lower === "none") return "Direct";

  for (const source of SOURCES) {
    if (source.aliases.some((alias) => lower === alias)) return source.label;
    if (source.hosts.some((host) => hostMatches(lower, host))) return source.label;
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(lower)) return labelFromHost(lower);

  const word = lower.replace(/[^a-z0-9+.-]/g, "");
  if (word.length < 2) return "Direct";
  return word.charAt(0).toUpperCase() + word.slice(1, 32);
}

export function orderOriginChoices(saved: readonly string[]): string[] {
  const values = new Set<string>(PINNED_ORDER_ORIGINS);
  for (const source of saved) {
    const label = normalizeOriginSource(source);
    if (label) values.add(label);
  }
  const rest = [...values]
    .filter((label) => !PINNED_ORDER_ORIGINS.includes(label as (typeof PINNED_ORDER_ORIGINS)[number]))
    .sort((a, b) => a.localeCompare(b));
  return [...PINNED_ORDER_ORIGINS, ...rest];
}

function hostMatches(host: string, domain: string) {
  if (host === domain || host.endsWith(`.${domain}`)) return true;
  const brand = domain.split(".")[0] ?? "";
  if (brand.length < 4) return false;
  return host === brand || host.startsWith(`${brand}.`) || host.includes(`.${brand}.`);
}

function labelFromHost(host: string) {
  const name = host.split(".")[0] ?? "";
  if (name.length < 2) return "Direct";
  return name.charAt(0).toUpperCase() + name.slice(1);
}
