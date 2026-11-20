import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CryptoService } from "../../shared/crypto/crypto.service";
import { AuditService } from "../../shared/audit/audit.service";
import { type StorefrontId } from "../catalog/storefronts";
import {
  DEFAULT_SMS_TEMPLATES,
  SMS_PROVIDERS,
  type SmsProviderId,
  type SmsTemplate,
} from "./sms.defaults";

const LEGACY_GATEWAY_KEY = "sms.gateway";
const LEGACY_TEMPLATES_KEY = "sms.templates";
const SHOPS: StorefrontId[] = ["amarpin", "uniqbd"];

function gatewayKey(shop: StorefrontId) {
  return `sms.gateway.${shop}`;
}

function templatesKey(shop: StorefrontId) {
  return `sms.templates.${shop}`;
}

function shopLabel(shop: StorefrontId) {
  return shop === "uniqbd" ? "UniQbd" : "AuGetway";
}

type StoredGateway = {
  enabled: boolean;
  provider: SmsProviderId;
  senderId: string;
  username: string;
  baseUrl: string;
  apiKeyEnc: string | null;
};

export type SmsGatewayAdminView = {
  enabled: boolean;
  provider: SmsProviderId;
  senderId: string;
  username: string;
  baseUrl: string;
  hasApiKey: boolean;
  configured: boolean;
  status: "connected" | "off" | "setup";
  providers: typeof SMS_PROVIDERS;
};

export type SmsShopView = SmsGatewayAdminView & { templates: SmsTemplate[] };

export type SmsShopsView = {
  shops: Record<StorefrontId, SmsShopView>;
};

@Injectable()
export class SmsGatewayService {
  private readonly logger = new Logger(SmsGatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async getAdmin(): Promise<SmsShopsView> {
    const shops = {} as SmsShopsView["shops"];
    for (const shop of SHOPS) {
      shops[shop] = {
        ...this.toAdmin(await this.readStored(shop)),
        templates: await this.readTemplates(shop),
      };
    }
    return { shops };
  }

  async update(
    shop: StorefrontId,
    input: {
      enabled: boolean;
      provider: SmsProviderId;
      senderId: string;
      username?: string;
      baseUrl?: string;
      apiKey?: string;
    },
    userId: string,
  ): Promise<SmsShopsView> {
    const current = await this.readStored(shop);
    const provider = input.provider;
    const senderId = input.senderId.trim();
    const username = (input.username ?? "").trim();
    const baseUrl = provider === "uniqbd" && !normalizeUrl(input.baseUrl ?? "")
      ? "https://pay.uniqbd.com"
      : normalizeUrl(input.baseUrl ?? "");
    const apiKeyEnc = this.keepOrEncrypt(input.apiKey, current?.apiKeyEnc ?? null);
    if (input.enabled) {
      if (!apiKeyEnc) throw new BadRequestException("Add an API key before turning the gateway on.");
      if (provider === "custom" && !baseUrl) {
        throw new BadRequestException("Custom HTTP needs an API URL.");
      }
      if (provider === "mimsms" && !username) {
        throw new BadRequestException("MimSMS needs a username.");
      }
      if ((provider === "bulksmsbd" || provider === "mimsms") && !senderId) {
        throw new BadRequestException("This provider needs a sender ID.");
      }
    }
    const next: StoredGateway = {
      enabled: input.enabled,
      provider,
      senderId,
      username,
      baseUrl,
      apiKeyEnc,
    };
    await this.writeStored(shop, next);
    await this.audit.record({
      action: "sms.gateway_updated",
      userId,
      metadata: { shop, provider, enabled: input.enabled },
    });
    return this.getAdmin();
  }

  async testConnection(shop: StorefrontId): Promise<{ ok: true; message: string; balance: string | null }> {
    const stored = await this.requireKey(shop);
    const key = this.decrypt(stored.apiKeyEnc);
    if (!key) throw new BadRequestException("Saved API key could not be read. Enter it again.");
    const result = await checkBalance(stored, key);
    return { ok: true, message: result.message, balance: result.balance };
  }

  /** One completion SMS to the order's mobile number. Never throws into checkout or admin actions. */
  notifyOrderCompleted(orderId: string): void {
    void this.sendOrderCompleted(orderId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "error";
      this.logger.warn(`Order complete SMS failed for orderId=${orderId}: ${message}`);
    });
  }

