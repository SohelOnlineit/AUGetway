import { jsonFromUpstream, shopperFetch } from "@/lib/auth/shopper";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { upstream, setGuestToken } = await shopperFetch(`/orders/${id}`);
  const payload = await upstream.json().catch(() => ({}));
  return jsonFromUpstream(upstream, payload, setGuestToken);
}
