import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserStatus, Role } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CryptoService } from "../crypto/crypto.service";
import { STOREFRONTS, resolveStorefrontId, type StorefrontId } from "../../modules/catalog/storefronts";
import { deliveryCardFace } from "../../modules/catalog/catalog.mapper";
import { EmailSettingsService } from "./email-settings.service";
import { EmailTemplatesService } from "./email-templates.service";
import { MAIL_PORT, type MailMessage, type MailPort, type MailSendResult } from "./mail.port";

const TEMPLATE_BY_KIND: Partial<Record<MailMessage["kind"], string>> = {
  email_verification: "account.verify_email",
  password_reset: "account.reset_password",
  contact_reply: "account.contact_inquiry_reply",
  product_request_reply: "account.product_request_reply",
  order_note: "order.customer_note",
  order_pending: "order.pending",
  order_paid: "order.paid",
  order_completed: "order.completed",
  order_admin: "order.new_admin",
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(MAIL_PORT) private readonly mail: MailPort,
    private readonly config: ConfigService,
    private readonly settings: EmailSettingsService,
    private readonly templates: EmailTemplatesService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  /** Customer receipt and admin alert for a newly placed order. Failures stay off the checkout path. */
  notifyNewOrder(shop: StorefrontId, orderId: string): void {
    void this.deliverNewOrder(shop, orderId).catch((error: unknown) => {
      this.logger.warn(`New order mail failed: ${error instanceof Error ? error.message : "error"}`);
    });
  }

  /** Sends the completed order's card name, region, and redeem code. Failures stay off the order path. */
  notifyOrderCompleted(orderId: string): void {
    void this.deliverCompletedOrder(orderId).catch((error: unknown) => {
      this.logger.warn(`Completed order mail failed: ${error instanceof Error ? error.message : "error"}`);
    });
  }

  private async deliverCompletedOrder(orderId: string) {
    const already = await this.prisma.auditEvent.findFirst({
      where: { action: "email.order_completed", entityId: orderId },
      select: { id: true },
    });
    if (already) return;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { email: true, isGuest: true } },
        deliveries: {
          orderBy: { createdAt: "asc" },
          select: {
            titleSnapshot: true,
            codeCiphertext: true,
            inventoryItem: {
              select: {
                packageValueId: true,
                product: { select: { variationMeta: true } },
              },
            },
          },
        },
      },
    });
    if (!order) return;
    const shopId: StorefrontId = order.storefront === "uniqbd" ? "uniqbd" : "amarpin";
    const site = STOREFRONTS[shopId];
    const customerEmail = (order.contactEmail || (order.user.isGuest ? "" : order.user.email)).trim();
    if (!customerEmail.includes("@") || customerEmail.endsWith("@guests.amarpin.invalid")) return;

    const cards = order.deliveries.flatMap((delivery) => {
      try {
        const code = this.crypto.decryptSecret(delivery.codeCiphertext);
        const face = deliveryCardFace(
          delivery.inventoryItem.product.variationMeta,
          delivery.inventoryItem.packageValueId,
          delivery.titleSnapshot,
        );
        return [`${face.name}`, `Region: ${face.region || "—"}`, `Redeem Code: ${code}`, ""];
      } catch {
        return [];
      }
    });
    const intro = `Your ${site.siteName} order #${order.orderNumber} is complete.`;
    const text = [intro, "", ...cards, `${site.canonicalBaseUrl}/orders/${order.id}`].join("\n");
    const result = await this.deliver({
      kind: "order_completed",
      storefront: shopId,
      userId: order.userId,
      to: customerEmail,
      subject: `Your ${site.siteName} order #${order.orderNumber} is complete`,
      text,
      templateVars: { order_number: order.orderNumber, store_name: site.siteName },
    });
    if (!result.delivered) {
      this.logger.warn(`Completed order mail was not sent for ${order.orderNumber} (${result.provider})`);
      return;
    }
    await this.audit.record({
      action: "email.order_completed",
      entityType: "order",
      entityId: order.id,
      metadata: { shop: shopId, cards: order.deliveries.length },
    });
  }

  private async deliverNewOrder(shop: StorefrontId, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { select: { titleSnapshot: true, quantity: true } },
        user: { select: { displayName: true, email: true, phone: true, isGuest: true } },
      },
    });
    if (!order) return;
    const shopId: StorefrontId = order.storefront === "uniqbd" ? "uniqbd" : shop;
    const site = STOREFRONTS[shopId];
    const paid = order.status === "PAID" || order.status === "FULFILLED";
    const name = order.contactName || order.user.displayName || (order.user.isGuest ? "Guest" : "Customer");
    const phone = order.contactPhone || order.user.phone || "";
    const customerEmail = (order.contactEmail || (order.user.isGuest ? "" : order.user.email)).trim();
    const lines = order.items
      .slice(0, 12)
      .map((item) => `- ${item.titleSnapshot} x ${item.quantity}`)
      .join("\n");
    const extra = order.items.length > 12 ? `\n- +${order.items.length - 12} more` : "";
    const total = formatOrderMoney(order.totalMinor, order.currency);
    const vars = { order_number: order.orderNumber, store_name: site.siteName };
    const summary = [`Order #${order.orderNumber}`, `Total: ${total}`, "", lines + extra].filter(Boolean).join("\n");

    if (customerEmail.includes("@")) {
      const result = await this.deliver({
        kind: paid ? "order_paid" : "order_pending",
        storefront: shopId,
        userId: order.userId,
        to: customerEmail,
        subject: paid
          ? `Payment confirmed — order #${order.orderNumber}`
          : `Complete payment for order #${order.orderNumber}`,
        text: paid
          ? `Payment received for your ${site.siteName} order.\n\n${summary}\n\n${site.canonicalBaseUrl}/orders/${order.id}`
          : `Your ${site.siteName} order is waiting for payment.\n\n${summary}\n\n${site.canonicalBaseUrl}/orders/${order.id}`,
        templateVars: vars,
      });
      if (!result.delivered) {
        this.logger.warn(`Customer new-order mail was not sent for ${order.orderNumber} (${result.provider})`);
      }
    }

    const admins = await this.prisma.user.findMany({
      where: { roles: { has: Role.ADMINISTRATOR }, status: UserStatus.ACTIVE, isGuest: false },
      select: { email: true },
    });
    const recipients = new Set<string>([
      ...(await this.settings.orderAlertRecipients(shop)),
      ...admins.map((user) => user.email.trim().toLowerCase()),
    ]);
    const adminText = [
      `New order on ${site.siteName}`,
      `#${order.orderNumber}`,
      `Status: ${paid ? "Paid" : "Pending payment"}`,
      `Customer: ${name}`,
      phone ? `Phone: ${phone}` : "",
      customerEmail ? `Email: ${customerEmail}` : "",
      `Payment: ${order.originChannel === "WALLET" ? "Wallet" : "Gateway"}`,
      `Total: ${total}`,
      "",
      lines + extra,
      "",
      `${site.canonicalBaseUrl}/admin/orders/${order.id}`,
    ]
      .filter((line) => line !== "")
      .join("\n");
    for (const to of recipients) {
      if (!to.includes("@")) continue;
      const result = await this.deliver({
        kind: "order_admin",
        storefront: shopId,
        userId: order.userId,
        to,
        subject: `[${site.siteName}] New order incoming — #${order.orderNumber}`,
        text: adminText,
        templateVars: vars,
      });
      if (!result.delivered) {
        this.logger.warn(`Admin new-order mail was not sent for ${order.orderNumber} (${result.provider})`);
      }
    }
  }

  private async deliver(message: MailMessage): Promise<MailSendResult> {
    const prepared = await this.applyTemplate(message, true);
    if (!prepared) return { delivered: false, provider: "template" };
    const smtp = await this.settings.trySend(prepared);
    if (smtp) return smtp;
    return this.mail.send(prepared);
  }

  async readiness(storefront?: string) {
    const shop = storefront ? resolveStorefrontId(storefront) : undefined;
    const base = await this.mail.isReady();
    if (base.ready) return base;
    if (await this.settings.liveReady(shop)) {
      return {
        ready: true,
        provider: "smtp",
        message: "SMTP configured in email settings.",
      };
    }
    return base;
  }

  async sendEmailVerification(input: {
    userId: string;
    email: string;
    code: string;
    storefront?: StorefrontId;
  }): Promise<MailSendResult> {
    const shop = input.storefront ?? "amarpin";
    const name = shop === "uniqbd" ? "UniQbd" : "AuGetway";
    return this.deliver({
      kind: "email_verification",
      storefront: shop,
      userId: input.userId,
      to: input.email,
      subject: `Verify your ${name} email`,
      text: `Your ${name} verification code is ${input.code}. Enter these 4 digits to open your account. The code expires in 30 minutes.`,
      code: input.code,
    });
  }

  async sendPasswordReset(input: {
    userId: string;
    email: string;
    token: string;
    code: string;
    storefront?: StorefrontId;
  }): Promise<MailSendResult> {
    const shop = input.storefront ?? "amarpin";
    const name = shop === "uniqbd" ? "UniQbd" : "AuGetway";
    const appUrl = shop === "uniqbd" ? "https://uniqbd.com" : (this.config.get<string>("app.appPublicUrl") ?? "http://localhost:3000");
    const actionUrl = `${appUrl}/reset-password?token=${encodeURIComponent(input.token)}`;
    return this.deliver({
      kind: "password_reset",
      storefront: shop,
      userId: input.userId,
      to: input.email,
      subject: `Reset your ${name} password`,
      text: `Reset your password using this code: ${input.code}\nOr open: ${actionUrl}`,
      actionUrl,
      code: input.code,
    });
  }

  /**
   * Staff replies. Never claim delivery when the provider is not ready —
   * callers must map `delivered: false` to SKIPPED_NO_PROVIDER / FAILED.
   */
  async sendCustomerBroadcast(input: {
    to: string;
    subject: string;
    text: string;
    actorUserId: string;
    storefront: StorefrontId;
  }): Promise<void> {
    const message: MailMessage = {
      kind: "customer_broadcast",
      storefront: input.storefront,
      userId: input.actorUserId,
      to: input.to,
      subject: input.subject.trim(),
      text: input.text.trim(),
    };
    const smtp = await this.settings.trySend(message);
    if (smtp?.delivered) return;
    if (smtp) {
      throw new Error("The mailbox is turned off or could not send.");
    }
    const readiness = await this.mail.isReady();
    if (!readiness.ready) {
      throw new Error(readiness.message || "Email is not configured for this site.");
    }
    const result = await this.mail.send(message);
    if (!result.delivered) throw new Error("Email could not be sent.");
  }

  async sendStaffReply(input: {
    kind: "contact_reply" | "product_request_reply" | "order_note";
    to: string;
    subject: string;
    text: string;
    actorUserId: string;
    storefront?: StorefrontId;
  }): Promise<MailSendResult> {
    const message = await this.applyTemplate({
      kind: input.kind,
      storefront: input.storefront,
      userId: input.actorUserId,
      to: input.to,
      subject: input.subject,
      text: input.text,
    }, false);
    if (!message) return { delivered: false, provider: "template" };
    const smtp = await this.settings.trySend(message);
    if (smtp) return smtp;
    const readiness = await this.mail.isReady();
    if (!readiness.ready) {
      return {
        delivered: false,
        provider: readiness.provider,
      };
    }
    return this.mail.send(message);
  }

  private async applyTemplate(message: MailMessage, useLibrarySubject: boolean): Promise<MailMessage | null> {
    const id = TEMPLATE_BY_KIND[message.kind];
    if (!id) return message;
    const template = await this.templates.get(id, message.storefront ?? "amarpin");
    if (!template.enabled) return null;
    if (!useLibrarySubject) return message;
    return {
      ...message,
      subject: this.templates.fill(template.subject, {
        store_name: message.storefront === "uniqbd" ? "UniQbd" : "AuGetway",
        ...message.templateVars,
      }) || message.subject,
    };
  }
}

function formatOrderMoney(minor: number, currency: string) {
  const amount = (minor / 100).toLocaleString("en-US", {
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${amount} ${currency}`;
}
