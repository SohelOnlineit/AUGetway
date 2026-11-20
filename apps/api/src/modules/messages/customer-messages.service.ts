import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../shared/audit/audit.service";
import { MailService } from "../../shared/mail/mail.service";
import { type StorefrontId } from "../catalog/storefronts";
import { SmsGatewayService } from "../sms/sms.service";

const SCAN = 1000;
const BULK_LIMIT = 30;
const PREVIEW = 12;

type Recipient = {
  name: string;
  phone: string | null;
  email: string | null;
  orderNumber: string;
  product: string;
  productIds: string[];
  titles: Record<string, string>;
};

@Injectable()
export class CustomerMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsGatewayService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async audience(productId?: string) {
    const rows = await this.loadOrders();
    const products = productChoices(rows);
    const matched = focus(rows, productId);
    const phones = unique(matched.filter((row) => row.phone));
    const emails = unique(matched.filter((row) => row.email), "email");
    return {
      scanned: rows.length,
      orders: matched.length,
      phoneCount: phones.length,
      emailCount: emails.length,
      phones: phones.slice(0, PREVIEW).map(preview),
      emails: emails.slice(0, PREVIEW).map(preview),
      products,
      bulkLimit: BULK_LIMIT,
    };
  }

  async sendSms(shop: StorefrontId, phone: string, message: string, userId: string, productId?: string) {
    const to = bdPhone(phone);
    if (!to) throw new BadRequestException("Enter a Bangladesh mobile number, like 01XXXXXXXXX.");
    const known = (await this.matched(productId)).find((row) => row.phone === to);
    const body = fill(message, known ?? { name: "Customer", product: "", orderNumber: "" });
    await this.sms.deliver(shop, to, body);
    await this.audit.record({
      action: "customer_sms.sent",
      userId,
      metadata: { shop, mode: "single" },
    });
    return { ok: true as const, sent: 1, failed: 0, remaining: 0, message: "SMS sent." };
  }

  async sendSmsBulk(shop: StorefrontId, productId: string | undefined, message: string, userId: string) {
    const recipients = unique((await this.matched(productId)).filter((row) => row.phone));
    return this.dispatch(shop, recipients, BULK_LIMIT, userId, "customer_sms.bulk", productId, async (row) => {
      await this.sms.deliver(shop, row.phone!, fill(message, row));
    });
  }

  async sendEmail(
    shop: StorefrontId,
    email: string,
    subject: string,
    message: string,
    userId: string,
    productId?: string,
  ) {
    const to = cleanEmail(email);
    if (!to) throw new BadRequestException("Enter a valid email address.");
    const known = (await this.matched(productId)).find((row) => row.email === to);
    const person = known ?? { name: "Customer", product: "", orderNumber: "" };
    await this.mail.sendCustomerBroadcast({
      to,
      subject: fill(subject, person),
      text: fill(message, person),
      actorUserId: userId,
      storefront: shop,
    });
    await this.audit.record({
      action: "customer_email.sent",
      userId,
      metadata: { shop, mode: "single" },
    });
    return { ok: true as const, sent: 1, failed: 0, remaining: 0, message: "Email sent." };
  }

  async sendEmailBulk(
    shop: StorefrontId,
    productId: string | undefined,
    subject: string,
    message: string,
    userId: string,
  ) {
    const recipients = unique((await this.matched(productId)).filter((row) => row.email), "email");
    return this.dispatch(shop, recipients, BULK_LIMIT, userId, "customer_email.bulk", productId, async (row) => {
      await this.mail.sendCustomerBroadcast({
        to: row.email!,
        subject: fill(subject, row),
        text: fill(message, row),
        actorUserId: userId,
        storefront: shop,
      });
    });
  }

  private async matched(productId?: string) {
    return focus(await this.loadOrders(), productId);
  }

  private async loadOrders(): Promise<Recipient[]> {
    const orders = await this.prisma.order.findMany({
      where: { trashedAt: null },
      orderBy: { createdAt: "desc" },
      take: SCAN,
      select: {
        orderNumber: true,
        contactName: true,
        contactPhone: true,
        contactEmail: true,
        user: { select: { phone: true, email: true, displayName: true, isGuest: true } },
        items: { select: { productId: true, titleSnapshot: true }, take: 3 },
      },
    });
    return orders.map((order) => {
      const titles: Record<string, string> = {};
      for (const item of order.items) {
        if (item.productId && item.titleSnapshot) titles[item.productId] = item.titleSnapshot;
      }
      const phone = bdPhone(order.contactPhone) || bdPhone(order.user.phone);
      const email = cleanEmail(order.contactEmail) || (order.user.isGuest ? null : cleanEmail(order.user.email));
      return {
        name: order.contactName?.trim() || order.user.displayName?.trim() || "Customer",
        phone,
        email,
        orderNumber: order.orderNumber,
        product: order.items.map((row) => row.titleSnapshot).filter(Boolean).slice(0, 2).join(", "),
        productIds: Object.keys(titles),
        titles,
      };
    });
  }

  private async dispatch(
    shop: StorefrontId,
    recipients: Recipient[],
    limit: number,
    userId: string,
    action: string,
    productId: string | undefined,
    send: (row: Recipient) => Promise<void>,
  ) {
    if (recipients.length === 0) {
      throw new BadRequestException("No customers with that contact were found for this product.");
    }
    const batch = recipients.slice(0, limit);
    let sent = 0;
    const failures: Array<{ to: string; error: string }> = [];
    for (const row of batch) {
      try {
        await send(row);
        sent += 1;
      } catch (error) {
        failures.push({
          to: row.phone || row.email || "",
          error: error instanceof Error ? error.message : "Could not send.",
        });
      }
    }
    await this.audit.record({
      action,
      userId,
      metadata: { shop, productId: productId || null, sent, failed: failures.length },
    });
    const remaining = Math.max(0, recipients.length - batch.length);
    const failed = failures.length;
    return {
      ok: sent > 0,
      sent,
      failed,
      remaining,
      failures: failures.slice(0, 5),
      message:
        sent > 0
          ? `Sent ${sent}.${failed ? ` ${failed} failed.` : ""}${remaining ? ` ${remaining} still waiting. Send again for the next batch.` : ""}`
          : failures[0]?.error || "Nothing was sent.",
    };
  }
}

