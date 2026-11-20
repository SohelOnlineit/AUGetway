import { Injectable } from "@nestjs/common";
import type { PublicContactDetails } from "@amarpin/types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { contactDetailsKey, parseContactDetails, requireContactDetails } from "../../shared/contact-details";
import type { StorefrontId } from "../catalog/storefronts";

const SHOPS: StorefrontId[] = ["amarpin", "uniqbd"];

export type ContactDetailsView = {
  shops: Record<StorefrontId, PublicContactDetails>;
};

@Injectable()
export class ContactSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getAdmin(): Promise<ContactDetailsView> {
    const shops = {} as ContactDetailsView["shops"];
    for (const shop of SHOPS) {
      shops[shop] = await this.read(shop);
    }
    return { shops };
  }

  async update(
    shop: StorefrontId,
    input: { phone: string; address: string; whatsapp: string },
    userId: string,
  ): Promise<ContactDetailsView> {
    const next = requireContactDetails(input);
    const key = contactDetailsKey(shop);
    await this.prisma.systemMeta.upsert({
      where: { key },
      create: { key, value: JSON.stringify(stored(next)) },
      update: { value: JSON.stringify(stored(next)) },
    });
    await this.audit.record({
      action: "contact.details_updated",
      userId,
      metadata: { shop, phone: next.phone },
    });
    return this.getAdmin();
  }

  private async read(shop: StorefrontId) {
    const row = await this.prisma.systemMeta.findUnique({ where: { key: contactDetailsKey(shop) } });
    return parseContactDetails(row?.value);
  }
}

function stored(details: PublicContactDetails) {
  return {
    phone: details.phone,
    address: details.address,
    whatsapp: details.whatsapp,
  };
}
