import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { cleanSiteHost, currentRequest, hostCandidates, isValidSiteHost } from "./request-context";

export type DomainRow = {
  id: string;
  ownerId: string;
  host: string;
  brandName: string;
  brandLogo: string;
  brandFavicon: string;
  themeAccent: string;
  supportEmail: string;
  supportPhone: string;
  checkoutNote: string;
  active: boolean;
};

export type DomainInput = {
  host?: string;
  brandName?: string;
  brandLogo?: string;
  brandFavicon?: string;
  themeAccent?: string;
  supportEmail?: string;
  supportPhone?: string;
  checkoutNote?: string;
  active?: boolean;
};

const CACHE_MS = 15_000;
// The logo and the icon are only ever shown through <img> and <link rel="icon">. Base64 pictures only.
const PICTURE = /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/;

function cleanPicture(value: string | undefined, limit: number, what: string) {
  if (value === undefined) return undefined;
  const text = value.replace(/\s/g, "");
  if (!text) return "";
  if (text.length > limit || !PICTURE.test(text)) {
    throw new BadRequestException(`${what} must be a PNG, JPG, WEBP, GIF, SVG or ICO picture that is not too big`);
  }
  return text;
}

function cleanAccent(value: string | undefined) {
  if (value === undefined) return undefined;
  const text = value.trim();
  if (!text) return "";
  const hex = (text.startsWith("#") ? text : `#${text}`).toLowerCase();
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(hex)) throw new BadRequestException("Colour must look like #e11d48");
  return hex;
}

/**
 * The website addresses this desk answers on. A visitor sees the name, logo and colour of the address they came in
 * on, so au.uniqbd.com and au.amarpin.com can look different while they share one desk, one set of payment methods
 * and one list of transactions.
 */
@Injectable()
export class SiteDomainService {
  private cache: { at: number; byHost: Map<string, DomainRow> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async registry(): Promise<Map<string, DomainRow>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.byHost;
    const rows = await this.prisma.siteDomain.findMany({ where: { active: true } });
    const byHost = new Map(rows.map((row) => [row.host, row as DomainRow]));
    this.cache = { at: Date.now(), byHost };
    return byHost;
  }

  private forget() {
    this.cache = null;
  }

  /** The registered address for this visitor, or null for an address nobody registered. */
  async current(ownerId?: string): Promise<DomainRow | null> {
    const info = currentRequest();
    if (!info) return null;
    const byHost = await this.registry();
    for (const candidate of hostCandidates(info.host)) {
      const row = byHost.get(candidate);
      if (row && (!ownerId || row.ownerId === ownerId)) return row;
    }
    return null;
  }

  /** "https://au.amarpin.com" for a visitor on au.amarpin.com or on api.au.amarpin.com. Empty when not registered. */
  async originForRequest(): Promise<string> {
    const info = currentRequest();
    const row = await this.current();
    if (!info || !row) return "";
    return `${info.proto}://${row.host}${info.port}`;
  }

  /** True for a browser page on one of the registered addresses (used for CORS). */
  async allowsOrigin(origin: string): Promise<boolean> {
    let host = "";
    try {
      host = new URL(origin).hostname.toLowerCase();
    } catch {
      return false;
    }
    const byHost = await this.registry();
    return hostCandidates(host).some((candidate) => byHost.has(candidate));
  }

  /** On start, registers the addresses named in SITE_DOMAINS (comma separated) that are not in the table yet. */
  async seedFromEnv(ownerId: string) {
    const wanted = (process.env.SITE_DOMAINS ?? "")
      .split(",")
      .map((item) => cleanSiteHost(item))
      .filter((host) => host && isValidSiteHost(host));
    for (const host of new Set(wanted)) {
      const exists = await this.prisma.siteDomain.findUnique({ where: { host }, select: { id: true } });
      if (!exists) await this.prisma.siteDomain.create({ data: { ownerId, host } });
    }
    this.forget();
  }

  list(ownerId: string) {
    return this.prisma.siteDomain.findMany({ where: { ownerId }, orderBy: [{ createdAt: "asc" }] });
  }

  async create(ownerId: string, input: DomainInput) {
    const host = cleanSiteHost(input.host ?? "");
    if (!isValidSiteHost(host)) throw new BadRequestException("Enter the website address, like au.amarpin.com");
    if (host.startsWith("api.") && host.split(".").length > 3) {
      throw new BadRequestException("Add the website address (au.amarpin.com). Its api. address is understood automatically");
    }
    if (await this.prisma.siteDomain.findUnique({ where: { host }, select: { id: true } })) {
      throw new BadRequestException("That address is already added");
    }
    const count = await this.prisma.siteDomain.count({ where: { ownerId } });
    if (count >= 20) throw new BadRequestException("Domain limit reached");
    const row = await this.prisma.siteDomain.create({ data: { ownerId, host, ...this.fields(input) } });
    this.forget();
    return row;
  }

  async update(ownerId: string, id: string, input: DomainInput) {
    const row = await this.prisma.siteDomain.findFirst({ where: { id, ownerId } });
    if (!row) throw new NotFoundException("Domain not found");
    const data: Record<string, unknown> = { ...this.fields(input) };
    if (input.host !== undefined) {
      const host = cleanSiteHost(input.host);
      if (!isValidSiteHost(host)) throw new BadRequestException("Enter the website address, like au.amarpin.com");
      if (host !== row.host) {
        if (await this.prisma.siteDomain.findUnique({ where: { host }, select: { id: true } })) {
          throw new BadRequestException("That address is already added");
        }
        data.host = host;
      }
    }
    const updated = await this.prisma.siteDomain.update({ where: { id }, data });
    this.forget();
    return updated;
  }

  async remove(ownerId: string, id: string) {
    const removed = await this.prisma.siteDomain.deleteMany({ where: { id, ownerId } });
    if (removed.count === 0) throw new NotFoundException("Domain not found");
    this.forget();
    return { ok: true };
  }

  /** The brand fields of one input, checked. Fields left out stay out, so an update changes only what was sent. */
  private fields(input: DomainInput) {
    const out: Record<string, string | boolean> = {};
    if (input.brandName !== undefined) out.brandName = input.brandName.trim().slice(0, 60);
    const logo = cleanPicture(input.brandLogo, 1_200_000, "Logo");
    if (logo !== undefined) out.brandLogo = logo;
    const icon = cleanPicture(input.brandFavicon, 400_000, "Icon");
    if (icon !== undefined) out.brandFavicon = icon;
    const accent = cleanAccent(input.themeAccent);
    if (accent !== undefined) out.themeAccent = accent;
    if (input.supportEmail !== undefined) out.supportEmail = input.supportEmail.trim().slice(0, 120);
    if (input.supportPhone !== undefined) out.supportPhone = input.supportPhone.trim().slice(0, 40);
    if (input.checkoutNote !== undefined) out.checkoutNote = input.checkoutNote.trim().slice(0, 400);
    if (input.active !== undefined) out.active = input.active;
    return out;
  }
}