function focus(rows: Recipient[], productId?: string) {
  if (!productId) return rows;
  return rows
    .filter((row) => row.productIds.includes(productId))
    .map((row) => ({ ...row, product: row.titles[productId] || row.product }));
}

function productChoices(rows: Recipient[]) {
  const seen = new Map<string, string>();
  for (const row of rows) {
    for (const id of row.productIds) {
      if (seen.has(id)) continue;
      seen.set(id, row.titles[id] || "Product");
      if (seen.size >= 200) break;
    }
    if (seen.size >= 200) break;
  }
  return [...seen.entries()].map(([id, title]) => ({ id, title }));
}

function unique(rows: Recipient[], key: "phone" | "email" = "phone") {
  const seen = new Set<string>();
  const next: Recipient[] = [];
  for (const row of rows) {
    const value = key === "phone" ? row.phone : row.email;
    if (!value || seen.has(value)) continue;
    seen.add(value);
    next.push(row);
  }
  return next;
}

function preview(row: Recipient) {
  return {
    name: row.name,
    phone: row.phone,
    email: row.email,
    orderNumber: row.orderNumber,
    product: row.product,
  };
}

function fill(template: string, row: { name: string; product: string; orderNumber: string }) {
  return template
    .replaceAll("{name}", row.name || "Customer")
    .replaceAll("{product}", row.product || "")
    .replaceAll("{order}", row.orderNumber || "")
    .trim();
}

function bdPhone(value: string | null | undefined) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("880") ? `0${digits.slice(3)}` : digits;
  return /^01\d{9}$/.test(local) ? local : null;
}

function cleanEmail(value: string | null | undefined) {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
