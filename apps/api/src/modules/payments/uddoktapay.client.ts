import { BadRequestException, Injectable } from "@nestjs/common";

export type UddoktaCheckoutInput = {
  baseUrl: string;
  apiKey: string;
  amountMinor: number;
  fullName: string;
  email: string;
  orderId: string;
  redirectUrl: string;
  cancelUrl: string;
  webhookUrl: string;
};

export type UddoktaCheckoutResult = {
  paymentUrl: string;
  invoiceId: string | null;
};

export type UddoktaVerifyResult = {
  status: "succeeded" | "failed" | "pending";
  amountMinor: number | null;
  orderId: string | null;
  invoiceId: string | null;
  paymentMethod: string | null;
  transactionId: string | null;
};

@Injectable()
export class UddoktapayClient {
  async createCheckout(input: UddoktaCheckoutInput): Promise<UddoktaCheckoutResult> {
    const json = payloadOf(await this.post(input.baseUrl, "/api/checkout-v2", input.apiKey, {
      full_name: input.fullName.trim() || "Customer",
      email: gatewayEmail(input.email),
      amount: input.amountMinor / 100,
      metadata: { orderId: input.orderId },
      redirect_url: input.redirectUrl,
      cancel_url: input.cancelUrl,
      webhook_url: input.webhookUrl,
    }));
    const paymentUrl = firstString(json, ["payment_url", "paymentUrl", "url"]);
    if (!paymentUrl) {
      throw new BadRequestException("Uddokta Pay did not return a checkout link");
    }
    return {
      paymentUrl,
      invoiceId: firstString(json, ["invoice_id", "invoiceId"]) ?? invoiceIdFromPaymentUrl(paymentUrl),
    };
  }

  async verify(baseUrl: string, apiKey: string, invoiceId: string): Promise<UddoktaVerifyResult> {
    const json = payloadOf(await this.post(baseUrl, "/api/verify-payment", apiKey, {
      invoice_id: invoiceId,
    }));
    const statusText = readStatus(json);
    const amount = readAmount(json.amount);
    const metadata = readMetadata(json.metadata);
    const facts = readPaymentFacts(json);
    return {
      status: mapStatus(statusText),
      amountMinor: amount,
      orderId: metadata.orderId ?? null,
      invoiceId: firstString(json, ["invoice_id", "invoiceId"]) ?? invoiceId,
      paymentMethod: facts.paymentMethod,
      transactionId: facts.transactionId,
    };
  }

