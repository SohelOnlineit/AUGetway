import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { resolveStorefrontId, type StorefrontId } from "../../modules/catalog/storefronts";
import { EMAIL_TEMPLATE_BY_ID, EMAIL_TEMPLATE_DEFAULTS, type EmailTemplateDefault } from "./email-template.catalog";

const LEGACY_TEMPLATES_KEY = "mail.templates";

function templatesKey(shop: StorefrontId) {
  return `mail.templates.${shop}`;
}

type StoredOverride = {
  subject?: string;
  heading?: string;
  bodyText?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  enabled?: boolean;
};

export type EmailTemplateView = Omit<EmailTemplateDefault, "hint"> & {
  heading: string;
  bodyText: string;
  buttonLabel: string;
  buttonUrl: string;
  hint: string | null;
  customized: boolean;
};

@Injectable()
export class EmailTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(shop: StorefrontId = "amarpin"): Promise<{ templates: EmailTemplateView[] }> {
    const stored = await this.read(shop);
    return { templates: EMAIL_TEMPLATE_DEFAULTS.map((item) => this.merge(item, stored[item.id])) };
  }

  async get(id: string, shop: StorefrontId = "amarpin"): Promise<EmailTemplateView> {
    const base = EMAIL_TEMPLATE_BY_ID.get(id);
    if (!base) throw new NotFoundException("Email template not found");
    const stored = await this.read(shop);
    return this.merge(base, stored[id]);
  }

  async update(
    id: string,
    patch: StoredOverride,
    userId: string,
    shop: StorefrontId = "amarpin",
  ): Promise<EmailTemplateView> {
    const current = await this.get(id, shop);
    const next: StoredOverride = {
      subject: this.text(patch.subject, current.subject, 180, true),
      heading: this.text(patch.heading, current.heading, 180, false),
      bodyText: this.text(patch.bodyText, current.bodyText, 4000, false),
      buttonLabel: this.text(patch.buttonLabel, current.buttonLabel, 80, false),
      buttonUrl: this.text(patch.buttonUrl, current.buttonUrl, 500, false),
      enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    };
    const stored = await this.read(shop);
    stored[id] = next;
    await this.write(shop, stored);
    await this.audit.record({
      action: "mail.template_updated",
      userId,
      entityType: "email_template",
      entityId: id,
      metadata: { shop, enabled: next.enabled },
    });
    return this.merge(EMAIL_TEMPLATE_BY_ID.get(id)!, next);
  }

  async reset(id: string, userId: string, shop: StorefrontId = "amarpin"): Promise<EmailTemplateView> {
    if (!EMAIL_TEMPLATE_BY_ID.has(id)) throw new NotFoundException("Email template not found");
    const stored = await this.read(shop);
    delete stored[id];
    await this.write(shop, stored);
    await this.audit.record({
      action: "mail.template_reset",
      userId,
      entityType: "email_template",
      entityId: id,
      metadata: { shop },
    });
    return this.get(id, shop);
  }

  fill(subject: string, vars: Record<string, string>): string {
    return subject.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (token, key: string) => vars[key] ?? token);
  }

  private merge(base: EmailTemplateDefault, override?: StoredOverride): EmailTemplateView {
    const subject = override?.subject?.trim() || base.subject;
    const heading = override?.heading ?? "";
    const bodyText = override?.bodyText ?? "";
    const buttonLabel = override?.buttonLabel ?? "";
    const buttonUrl = override?.buttonUrl ?? "";
    const enabled = typeof override?.enabled === "boolean" ? override.enabled : base.enabled;
    const customized =
      subject !== base.subject ||
      enabled !== base.enabled ||
      Boolean(heading || bodyText || buttonLabel || buttonUrl);
    return {
      ...base,
      subject,
      heading,
      bodyText,
      buttonLabel,
      buttonUrl,
      enabled,
      hint: base.hint ?? null,
      customized,
    };
  }

  private text(value: string | undefined, current: string, max: number, required: boolean): string {
    if (value === undefined) return current;
    const trimmed = value.trim().slice(0, max);
    if (required && !trimmed) throw new BadRequestException("Subject is required.");
    return trimmed;
  }

  private async read(shop: StorefrontId): Promise<Record<string, StoredOverride>> {
    const id = resolveStorefrontId(shop);
    const row = await this.prisma.systemMeta.findUnique({ where: { key: templatesKey(id) } });
    if (row?.value) return this.parse(row.value);
    if (id !== "amarpin") return {};
    const legacy = await this.prisma.systemMeta.findUnique({ where: { key: LEGACY_TEMPLATES_KEY } });
    if (!legacy?.value) return {};
    return this.parse(legacy.value);
  }

  private parse(value: string): Record<string, StoredOverride> {
    try {
      const parsed = JSON.parse(value) as Record<string, StoredOverride>;
      const next: Record<string, StoredOverride> = {};
      for (const [id, item] of Object.entries(parsed)) {
        if (!EMAIL_TEMPLATE_BY_ID.has(id) || !item || typeof item !== "object") continue;
        next[id] = {
          subject: typeof item.subject === "string" ? item.subject.slice(0, 180) : undefined,
          heading: typeof item.heading === "string" ? item.heading.slice(0, 180) : undefined,
          bodyText: typeof item.bodyText === "string" ? item.bodyText.slice(0, 4000) : undefined,
          buttonLabel: typeof item.buttonLabel === "string" ? item.buttonLabel.slice(0, 80) : undefined,
          buttonUrl: typeof item.buttonUrl === "string" ? item.buttonUrl.slice(0, 500) : undefined,
          enabled: typeof item.enabled === "boolean" ? item.enabled : undefined,
        };
      }
      return next;
    } catch {
      return {};
    }
  }

  private async write(shop: StorefrontId, stored: Record<string, StoredOverride>) {
    const key = templatesKey(resolveStorefrontId(shop));
    await this.prisma.systemMeta.upsert({
      where: { key },
      create: { key, value: JSON.stringify(stored) },
      update: { value: JSON.stringify(stored) },
    });
  }
}
