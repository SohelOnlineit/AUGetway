import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { CryptoService } from "../../shared/crypto/crypto.service";

const SETTINGS_KEY = "payment.gateway.uddoktapay";

type StoredGateway = {
  enabled: boolean;
  sandbox: boolean;
  baseUrl: string;
  apiKeyEnc: string | null;
  webhookSecretEnc: string | null;
};

export type UddoktaPayAdminView = {
  id: "uddoktapay";
  label: "Uddokta Pay";
  hint: string;
  enabled: boolean;
  sandbox: boolean;
  baseUrl: string;
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  configured: boolean;
  mode: "live" | "sandbox" | "disabled";
};

export type UddoktaPayRuntime = UddoktaPayAdminView & {
  apiKey: string | null;
  webhookSecret: string | null;
};

const HINT =
  "Aggregator for bKash, Nagad, Rocket, and Upay. Use the merchant base URL and API key from your Uddokta Pay panel.";

@Injectable()
export class PaymentGatewaySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  async getAdmin(): Promise<UddoktaPayAdminView> {
    const runtime = await this.load();
    return this.toAdmin(runtime);
  }

  async getRuntime(): Promise<UddoktaPayRuntime> {
    return this.load();
  }

  async update(input: {
    enabled: boolean;
    sandbox: boolean;
    baseUrl: string;
    apiKey?: string;
    webhookSecret?: string;
  }): Promise<UddoktaPayAdminView> {
    const current = await this.readStored();
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const next: StoredGateway = {
      enabled: input.enabled,
      sandbox: input.sandbox,
      baseUrl,
      apiKeyEnc: this.keepOrEncrypt(input.apiKey, current?.apiKeyEnc ?? null),
      webhookSecretEnc: this.keepOrEncrypt(input.webhookSecret, current?.webhookSecretEnc ?? null),
    };
    if (next.enabled && !next.sandbox && (!next.baseUrl || !next.apiKeyEnc)) {
      throw new BadRequestException("Live mode needs a base URL and API key");
    }
    await this.prisma.systemMeta.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    });
    return this.toAdmin(await this.load());
  }

  private async load(): Promise<UddoktaPayRuntime> {
    const stored = await this.readStored();
    const apiKey = decryptOrNull(this.crypto, stored?.apiKeyEnc ?? null);
    const webhookSecret = decryptOrNull(this.crypto, stored?.webhookSecretEnc ?? null);
    const baseUrl = stored?.baseUrl?.trim() ?? "";
    const enabled = stored?.enabled === true;
    const sandbox = stored?.sandbox === true;
    const configured = Boolean(baseUrl && apiKey);
    const mode: UddoktaPayAdminView["mode"] = !enabled
      ? "disabled"
      : sandbox
        ? "sandbox"
        : configured
          ? "live"
          : "disabled";
    return {
      id: "uddoktapay",
      label: "Uddokta Pay",
      hint: HINT,
      enabled,
      sandbox,
      baseUrl,
      hasApiKey: Boolean(apiKey),
      hasWebhookSecret: Boolean(webhookSecret),
      configured,
      mode,
      apiKey,
      webhookSecret,
    };
  }

  private toAdmin(runtime: UddoktaPayRuntime): UddoktaPayAdminView {
    const { apiKey: _apiKey, webhookSecret: _webhookSecret, ...view } = runtime;
    return view;
  }

  callbackBase(): string {
    const raw = this.config.get<string>("app.apiPublicUrl") ?? "http://localhost:4000/api";
    return raw.replace(/\/+$/, "");
  }

  appBase(): string {
    const raw = this.config.get<string>("app.appPublicUrl") ?? "http://localhost:3000";
    return raw.replace(/\/+$/, "");
  }

  private keepOrEncrypt(next: string | undefined, currentEnc: string | null): string | null {
    const trimmed = next?.trim() ?? "";
    if (!trimmed) return currentEnc;
    return this.crypto.encryptSecret(trimmed);
  }

  private async readStored(): Promise<StoredGateway | null> {
    const row = await this.prisma.systemMeta.findUnique({ where: { key: SETTINGS_KEY } });
    if (!row?.value) return null;
    try {
      const parsed = JSON.parse(row.value) as Partial<StoredGateway>;
      return {
        enabled: parsed.enabled === true,
        sandbox: parsed.sandbox === true,
        baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
        apiKeyEnc: typeof parsed.apiKeyEnc === "string" ? parsed.apiKeyEnc : null,
        webhookSecretEnc:
          typeof parsed.webhookSecretEnc === "string" ? parsed.webhookSecretEnc : null,
      };
    } catch {
      return null;
    }
  }
}

function decryptOrNull(crypto: CryptoService, payload: string | null): string | null {
  if (!payload) return null;
  if (!payload.includes(":")) return null;
  try {
    return crypto.decryptSecret(payload);
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new BadRequestException("Base URL must be a valid http(s) address");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BadRequestException("Base URL must start with https://");
  }
  if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new BadRequestException("Base URL must start with https://");
  }
  return url.origin;
}
