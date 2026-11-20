import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CryptoService } from "../crypto/crypto.service";
import type { MailMessage, MailSendResult } from "./mail.port";
import { sendSmtpMessage, verifySmtpLogin, type SmtpTarget } from "./smtp-client";
import { resolveStorefrontId, type StorefrontId } from "../../modules/catalog/storefronts";

const LEGACY_KEY = "mail.smtp";
const SHOPS: StorefrontId[] = ["amarpin", "uniqbd"];

function settingsKey(shop: StorefrontId) {
  return `mail.smtp.${shop}`;
}

function shopLabel(shop: StorefrontId) {
  return shop === "uniqbd" ? "UniQbd" : "AuGetway";
}

export const EMAIL_CHANNELS = ["orders", "support", "system", "admin"] as const;
export type EmailChannelId = (typeof EMAIL_CHANNELS)[number];

type StoredChannel = {
  fromName: string;
  fromEmail: string;
  smtpUser: string;
  replyTo: string;
  passEnc: string | null;
};

type StoredSettings = {
  enabled: boolean;
  mockMode: boolean;
  customerOrderEmails: boolean;
  adminOrderAlerts: boolean;
  host: string;
  port: number;
  secure: boolean;
  channels: Record<EmailChannelId, StoredChannel>;
};

export type EmailShopView = {
  enabled: boolean;
  mockMode: boolean;
  customerOrderEmails: boolean;
  adminOrderAlerts: boolean;
  host: string;
  port: number;
  secure: boolean;
  channels: Record<
    EmailChannelId,
    {
      fromName: string;
      fromEmail: string;
      smtpUser: string;
      replyTo: string;
      hasPassword: boolean;
      usernameMasked: string;
    }
  >;
  overview: {
    fromName: string;
    fromEmail: string;
    host: string;
    port: number;
    secure: boolean;
    usernameMasked: string;
    mailboxEnabled: boolean;
    liveSending: boolean;
    provider: string;
    passwordSaved: boolean;
    configured: boolean;
  };
};

export type EmailSettingsView = {
  shops: Record<StorefrontId, EmailShopView>;
};

function emptyChannel(shop: StorefrontId): StoredChannel {
  return { fromName: shopLabel(shop), fromEmail: "", smtpUser: "", replyTo: "", passEnc: null };
}

function emptySettings(shop: StorefrontId): StoredSettings {
  return {
    enabled: false,
    mockMode: false,
    customerOrderEmails: true,
    adminOrderAlerts: true,
    host: "",
    port: 465,
    secure: true,
    channels: {
      orders: emptyChannel(shop),
      support: emptyChannel(shop),
      system: emptyChannel(shop),
      admin: emptyChannel(shop),
    },
  };
}

function maskUser(user: string) {
  const trimmed = user.trim();
  if (!trimmed) return "Not set";
  const at = trimmed.indexOf("@");
  const local = at >= 0 ? trimmed.slice(0, at) : trimmed;
  const domain = at >= 0 ? trimmed.slice(at) : "";
  return `${local.slice(0, 1) || "•"}••••••${domain}`;
}

function channelForKind(kind: MailMessage["kind"]): EmailChannelId {
  if (kind === "order_admin") return "admin";
  if (
    kind === "order_note" ||
    kind === "order_pending" ||
    kind === "order_paid" ||
    kind === "order_completed" ||
    kind === "customer_broadcast"
  ) {
    return "orders";
  }
  if (kind === "contact_reply" || kind === "product_request_reply") return "support";
  return "system";
}

function isCustomerOrderKind(kind: MailMessage["kind"]) {
  return kind === "order_note" || kind === "order_pending" || kind === "order_paid" || kind === "order_completed";
}

