import { jsonFromUpstream, shopperFetch } from "@/lib/auth/shopper";

export async function POST(request: Request) {
  const body = await request.text();
  const { upstream, setGuestToken } = await shopperFetch("/payments/uddoktapay/verify", {
    method: "POST",
    body,
  });
  const payload = await upstream.json().catch(() => ({}));
  return jsonFromUpstream(upstream, payload, setGuestToken);
}
