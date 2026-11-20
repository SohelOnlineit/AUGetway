import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE } from "@/lib/auth/constants";
import { guestOrdersEnabled } from "@/lib/auth/guest-orders";
import { GUEST_COOKIE, jsonFromUpstream, shopperFetch, withGuestCookie } from "@/lib/auth/shopper";

const EMPTY_CART = {
  id: "guest",
  items: [],
  itemCount: 0,
  subtotalMinor: 0,
  currency: "BDT",
};

export async function GET() {
  const jar = await cookies();
  if (!jar.get(ACCESS_COOKIE)?.value && !jar.get(GUEST_COOKIE)?.value) {
    if (!(await guestOrdersEnabled())) {
      return NextResponse.json(
        { message: "Guest orders are turned off. Please sign in to place an order." },
        { status: 403 },
      );
    }
    return NextResponse.json(EMPTY_CART);
  }
  const { upstream, setGuestToken } = await shopperFetch("/cart");
  const payload = await upstream.json().catch(() => ({}));
  return jsonFromUpstream(upstream, payload, setGuestToken);
}

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

export async function POST(request: Request) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "") === "buy" ? "buy" : "cart";
  const returnPath = safeReturnPath(String(form.get("returnPath") ?? ""));
  const quantity = Math.min(20, Math.max(1, Number(form.get("quantity") ?? 1) || 1));
  const packageValueId = String(form.get("packageValueId") ?? "").trim();
  const customerInputs = [...form.entries()]
    .filter(([key]) => key.startsWith("customerInput:"))
    .map(([key, value]) => ({ id: key.slice("customerInput:".length), value: String(value) }));
  const { upstream, setGuestToken } = await shopperFetch(
    "/cart/items",
    {
      method: "PUT",
      body: JSON.stringify({
        productId: String(form.get("productId") ?? ""),
        quantity,
        ...(packageValueId ? { packageValueId } : {}),
        ...(customerInputs.length ? { customerInputs } : {}),
      }),
    },
    { createGuest: true },
  );
  const payload = (await upstream.json().catch(() => ({}))) as { message?: string | string[] };
  if (upstream.status === 401 || upstream.status === 403) {
    return withGuestCookie(
      redirectTo(`/login?next=${encodeURIComponent(returnPath)}`),
      setGuestToken,
      false,
    );
  }
  if (!upstream.ok) {
    const message = Array.isArray(payload.message) ? payload.message[0] : payload.message;
    const back = new URL(returnPath, "http://localhost");
    back.searchParams.set("cartError", (message || "Could not add to cart").slice(0, 160));
    return withGuestCookie(redirectTo(`${back.pathname}${back.search}`), setGuestToken, false);
  }
  return withGuestCookie(redirectTo(intent === "buy" ? "/checkout" : "/cart"), setGuestToken, true);
}

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { location: path } });
}

function safeReturnPath(value: string) {
  const trimmed = value.trim();
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("\\") &&
    !trimmed.includes("\n") &&
    !trimmed.includes("\r")
  ) {
    return trimmed;
  }
  return "/";
}
