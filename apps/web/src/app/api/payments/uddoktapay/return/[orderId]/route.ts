import { getApiBaseUrl } from "@/lib/auth/api-base";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function capture(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;
  const url = new URL(request.url);
  const body = await readBody(request);
  const invoiceId =
    text(body.invoice_id)
    || text(body.invoiceId)
    || url.searchParams.get("invoice_id")
    || url.searchParams.get("invoiceId")
    || "";
  if (invoiceId) {
    await fetch(`${getApiBaseUrl()}/payments/webhooks/uddoktapay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...body,
        invoice_id: invoiceId,
        metadata: {
          ...(body.metadata && typeof body.metadata === "object" ? body.metadata as Record<string, unknown> : {}),
          orderId,
        },
      }),
      cache: "no-store",
    }).catch(() => null);
  }
  return NextResponse.redirect(new URL(`/orders/${orderId}`, url.origin), 303);
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const raw = await request.text();
  if (!raw.trim()) return {};
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export const GET = capture;
export const POST = capture;