  private async sendOrderCompleted(orderId: string): Promise<void> {
    const already = await this.prisma.auditEvent.findFirst({
      where: { action: "sms.order_completed", entityId: orderId },
      select: { id: true },
    });
    if (already) return;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        totalMinor: true,
        currency: true,
        storefront: true,
        contactName: true,
        contactPhone: true,
        user: { select: { displayName: true, phone: true, isGuest: true } },
      },
    });
    if (!order) return;
    const phone = (order.contactPhone || order.user.phone || "").trim();
    if (!phone) {
      this.logger.warn(`Order complete SMS skipped for ${order.orderNumber}: no mobile number`);
      return;
    }

    const shop: StorefrontId = order.storefront === "uniqbd" ? "uniqbd" : "amarpin";
    const stored = await this.readStored(shop);
    if (!stored?.enabled || !stored.apiKeyEnc) return;
    const templates = await this.readTemplates(shop);
    const template = templates.find((item) => item.id === "order_delivered") ?? defaultsFor(shop).find((item) => item.id === "order_delivered");
    if (!template?.enabled) return;
    const amount = formatSmsAmount(order.totalMinor, order.currency);
    const name = order.contactName || order.user.displayName || (order.user.isGuest ? "Customer" : "Customer");
    const body = fillSms(template.body, {
      name,
      orderNumber: order.orderNumber,
      amount,
      code: "",
    });
    await this.deliver(shop, phone, body);
    await this.audit.record({
      action: "sms.order_completed",
      entityType: "order",
      entityId: order.id,
      metadata: { shop, orderNumber: order.orderNumber },
    });
  }

  async deliver(shop: StorefrontId, phone: string, message: string): Promise<void> {
    const to = normalizeBdPhone(phone);
    const body = message.trim();
    if (!body) throw new BadRequestException("Write the SMS message first.");
    const stored = await this.requireKey(shop);
    if (!stored.enabled) throw new BadRequestException("Turn the SMS gateway on before sending.");
    const key = this.decrypt(stored.apiKeyEnc);
    if (!key) throw new BadRequestException("Saved API key could not be read. Enter it again.");
    await sendSms(stored, key, to, body.slice(0, 640));
  }

  async sendTest(shop: StorefrontId, phone: string, userId: string): Promise<{ ok: true; message: string }> {
    const stored = await this.requireKey(shop);
    if (!stored.enabled) throw new BadRequestException("Turn the gateway on before sending a test SMS.");
    const key = this.decrypt(stored.apiKeyEnc);
    if (!key) throw new BadRequestException("Saved API key could not be read. Enter it again.");
    const to = normalizeBdPhone(phone);
    await sendSms(stored, key, to, `${shopLabel(shop)} SMS gateway is connected.`);
    await this.audit.record({
      action: "sms.test_sent",
      userId,
      metadata: { shop, provider: stored.provider },
    });
    return { ok: true, message: `Test SMS sent from ${shopLabel(shop)}.` };
  }

  async listTemplates(shop: StorefrontId): Promise<{ templates: SmsTemplate[] }> {
    return { templates: await this.readTemplates(shop) };
  }

  async createTemplate(
    shop: StorefrontId,
    input: { name: string; body: string; enabled: boolean },
    userId: string,
  ): Promise<SmsShopsView> {
    const templates = await this.readTemplates(shop);
    const template: SmsTemplate = {
      id: uniqueId(input.name, templates),
      name: input.name.trim(),
      body: input.body.trim(),
      enabled: input.enabled,
      isDefault: false,
    };
    templates.push(template);
    await this.writeTemplates(shop, templates);
    await this.audit.record({
      action: "sms.template_created",
      userId,
      metadata: { shop, id: template.id },
    });
    return this.getAdmin();
  }

  async updateTemplate(
    shop: StorefrontId,
    id: string,
    input: { name: string; body: string; enabled: boolean },
    userId: string,
  ): Promise<SmsShopsView> {
    const templates = await this.readTemplates(shop);
    const index = templates.findIndex((template) => template.id === id);
    const current = templates[index];
    if (!current) throw new NotFoundException("SMS template not found");
    const next: SmsTemplate = {
      ...current,
      name: input.name.trim(),
      body: input.body.trim(),
      enabled: input.enabled,
    };
    templates[index] = next;
    await this.writeTemplates(shop, templates);
    await this.audit.record({
      action: "sms.template_updated",
      userId,
      metadata: { shop, id },
    });
    return this.getAdmin();
  }

  private async requireKey(shop: StorefrontId): Promise<StoredGateway> {
    const stored = await this.readStored(shop);
    if (!stored?.apiKeyEnc) throw new BadRequestException(`Save an API key for ${shopLabel(shop)} first.`);
    return stored;
  }

  private toAdmin(stored: StoredGateway | null): SmsGatewayAdminView {
    const provider = stored?.provider ?? "sms.net.bd";
    const hasApiKey = Boolean(stored?.apiKeyEnc);
    const senderId = stored?.senderId ?? "";
    const configured =
      hasApiKey &&
      (provider !== "custom" || Boolean(stored?.baseUrl)) &&
      (provider !== "mimsms" || Boolean(stored?.username)) &&
      ((provider !== "bulksmsbd" && provider !== "mimsms") || Boolean(senderId));
    const enabled = stored?.enabled === true;
    return {
      enabled,
      provider,
      senderId,
      username: stored?.username ?? "",
      baseUrl: stored?.baseUrl ?? "",
      hasApiKey,
      configured,
      status: !enabled ? "off" : configured ? "connected" : "setup",
      providers: SMS_PROVIDERS,
    };
  }

  private keepOrEncrypt(next: string | undefined, currentEnc: string | null): string | null {
    const trimmed = next?.trim() ?? "";
    if (!trimmed) return currentEnc;
    return this.crypto.encryptSecret(trimmed);
  }

  private decrypt(payload: string | null): string | null {
    if (!payload || !payload.includes(":")) return null;
    try {
      return this.crypto.decryptSecret(payload);
    } catch {
      return null;
    }
  }

  private async readStored(shop: StorefrontId): Promise<StoredGateway | null> {
    const row = await this.prisma.systemMeta.findUnique({ where: { key: gatewayKey(shop) } });
    if (row?.value) return this.parseGateway(row.value);
    if (shop !== "amarpin") return null;
    const legacy = await this.prisma.systemMeta.findUnique({ where: { key: LEGACY_GATEWAY_KEY } });
    if (!legacy?.value) return null;
    return this.parseGateway(legacy.value);
  }

  private parseGateway(value: string): StoredGateway | null {
    try {
      const parsed = JSON.parse(value) as Partial<StoredGateway>;
      const provider = SMS_PROVIDERS.some((item) => item.id === parsed.provider)
        ? (parsed.provider as SmsProviderId)
        : "sms.net.bd";
      return {
        enabled: parsed.enabled === true,
        provider,
        senderId: typeof parsed.senderId === "string" ? parsed.senderId : "",
        username: typeof parsed.username === "string" ? parsed.username : "",
        baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
        apiKeyEnc: typeof parsed.apiKeyEnc === "string" ? parsed.apiKeyEnc : null,
      };
    } catch {
      return null;
    }
  }

  private async writeStored(shop: StorefrontId, next: StoredGateway) {
    const key = gatewayKey(shop);
    await this.prisma.systemMeta.upsert({
      where: { key },
      create: { key, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    });
  }

  private async readTemplates(shop: StorefrontId): Promise<SmsTemplate[]> {
    const row = await this.prisma.systemMeta.findUnique({ where: { key: templatesKey(shop) } });
    if (row?.value) return this.parseTemplates(row.value, shop);
    if (shop === "amarpin") {
      const legacy = await this.prisma.systemMeta.findUnique({ where: { key: LEGACY_TEMPLATES_KEY } });
      if (legacy?.value) return this.parseTemplates(legacy.value, shop);
    }
    return defaultsFor(shop);
  }

  private parseTemplates(value: string, shop: StorefrontId): SmsTemplate[] {
    try {
      const parsed = JSON.parse(value) as SmsTemplate[];
      if (!Array.isArray(parsed) || parsed.length === 0) return defaultsFor(shop);
      return parsed.filter((template) => template && typeof template.id === "string" && typeof template.body === "string");
    } catch {
      return defaultsFor(shop);
    }
  }

  private async writeTemplates(shop: StorefrontId, templates: SmsTemplate[]) {
    const key = templatesKey(shop);
    await this.prisma.systemMeta.upsert({
      where: { key },
      create: { key, value: JSON.stringify(templates) },
      update: { value: JSON.stringify(templates) },
    });
  }
}