@Injectable()
export class EmailSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async getAdmin(): Promise<EmailSettingsView> {
    const [amarpin, uniqbd] = await Promise.all([this.read("amarpin"), this.read("uniqbd")]);
    return {
      shops: {
        amarpin: this.toView(amarpin, "amarpin"),
        uniqbd: this.toView(uniqbd, "uniqbd"),
      },
    };
  }

  async update(
    input: {
      shop: StorefrontId;
      enabled: boolean;
      mockMode: boolean;
      customerOrderEmails: boolean;
      adminOrderAlerts: boolean;
      host: string;
      port: number;
      secure: boolean;
      channel: EmailChannelId;
      fromName: string;
      fromEmail: string;
      smtpUser: string;
      replyTo: string;
      smtpPass?: string;
    },
    userId: string,
  ): Promise<EmailSettingsView> {
    const shop = resolveStorefrontId(input.shop);
    const current = await this.read(shop);
    const channel = current.channels[input.channel];
    const fromEmail = input.fromEmail.trim().toLowerCase();
    const smtpUser = input.smtpUser.trim();
    const replyTo = input.replyTo.trim().toLowerCase();
    if (fromEmail && !fromEmail.includes("@")) {
      throw new BadRequestException("From address needs a valid email.");
    }
    if (replyTo && !replyTo.includes("@")) {
      throw new BadRequestException("Reply-to needs a valid email.");
    }
    const next: StoredSettings = {
      ...current,
      enabled: input.enabled,
      mockMode: input.mockMode,
      customerOrderEmails: input.customerOrderEmails,
      adminOrderAlerts: input.adminOrderAlerts,
      host: input.host.trim(),
      port: input.port,
      secure: input.secure,
      channels: {
        ...current.channels,
        [input.channel]: {
          fromName: input.fromName.trim() || shopLabel(shop),
          fromEmail,
          smtpUser,
          replyTo,
          passEnc: this.keepOrEncrypt(input.smtpPass, channel.passEnc),
        },
      },
    };
    if (next.enabled && !next.mockMode && !this.firstReadyChannel(next)) {
      throw new BadRequestException("Add an SMTP host, username, and password before live sending.");
    }
    await this.write(shop, next);
    await this.audit.record({
      action: "mail.settings_updated",
      userId,
      metadata: { shop, channel: input.channel, enabled: next.enabled, mockMode: next.mockMode },
    });
    return this.getAdmin();
  }

  async testConnection(shop: StorefrontId, channel: EmailChannelId): Promise<{ ok: true; message: string }> {
    const target = await this.targetFor(resolveStorefrontId(shop), channel);
    try {
      await verifySmtpLogin(target);
    } catch (error) {
      const message = error instanceof Error ? error.message : "SMTP connection failed";
      throw new BadRequestException(message);
    }
    return { ok: true, message: "SMTP login succeeded." };
  }

  async sendTest(
    shop: StorefrontId,
    channel: EmailChannelId,
    to: string,
    userId: string,
  ): Promise<{ ok: true; message: string }> {
    const id = resolveStorefrontId(shop);
    const recipient = to.trim().toLowerCase();
    if (!recipient.includes("@")) throw new BadRequestException("Enter a recipient email.");
    const stored = await this.read(id);
    if (!stored.enabled) throw new BadRequestException("Turn email on before sending a test.");
    if (stored.mockMode) throw new BadRequestException("Mock mode is on, so real mail is not sent.");
    const target = await this.targetFor(id, channel, stored);
    const from = stored.channels[channel].fromEmail || target.user;
    const name = shopLabel(id);
    try {
      await sendSmtpMessage(target, {
        from,
        to: recipient,
        subject: `${name} SMTP test`,
        text: `${name} SMTP is connected. This is a test message from Email / SMTP settings.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Test email failed";
      throw new BadRequestException(message);
    }
    await this.audit.record({
      action: "mail.test_sent",
      userId,
      metadata: { shop: id, channel },
    });
    return { ok: true, message: "Test email sent." };
  }

  /** Inboxes that should receive a new-order alert for this shop. */
  async orderAlertRecipients(shop: StorefrontId): Promise<string[]> {
    const stored = await this.read(shop);
    const channel = stored.channels.orders;
    const admin = stored.channels.admin;
    const sender = (channel.fromEmail || channel.smtpUser).trim().toLowerCase();
    const found = [channel.replyTo, admin.fromEmail, admin.replyTo, admin.smtpUser];
    const unique = new Set<string>();
    for (const raw of found) {
      const email = raw.trim().toLowerCase();
      if (!email.includes("@") || email === sender) continue;
      unique.add(email);
    }
    return [...unique];
  }

  /** True when that shop's SMTP settings can deliver live mail. Omit the shop to check either site. */
  async liveReady(shop?: StorefrontId): Promise<boolean> {
    if (shop) return this.isLive(await this.read(shop));
    const rows = await Promise.all(SHOPS.map((id) => this.read(id)));
    return rows.some((row) => this.isLive(row));
  }

  private isLive(stored: StoredSettings) {
    return stored.enabled && !stored.mockMode && Boolean(this.firstReadyChannel(stored));
  }

  /** Use saved SMTP when live sending is configured. Null keeps the existing mail adapter. */
  async trySend(message: MailMessage): Promise<MailSendResult | null> {
    const stored = await this.read(resolveStorefrontId(message.storefront));
    if (!stored.enabled) return null;
    if (stored.mockMode) return { delivered: false, provider: "mock" };
    if (isCustomerOrderKind(message.kind) && !stored.customerOrderEmails) {
      return { delivered: false, provider: "smtp" };
    }
    if (message.kind === "order_admin" && !stored.adminOrderAlerts) {
      return { delivered: false, provider: "smtp" };
    }
    const channel = this.readyChannel(stored, channelForKind(message.kind));
    if (!channel) return null;
    const pass = this.decrypt(channel.row.passEnc);
    if (!pass) return null;
    const from = channel.row.fromEmail || channel.row.smtpUser;
    try {
      await sendSmtpMessage(
        {
          host: stored.host,
          port: stored.port,
          secure: stored.secure,
          user: channel.row.smtpUser,
          pass,
        },
        { from, to: message.to, subject: message.subject, text: message.text },
      );
      return { delivered: true, provider: "smtp" };
    } catch {
      return { delivered: false, provider: "smtp" };
    }
  }

  private async targetFor(
    shop: StorefrontId,
    channelId: EmailChannelId,
    stored?: StoredSettings,
  ): Promise<SmtpTarget> {
    const settings = stored ?? (await this.read(shop));
    const channel = settings.channels[channelId];
    const pass = this.decrypt(channel.passEnc);
    if (!settings.host) throw new BadRequestException("Add an SMTP host first.");
    if (!channel.smtpUser || !pass) {
      throw new BadRequestException("Save the mailbox username and password first.");
    }
    return {
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      user: channel.smtpUser,
      pass,
    };
  }

  private readyChannel(stored: StoredSettings, preferred: EmailChannelId) {
    const preferredRow = stored.channels[preferred];
    if (stored.host && preferredRow.smtpUser && preferredRow.passEnc) {
      return { id: preferred, row: preferredRow };
    }
    return this.firstReadyChannel(stored);
  }

  private firstReadyChannel(stored: StoredSettings) {
    for (const id of EMAIL_CHANNELS) {
      const row = stored.channels[id];
      if (stored.host && row.smtpUser && row.passEnc) return { id, row };
    }
    return null;
  }

  private toView(stored: StoredSettings, shop: StorefrontId): EmailShopView {
    const channels = {} as EmailShopView["channels"];
    for (const id of EMAIL_CHANNELS) {
      const row = stored.channels[id];
      channels[id] = {
        fromName: row.fromName,
        fromEmail: row.fromEmail,
        smtpUser: row.smtpUser,
        replyTo: row.replyTo,
        hasPassword: Boolean(row.passEnc),
        usernameMasked: maskUser(row.smtpUser),
      };
    }
    const primary = this.firstReadyChannel(stored) ?? {
      id: "orders" as const,
      row: stored.channels.orders,
    };
    return {
      enabled: stored.enabled,
      mockMode: stored.mockMode,
      customerOrderEmails: stored.customerOrderEmails,
      adminOrderAlerts: stored.adminOrderAlerts,
      host: stored.host,
      port: stored.port,
      secure: stored.secure,
      channels,
      overview: {
        fromName: primary.row.fromName || shopLabel(shop),
        fromEmail: primary.row.fromEmail || primary.row.smtpUser,
        host: stored.host,
        port: stored.port,
        secure: stored.secure,
        usernameMasked: maskUser(primary.row.smtpUser),
        mailboxEnabled: stored.enabled,
        liveSending: stored.enabled && !stored.mockMode,
        provider: "Custom SMTP",
        passwordSaved: EMAIL_CHANNELS.some((id) => stored.channels[id].passEnc),
        configured: Boolean(this.firstReadyChannel(stored)),
      },
    };
  }

  private keepOrEncrypt(next: string | undefined, currentEnc: string | null) {
    const trimmed = next?.trim() ?? "";
    if (!trimmed) return currentEnc;
    return this.crypto.encryptSecret(trimmed);
  }

  private decrypt(payload: string | null) {
    if (!payload?.includes(":")) return null;
    try {
      return this.crypto.decryptSecret(payload);
    } catch {
      return null;
    }
  }

  private async read(shop: StorefrontId): Promise<StoredSettings> {
    const row = await this.prisma.systemMeta.findUnique({ where: { key: settingsKey(shop) } });
    if (row?.value) return this.parse(row.value, shop);
    if (shop === "amarpin") {
      const legacy = await this.prisma.systemMeta.findUnique({ where: { key: LEGACY_KEY } });
      if (legacy?.value) return this.parse(legacy.value, shop);
    }
    return emptySettings(shop);
  }

  private parse(value: string, shop: StorefrontId): StoredSettings {
    try {
      const parsed = JSON.parse(value) as Partial<StoredSettings>;
      const base = emptySettings(shop);
      const channels = { ...base.channels };
      for (const id of EMAIL_CHANNELS) {
        const incoming = parsed.channels?.[id];
        if (!incoming) continue;
        channels[id] = {
          fromName: String(incoming.fromName || shopLabel(shop)).slice(0, 80),
          fromEmail: String(incoming.fromEmail || "").slice(0, 200),
          smtpUser: String(incoming.smtpUser || "").slice(0, 200),
          replyTo: String(incoming.replyTo || "").slice(0, 200),
          passEnc: typeof incoming.passEnc === "string" ? incoming.passEnc : null,
        };
      }
      return {
        enabled: parsed.enabled === true,
        mockMode: parsed.mockMode === true,
        customerOrderEmails: parsed.customerOrderEmails !== false,
        adminOrderAlerts: parsed.adminOrderAlerts !== false,
        host: String(parsed.host || "").slice(0, 200),
        port: Number.isInteger(parsed.port) ? Number(parsed.port) : 465,
        secure: parsed.secure !== false,
        channels,
      };
    } catch {
      return emptySettings(shop);
    }
  }

  private async write(shop: StorefrontId, settings: StoredSettings) {
    const key = settingsKey(shop);
    await this.prisma.systemMeta.upsert({
      where: { key },
      create: { key, value: JSON.stringify(settings) },
      update: { value: JSON.stringify(settings) },
    });
  }
}
