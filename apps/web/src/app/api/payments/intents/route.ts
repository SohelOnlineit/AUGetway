import { randomUUID } from "node:crypto";
import { jsonFromUpstream, shopperFetch } from "@/lib/auth/shopper";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    orderId?: string;
    idempotencyKey?: string;
  };
  const { upstream, setGuestToken } = await shopperFetch("/payments/intents", {
    method: "POST",
    body: JSON.stringify({
      orderId: body.orderId,
      idempotencyKey: body.idempotencyKey?.trim() || randomUUID(),
    }),
  });
  const payload = await upstream.json().catch(() => ({}));
  return jsonFromUpstream(upstream, payload, setGuestToken);
}