function fillSms(body: string, vars: Record<string, string>) {
  return body.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

function formatSmsAmount(minor: number, currency: string) {
  const amount = (minor / 100).toLocaleString("en-US", {
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${amount} ${currency}`;
}

function defaultsFor(shop: StorefrontId): SmsTemplate[] {
  const label = shopLabel(shop);
  return DEFAULT_SMS_TEMPLATES.map((template) => ({
    ...template,
    body: template.body.replaceAll("AuGetway", label),
  }));
}

function uniqueId(name: string, templates: SmsTemplate[]) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "template";
  let id = base;
  let n = 2;
  const taken = new Set(templates.map((template) => template.id));
  while (taken.has(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  return id;
}

function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function normalizeBdPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("880") ? `0${digits.slice(3)}` : digits;
  if (!/^01\d{9}$/.test(local)) {
    throw new BadRequestException("Enter a Bangladesh mobile number, like 01XXXXXXXXX.");
  }
  return `880${local.slice(1)}`;
}

async function checkBalance(stored: StoredGateway, key: string): Promise<{ message: string; balance: string | null }> {
  if (stored.provider === "sms.net.bd") {
    const payload = await getJson(`https://api.sms.net.bd/report/balance?api_key=${encodeURIComponent(key)}`);
    if (payload.error !== 0 && payload.error !== "0") {
      throw new BadRequestException(text(payload.msg) || "SMS.net.bd rejected the API key.");
    }
    const balance = text(asRecord(payload.data).balance);
    return { message: balance ? `Connected. Balance ${balance}.` : "Connected to SMS.net.bd.", balance };
  }
  if (stored.provider === "bulksmsbd") {
    const payload = await getJson(`https://bulksmsbd.net/api/getBalanceApi?api_key=${encodeURIComponent(key)}`);
    const balance = text(payload.balance);
    if (!balance && text(payload.error)) throw new BadRequestException(text(payload.error) || "BulkSMS BD rejected the API key.");
    return { message: balance ? `Connected. Balance ${balance}.` : "Connected to BulkSMS BD.", balance };
  }
  if (stored.provider === "greenweb") {
    const payload = await getJson(
      `https://api.greenweb.com.bd/g_api.php?token=${encodeURIComponent(key)}&balance&json`,
    );
    const balance = text(payload.balance) || text(payload.Balance);
    if (!balance && /error|invalid|fail/i.test(JSON.stringify(payload))) {
      throw new BadRequestException("GreenWeb rejected the token.");
    }
    return { message: balance ? `Connected. Balance ${balance}.` : "Connected to GreenWeb.", balance };
  }
  if (stored.provider === "mimsms") {
    if (!stored.username) throw new BadRequestException("MimSMS needs a username.");
    const payload = await getJson(
      `https://api.mimsms.com/api/SmsSending/balanceCheck?UserName=${encodeURIComponent(stored.username)}&Apikey=${encodeURIComponent(key)}`,
    );
    const balance = text(payload.Balance) || text(payload.balance);
    if (!balance && /invalid|fail|error/i.test(JSON.stringify(payload))) {
      throw new BadRequestException("MimSMS rejected the username or API key.");
    }
    return { message: balance ? `Connected. Balance ${balance}.` : "Connected to MimSMS.", balance };
  }
  if (stored.provider === "uniqbd") {
    const root = (stored.baseUrl || "https://pay.uniqbd.com").replace(/\/+$/, "");
    let response: Response;
    try {
      response = await fetch(`${root}/api/sms/status`, {
        headers: { accept: "application/json", "RT-UDDOKTAPAY-API-KEY": key },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new BadRequestException("Could not reach UniqBD Pay.");
    }
    const payload = parseJson(await response.text());
    if (response.status === 401 || response.status === 403) {
      throw new BadRequestException("UniqBD Pay rejected the API key.");
    }
    if (!response.ok || payload.ok === false) {
      throw new BadRequestException(text(payload.message) || "UniqBD Pay could not be reached.");
    }
    const phones = text(payload.phones);
    return {
      message: phones ? `Connected. ${phones} phone${phones === "1" ? "" : "s"} registered.` : "Connected to UniqBD Pay.",
      balance: null,
    };
  }
  if (!stored.baseUrl) throw new BadRequestException("Custom HTTP needs an API URL.");
  const response = await fetch(stored.baseUrl, {
    method: "GET",
    headers: { authorization: `Bearer ${key}`, "x-api-key": key },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401 || response.status === 403) {
    throw new BadRequestException("The gateway rejected the API key.");
  }
  if (response.status >= 500) throw new BadRequestException("The gateway did not respond.");
  return { message: "Gateway URL is reachable.", balance: null };
}

async function sendSms(stored: StoredGateway, key: string, to: string, message: string) {
  if (stored.provider === "sms.net.bd") {
    const body = new URLSearchParams({ api_key: key, msg: message, to });
    if (stored.senderId) body.set("sender_id", stored.senderId);
    const payload = await postForm("https://api.sms.net.bd/sendsms", body);
    if (payload.error !== 0 && payload.error !== "0") {
      throw new BadRequestException(text(payload.msg) || "SMS.net.bd did not send the SMS.");
    }
    return;
  }
  if (stored.provider === "bulksmsbd") {
    if (!stored.senderId) throw new BadRequestException("BulkSMS BD needs a sender ID.");
    const url = new URL("https://bulksmsbd.net/api/smsapi");
    url.searchParams.set("api_key", key);
    url.searchParams.set("type", "text");
    url.searchParams.set("number", to);
    url.searchParams.set("senderid", stored.senderId);
    url.searchParams.set("message", message);
    const payload = await getJson(url.toString());
    const code = String(payload.response_code ?? payload.response ?? "");
    if (code && code !== "202" && code !== "1000" && code !== "0") {
      throw new BadRequestException(text(payload.error_message) || text(payload.success_message) || "BulkSMS BD did not send the SMS.");
    }
    return;
  }
  if (stored.provider === "greenweb") {
    const url = new URL("https://api.greenweb.com.bd/api.php");
    url.searchParams.set("token", key);
    url.searchParams.set("to", to);
    url.searchParams.set("message", message);
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const raw = (await response.text()).trim();
    if (!response.ok || /error|invalid|fail/i.test(raw)) {
      throw new BadRequestException(raw.slice(0, 180) || "GreenWeb did not send the SMS.");
    }
    return;
  }
  if (stored.provider === "mimsms") {
    if (!stored.username || !stored.senderId) {
      throw new BadRequestException("MimSMS needs a username and sender ID.");
    }
    const payload = await postJson("https://api.mimsms.com/api/SmsSending/SMS", {
      UserName: stored.username,
      Apikey: key,
      MobileNumber: to,
      SenderName: stored.senderId,
      TransactionType: "T",
      Message: message,
    });
    const status = text(payload.statusCode) || text(payload.Status);
    if (status && status !== "200" && !/success/i.test(JSON.stringify(payload))) {
      throw new BadRequestException(text(payload.responseResult) || "MimSMS did not send the SMS.");
    }
    return;
  }
  if (stored.provider === "uniqbd") {
    const root = (stored.baseUrl || "https://pay.uniqbd.com").replace(/\/+$/, "");
    let response: Response;
    try {
      response = await fetch(`${root}/api/sms/send`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "RT-UDDOKTAPAY-API-KEY": key,
        },
        body: JSON.stringify({ to, message: message.slice(0, 320) }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new BadRequestException("Could not reach UniqBD Pay.");
    }
    const payload = parseJson(await response.text());
    if (response.status === 401 || response.status === 403) {
      throw new BadRequestException("UniqBD Pay rejected the API key.");
    }
    if (!response.ok || payload.ok === false) {
      throw new BadRequestException(text(payload.message) || "UniqBD Pay did not queue the SMS.");
    }
    return;
  }
  if (!stored.baseUrl) throw new BadRequestException("Custom HTTP needs an API URL.");
  const payload = await postJson(stored.baseUrl, {
    apiKey: key,
    senderId: stored.senderId,
    to,
    message,
  });
  if (payload.ok === false || payload.success === false) {
    throw new BadRequestException(text(payload.message) || "The gateway did not send the SMS.");
  }
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const raw = await response.text();
    const parsed = parseJson(raw);
    if (!response.ok && !parsed.error && !parsed.msg) {
      throw new BadRequestException("The SMS gateway did not respond.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException("Could not reach the SMS gateway.");
  }
}

async function postForm(url: string, body: URLSearchParams) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    return parseJson(await response.text());
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException("Could not reach the SMS gateway.");
  }
}

async function postJson(url: string, body: Record<string, string>) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    return parseJson(await response.text());
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException("Could not reach the SMS gateway.");
  }
}

function parseJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return asRecord(parsed);
  } catch {
    return { msg: raw.slice(0, 180) };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean).join(", ");
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
