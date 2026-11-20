import { randomUUID } from "node:crypto";
import { jsonFromUpstream, shopperFetch } from "@/lib/auth/shopper";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    idempotencyKey?: string;
    couponCode?: string;
    paymentMethod?: "gateway" | "wallet";
    originSource?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
  };
  const idempotencyKey = body.idempotencyKey?.trim() || randomUUID();
  const { upstream, setGuestToken } = await shopperFetch(
    "/checkout",
    {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify({
        idempotencyKey,
        couponCode: body.couponCode?.trim() || undefined,
        paymentMethod: body.paymentMethod === "wallet" ? "wallet" : "gateway",
        originSource: body.originSource,
        contactName: body.contactName?.trim() || undefined,
        contactPhone: body.contactPhone?.trim() || undefined,
        contactEmail: body.contactEmail?.trim() || undefined,
      }),
    },
    { createGuest: true },
  );
  const payload = await upstream.json().catch(() => ({}));
  return jsonFromUpstream(upstream, payload, setGuestToken);
}
