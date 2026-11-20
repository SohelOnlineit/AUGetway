import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CryptoService } from "../../shared/crypto/crypto.service";
import { AuditService } from "../../shared/audit/audit.service";
import { STOREFRONTS, type StorefrontId } from "../catalog/storefronts";

const SHOPS: StorefrontId[] = ["amarpin", "uniqbd"];
const CUSTOMER_GAP_MS = 5 * 60 * 1000;
const TOKEN_PATTERN = /^\d{6,15}:[A-Za-z0-9_-]{30,120}$/;
const CHAT_PATTERN = /^-?\d{1,20}$|^@[A-Za-z][A-Za-z0-9_]{3,31}$/;

type StoredTelegram = {
  orderAlerts: boolean;
  messageAlerts: boolean;
  chatId: string;
  botTokenEnc: string | null;
};

export type TelegramShopView = {
  orderAlerts: boolean;
  messageAlerts: boolean;
  chatId: string;
  hasBotToken: boolean;
  configured: boolean;
  status: "connected" | "off" | "setup";
};

export type TelegramShopsView = {
  shops: Record<StorefrontId, TelegramShopView>;
};

function settingsKey(shop: StorefrontId) {
  return `telegram.settings.${shop}`;
}

function shopLabel(shop: StorefrontId) {
  return STOREFRONTS[shop].siteName;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly customerSentAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async getAdmin(): Promise<TelegramShopsView> {
    const shops = {} as TelegramShopsView["shops"];
    for (const shop of SHOPS) {
      shops[shop] = this.toAdmin(await this.readStored(shop));
    }
    return { shops };
  }

  async update(
    shop: StorefrontId,
    input: {
      orderAlerts: boolean;
      messageAlerts: boolean;
      chatId: string;
      botToken?: string;
    },
    userId: string,
  ): Promise<TelegramShopsView> {
    const current = await this.readStored(shop);
    const chatId = input.chatId.trim();
    const botTokenEnc = this.keepOrEncrypt(input.botToken, current?.botTokenEnc ?? null);
    if (chatId && !CHAT_PATTERN.test(chatId)) {
      throw new BadRequestException("Chat ID must be a number, such as 123456789, or a @channel name.");
    }
    if ((input.orderAlerts || input.messageAlerts) && (!botTokenEnc || !chatId)) {
      throw new BadRequestException("Add the bot token and chat ID before turning alerts on.");
    }
    const next: StoredTelegram = {
      orderAlerts: input.orderAlerts,
      messageAlerts: input.messageAlerts,
      chatId,
      botTokenEnc,
    };
    await this.writeStored(shop, next);
    await this.audit.record({
      action: "telegram.settings_updated",
      userId,
      metadata: {
        shop,
        orderAlerts: input.orderAlerts,
        messageAlerts: input.messageAlerts,
      },
    });
    return this.getAdmin();
  }

  async sendTest(shop: StorefrontId, userId: string): Promise<{ ok: true; message: string }> {
    const stored = await this.readStored(shop);
    if (!stored?.botTokenEnc || !stored.chatId) {
      throw new BadRequestException("Save the bot token and chat ID first.");
    }
    const token = this.decrypt(stored.botTokenEnc);
    if (!token) throw new BadRequestException("Saved bot token could not be read. Paste it again.");
    const error = await this.deliver(
      token,
      stored.chatId,
      `<b>${escapeHtml(shopLabel(shop))} Telegram alerts are connected.</b>\nOrder and customer-message switches can be changed in Settings.`,
    );
    if (error) throw new BadRequestException(error);
    await this.audit.record({
      action: "telegram.test_sent",
      userId,
      metadata: { shop },
    });
    return { ok: true, message: `Test message sent to the ${shopLabel(shop)} Telegram chat.` };
  }

  notifyOrder(shop: StorefrontId, orderId: string): void {
    void this.sendOrder(shop, orderId).catch((error: unknown) => {
      this.logger.warn(`Telegram order alert failed: ${error instanceof Error ? error.message : "error"}`);
    });
  }

  notifyCustomerMessage(input: {
    shop: StorefrontId;
    userId: string;
    channel: "Live chat" | "Ticket";
    text: string;
    path: string;
  }): void {
    void this.sendCustomerMessage(input).catch((error: unknown) => {
      this.logger.warn(`Telegram customer alert failed: ${error instanceof Error ? error.message : "error"}`);
    });
  }

  private async sendOrder(shop: StorefrontId, orderId: string) {
    const stored = await this.readStored(shop);
    if (!stored?.orderAlerts || !stored.botTokenEnc || !stored.chatId) return;
    const token = this.decrypt(stored.botTokenEnc);
    if (!token) return;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { select: { titleSnapshot: true, quantity: true } },
        user: { select: { displayName: true, email: true, phone: true, isGuest: true } },
      },
    });
    if (!order) return;
    const name = order.contactName || order.user.displayName || (order.user.isGuest ? "Guest" : "Customer");
    const phone = order.contactPhone || order.user.phone || "";
    const email = order.contactEmail || (order.user.isGuest ? "" : order.user.email);
    const lines = order.items
      .slice(0, 8)
      .map((item) => `• ${escapeHtml(item.titleSnapshot)} × ${item.quantity}`)
      .join("\n");
    const extra = order.items.length > 8 ? `\n• +${order.items.length - 8} more` : "";
    const text = [
      `<b>New order</b> · ${escapeHtml(shopLabel(shop))}`,
      `#${escapeHtml(order.orderNumber)}`,
      `Status: ${escapeHtml(order.status === "PAID" || order.status === "FULFILLED" ? "Paid" : "Pending payment")}`,
      `Customer: ${escapeHtml(name)}`,
      phone ? `Phone: ${escapeHtml(phone)}` : "",
      email ? `Email: ${escapeHtml(email)}` : "",
      `Payment: ${order.originChannel === "WALLET" ? "Wallet" : "Gateway"}`,
      `Total: ${escapeHtml(formatMoney(order.totalMinor, order.currency))}`,
      "",
      lines + extra,
      "",
      `<a href="${escapeHtml(adminUrl(shop, `/admin/orders/${order.id}`))}">Open order</a>`,
    ]
      .filter((line) => line !== "")
      .join("\n");
    const error = await this.deliver(token, stored.chatId, text);
    if (error) this.logger.warn(`Telegram order alert rejected: ${error}`);
  }

  private async sendCustomerMessage(input: {
    shop: StorefrontId;
    userId: string;
    channel: "Live chat" | "Ticket";
    text: string;
    path: string;
  }) {
    const stored = await this.readStored(input.shop);
    if (!stored?.messageAlerts || !stored.botTokenEnc || !stored.chatId) return;
    const slot = `${input.shop}:${input.userId}`;
    if (!this.claimCustomerSlot(slot)) return;
    const token = this.decrypt(stored.botTokenEnc);
    if (!token) {
      this.releaseCustomerSlot(slot);
      return;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { displayName: true, phone: true, email: true, isGuest: true },
    });
    const name = user?.displayName || (user?.isGuest ? "Guest" : "Customer");
    const snippet = input.text.trim().replace(/\s+/g, " ").slice(0, 500) || "Sent a photo.";
    const text = [
      `<b>Customer message</b> · ${escapeHtml(shopLabel(input.shop))}`,
      escapeHtml(input.channel),
      `Customer: ${escapeHtml(name)}`,
      user?.phone ? `Phone: ${escapeHtml(user.phone)}` : "",
      user && !user.isGuest ? `Email: ${escapeHtml(user.email)}` : "",
      "",
      escapeHtml(snippet),
      "",
      `<a href="${escapeHtml(adminUrl(input.shop, input.path))}">Open in admin</a>`,
    ]
      .filter((line) => line !== "")
      .join("\n");
    const error = await this.deliver(token, stored.chatId, text);
    if (error) {
      this.releaseCustomerSlot(slot);
      this.logger.warn(`Telegram customer alert rejected: ${error}`);
    }
  }

  private claimCustomerSlot(slot: string) {
    const now = Date.now();
    const last = this.customerSentAt.get(slot) ?? 0;
    if (now - last < CUSTOMER_GAP_MS) return false;
    this.customerSentAt.set(slot, now);
    if (this.customerSentAt.size > 5000) {
      for (const [key, at] of this.customerSentAt) {
        if (now - at >= CUSTOMER_GAP_MS) this.customerSentAt.delete(key);
      }
    }
    return true;
  }

  private releaseCustomerSlot(slot: string) {
    this.customerSentAt.delete(slot);
  }

  private async deliver(token: string, chatId: string, text: string): Promise<string | null> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
      if (!response.ok || payload?.ok !== true) {
        return cleanTelegramError(payload?.description);
      }
      return null;
    } catch {
      return "Telegram could not be reached.";
    }
  }

  private toAdmin(stored: StoredTelegram | null): TelegramShopView {
    const orderAlerts = stored?.orderAlerts === true;
    const messageAlerts = stored?.messageAlerts === true;
    const hasBotToken = Boolean(stored?.botTokenEnc);
    const chatId = stored?.chatId ?? "";
    const configured = hasBotToken && Boolean(chatId);
    const alertsOn = orderAlerts || messageAlerts;
    const status = alertsOn && configured ? "connected" : alertsOn || (hasBotToken && !chatId) || (chatId && !hasBotToken) ? "setup" : "off";
    return { orderAlerts, messageAlerts, chatId, hasBotToken, configured, status };
  }

  private async readStored(shop: StorefrontId): Promise<StoredTelegram | null> {
    const row = await this.prisma.systemMeta.findUnique({ where: { key: settingsKey(shop) } });
    if (!row?.value) return null;
    try {
      const parsed = JSON.parse(row.value) as Partial<StoredTelegram>;
      return {
        orderAlerts: parsed.orderAlerts === true,
        messageAlerts: parsed.messageAlerts === true,
        chatId: typeof parsed.chatId === "string" ? parsed.chatId : "",
        botTokenEnc: typeof parsed.botTokenEnc === "string" ? parsed.botTokenEnc : null,
      };
    } catch {
      return null;
    }
  }

  private async writeStored(shop: StorefrontId, next: StoredTelegram) {
    const key = settingsKey(shop);
    await this.prisma.systemMeta.upsert({
      where: { key },
      create: { key, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    });
  }

  private keepOrEncrypt(next: string | undefined, current: string | null) {
    const trimmed = next?.trim() ?? "";
    if (!trimmed) return current;
    if (!TOKEN_PATTERN.test(trimmed)) {
      throw new BadRequestException("Bot token should look like 123456789:ABC... from BotFather.");
    }
    return this.crypto.encryptSecret(trimmed);
  }

  private decrypt(payload: string | null) {
    if (!payload) return null;
    try {
      return this.crypto.decryptSecret(payload);
    } catch {
      return null;
    }
  }
}

function adminUrl(shop: StorefrontId, path: string) {
  return `${STOREFRONTS[shop].canonicalBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function formatMoney(minor: number, currency: string) {
  const amount = (minor / 100).toLocaleString("en-US", {
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${amount} ${currency}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cleanTelegramError(description: string | undefined) {
  const text = (description ?? "Telegram did not accept the message.").replace(/bot\d+:[A-Za-z0-9_-]+/gi, "bot");
  return text.slice(0, 180);
}
