import { jsonFromUpstream, shopperFetch } from "@/lib/auth/shopper";

export async function PUT(request: Request) {
  const body = await request.text();
  const { upstream, setGuestToken } = await shopperFetch(
    "/cart/items",
    { method: "PUT", body },
    { createGuest: true },
  );
  const payload = await upstream.json().catch(() => ({}));
  return jsonFromUpstream(upstream, payload, setGuestToken);
}
