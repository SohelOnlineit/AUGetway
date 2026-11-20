import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const SECURITY_SETTINGS_ID = "default";

/**
 * Default allowlist, same order as the admin “Allowed domains” chips.
 * Always merged into the stored list so the page is never empty and these providers stay allowed.
 */
export const DEFAULT_REGISTRATION_ALLOW_DOMAINS: readonly string[] = [
  "gmail.com",
  "outlook.com",
  "proton.me",
  "tuta.com",
  "zohomail.com",
  "gmx.com",
  "mail.com",
  "aol.com",
  "icloud.com",
  "mailfence.com",
  "mailo.com",
  "yandex.com",
] as const;

/** @deprecated Use DEFAULT_REGISTRATION_ALLOW_DOMAINS */
export const PINNED_REGISTRATION_ALLOW_DOMAINS = DEFAULT_REGISTRATION_ALLOW_DOMAINS;

export type RegistrationEmailDomainsDto = {
  allow: string[];
  block: string[];
};

function parseHostSegment(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  // Reject path, query, spaces
  if (/[\s/@?#]/.test(s)) return null;
  // Basic hostname / punycode labels (no leading/trailing dots)
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(s) && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(s)) {
    return null;
  }
  return s.replace(/^\.+|\.+$/g, "");
}

/** Normalize a line from bulk paste or single field into a hostname. */
export function normalizeEmailRegistrationDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  // Strip common mistakes: @domain, www., trailing dot
  if (s.startsWith("@")) s = s.slice(1);
  if (s.startsWith("www.")) s = s.slice(4);
  s = s.replace(/\.$/, "");
  return parseHostSegment(s);
}

@Injectable()
export class RegistrationEmailDomainsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<RegistrationEmailDomainsDto> {
    const row = await this.prisma.securitySettings.findUnique({
      where: { id: SECURITY_SETTINGS_ID },
    });
    if (!row) {
      const allow = [...DEFAULT_REGISTRATION_ALLOW_DOMAINS];
      await this.prisma.securitySettings.create({
        data: {
          id: SECURITY_SETTINGS_ID,
          registrationEmailAllowDomains: allow,
          registrationEmailBlockDomains: [],
        },
      });
      return { allow, block: [] };
    }
    return {
      allow: this.normalizeList(row.registrationEmailAllowDomains),
      block: this.normalizeList(row.registrationEmailBlockDomains),
    };
  }

  async set(dto: RegistrationEmailDomainsDto): Promise<RegistrationEmailDomainsDto> {
    const allow = this.normalizeList(
      dto.allow.map((d) => normalizeEmailRegistrationDomain(d)).filter(Boolean) as string[],
    );
    const allowSet = new Set(allow);
    const block = this.normalizeList(
      dto.block.map((d) => normalizeEmailRegistrationDomain(d)).filter(Boolean) as string[],
    ).filter((d) => !allowSet.has(d));

    await this.prisma.securitySettings.upsert({
      where: { id: SECURITY_SETTINGS_ID },
      create: {
        id: SECURITY_SETTINGS_ID,
        registrationEmailAllowDomains: allow,
        registrationEmailBlockDomains: block,
      },
      update: {
        registrationEmailAllowDomains: allow,
        registrationEmailBlockDomains: block,
      },
    });

    return { allow, block };
  }

  /**
   * Throws BadRequestException message if registration should be denied for this email.
   * Used by public registration only.
   */
  async assertRegistrationAllowed(email: string): Promise<void> {
    const at = email.lastIndexOf("@");
    if (at < 0 || at === email.length - 1) return;
    const hostRaw = email.slice(at + 1).trim().toLowerCase();
    const host = normalizeEmailRegistrationDomain(hostRaw);
    if (!host) {
      throw new BadRequestException("Invalid email address.");
    }

    const { allow, block } = await this.get();

    if (allow.length > 0) {
      if (!allow.includes(host)) {
        throw new BadRequestException(
          "This email domain is not allowed for registration. Use an address from an allowed provider or contact support.",
        );
      }
      return;
    }

    if (block.includes(host)) {
      throw new BadRequestException("This email domain is not allowed for registration.");
    }
  }

  /** Keep first-seen order so an admin removal stays removed. */
  private normalizeList(domains: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of domains) {
      const d = raw.trim().toLowerCase();
      if (!d || seen.has(d)) continue;
      seen.add(d);
      out.push(d);
    }
    return out;
  }
}