  private async post(
    baseUrl: string,
    path: string,
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const root = baseUrl.replace(/\/+$/, "");
    let response: Response;
    try {
      response = await fetch(`${root}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "RT-UDDOKTAPAY-API-KEY": apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new BadRequestException("Uddokta Pay could not be reached");
    }
    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !json || json.status === false) {
      throw new BadRequestException(uddoktaRejection(json, response.status));
    }
    return json;
  }
}

export function invoiceIdFromPaymentUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const fromQuery = usableInvoice(
      parsed.searchParams.get("invoice_id")
      || parsed.searchParams.get("invoiceId")
      || parsed.searchParams.get("invoice"),
    );
    if (fromQuery) return fromQuery;
    const part = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    // The checkout link ends in a session token. The invoice id arrives later on the return URL.
    if (/^[a-f0-9]{32,}$/i.test(part)) return null;
    return usableInvoice(part);
  } catch {
    return null;
  }
}

function gatewayEmail(email: string): string {
  const value = email.trim().toLowerCase();
  const usable = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value)
    && !value.endsWith(".invalid")
    && !value.endsWith(".test")
    && !value.endsWith(".local");
  return usable ? value : "customer@amarpin.com";
}

function uddoktaRejection(json: Record<string, unknown> | null, status: number): string {
  const parts: string[] = [];
  if (json && typeof json.message === "string" && json.message.trim()) parts.push(json.message.trim());
  const errors = json?.errors;
  if (errors && typeof errors === "object") {
    for (const value of Object.values(errors)) {
      if (typeof value === "string" && value.trim()) parts.push(value.trim());
      if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) parts.push(value[0].trim());
    }
  }
  const message = parts.join(" ").slice(0, 180);
  if (!message || /api[_ -]?key|secret|bearer /i.test(message)) {
    return `Uddokta Pay rejected the request (${status})`;
  }
  return message;
}

function usableInvoice(value: string | null | undefined): string | null {
  const id = value?.trim() ?? "";
  if (id.length < 8 || id.length > 80) return null;
  if (/^(checkout|payment|pay|api|invoice|success|cancel)$/i.test(id)) return null;
  return id;
}

function payloadOf(json: Record<string, unknown>): Record<string, unknown> {
  const data = json.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return { ...json, ...(data as Record<string, unknown>) };
  }
  return json;
}

function firstString(json: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = json[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readStatus(json: Record<string, unknown>): string {
  if (typeof json.status === "string") return json.status;
  for (const key of ["payment_status", "transactionStatus", "transaction_status"]) {
    const value = json[key];
    if (typeof value === "string") return value;
  }
  return "pending";
}

function readAmount(value: unknown): number | null {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

function readMetadata(value: unknown): { orderId?: string } {
  if (typeof value === "string") {
    try {
      return readMetadata(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object") return {};
  const record = value as { orderId?: unknown; order_id?: unknown };
  const orderId = typeof record.orderId === "string" ? record.orderId : record.order_id;
  return typeof orderId === "string" ? { orderId } : {};
}

const TRANSACTION_KEYS = new Set([
  "transaction_id",
  "transactionid",
  "trx_id",
  "trxid",
  "bkash_trx_id",
  "txn_id",
  "trxn_id",
]);

const METHOD_KEYS = new Set([
  "payment_method",
  "paymentmethod",
  "gateway",
  "gateway_name",
  "gatewayname",
]);

export function readPaymentFacts(value: unknown): { paymentMethod: string | null; transactionId: string | null } {
  const found = { paymentMethod: null as string | null, transactionId: null as string | null };
  walkPaymentFacts(value, found, 0);
  return found;
}

function walkPaymentFacts(
  value: unknown,
  found: { paymentMethod: string | null; transactionId: string | null },
  depth: number,
): void {
  if (!value || depth > 5) return;
  if (Array.isArray(value)) {
    for (const item of value) walkPaymentFacts(item, found, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const name = key.toLowerCase().replace(/[\s-]/g, "_");
    const text = typeof raw === "string" ? raw.trim() : typeof raw === "number" && Number.isFinite(raw) ? String(raw) : "";
    if (text && !found.transactionId && TRANSACTION_KEYS.has(name)) found.transactionId = text;
    if (text && !found.paymentMethod && METHOD_KEYS.has(name)) {
      const method = normalizePaymentMethod(text);
      if (method) found.paymentMethod = method;
    }
    if (typeof raw === "string" && (raw.startsWith("{") || raw.startsWith("["))) {
      try {
        walkPaymentFacts(JSON.parse(raw), found, depth + 1);
      } catch {
        // Not JSON.
      }
    }
    if (raw && typeof raw === "object") walkPaymentFacts(raw, found, depth + 1);
  }
}

export function paymentMethodLabel(value: string | null | undefined): string | null {
  const key = value?.trim().toLowerCase() ?? "";
  if (key.includes("bkash") || key.includes("বিকাশ")) return "bKash";
  if (key.includes("nagad") || key.includes("নগদ")) return "Nagad";
  if (key.includes("rocket") || key.includes("রকেট")) return "Rocket";
  if (key.includes("upay")) return "Upay";
  return null;
}

function normalizePaymentMethod(value: string | null): string | null {
  const key = value?.trim().toLowerCase() ?? "";
  if (key.includes("bkash") || value?.includes("বিকাশ")) return "bkash";
  if (key.includes("nagad") || value?.includes("নগদ")) return "nagad";
  if (key.includes("rocket") || value?.includes("রকেট")) return "rocket";
  if (key.includes("upay")) return "upay";
  return null;
}

function mapStatus(value: string): "succeeded" | "failed" | "pending" {
  const normalized = value.trim().toLowerCase();
  if (["completed", "complete", "success", "succeeded", "paid", "approved"].includes(normalized)) {
    return "succeeded";
  }
  if (["failed", "failure", "cancelled", "canceled", "declined", "error"].includes(normalized)) {
    return "failed";
  }
  return "pending";
}
