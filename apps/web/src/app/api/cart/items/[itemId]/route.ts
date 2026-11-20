import { jsonFromUpstream, shopperFetch } from "@/lib/auth/shopper";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params;
  const body = await request.text();
  const { upstream, setGuestToken } = await shopperFetch(`/cart/items/${itemId}`, {
    method: "PATCH",
    body,
  });
  const payload = await upstream.json().catch(() => ({}));
  return jsonFromUpstream(upstream, payload, setGuestToken);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params;
  const { upstream, setGuestToken } = await shopperFetch(`/cart/items/${itemId}`, {
    method: "DELETE",
  });
  const payload = await upstream.json().catch(() => ({}));
  return jsonFromUpstream(upstream, payload, setGuestToken);
}
