import { jsonFromUpstream, shopperFetch } from "@/lib/auth/shopper";

/**
 * BFF proxy for backend-only sandbox simulation.
 * Does not invent success — Nest decides after environment checks.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const { upstream, setGuestToken } = await shopperFetch("/payments/sandbox/confirm", {
    method: "POST",
    body,
  });
  const payload = await upstream.json().catch(() => ({}));
  return jsonFromUpstream(upstream, payload, setGuestToken);
}
