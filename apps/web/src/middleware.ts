import { NextResponse, type NextRequest } from "next/server";
import {
  ACCOUNT_PATH_PREFIX,
  ACCESS_COOKIE,
  STAFF_PATH_PREFIX,
} from "@/lib/auth/constants";
import { canAccessStaff, verifyAccessToken } from "@/lib/auth/session";

const PROTECTED_PREFIXES = [
  ACCOUNT_PATH_PREFIX,
  "/orders",
  "/refunds",
  "/tickets",
  "/chat",
  "/wallet",
  "/wishlist",
  "/profile",
  "/settings",
  "/notifications",
] as const;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/checkout/pay/")) {
    const invoiceId = request.nextUrl.searchParams.get("invoice_id") || request.nextUrl.searchParams.get("invoiceId");
    if (request.method === "POST" || invoiceId) {
      const orderId = pathname.split("/").filter(Boolean).pop();
      const url = request.nextUrl.clone();
      url.pathname = `/api/payments/uddoktapay/return/${orderId}`;
      return NextResponse.rewrite(url);
    }
  }
  const needsStaff =
    pathname === STAFF_PATH_PREFIX || pathname.startsWith(`${STAFF_PATH_PREFIX}/`);
  const needsAccount = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!needsStaff && !needsAccount) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  const claims = await verifyAccessToken(token);
  if (!claims) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    const response = NextResponse.redirect(login);
    response.cookies.set(ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  }

  if (needsStaff && !canAccessStaff(claims.roles)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/checkout/pay/:path*",
    "/admin",
    "/admin/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/orders",
    "/orders/:path*",
    "/refunds",
    "/refunds/:path*",
    "/tickets",
    "/tickets/:path*",
    "/chat",
    "/chat/:path*",
    "/wallet",
    "/wallet/:path*",
    "/wishlist",
    "/wishlist/:path*",
    "/profile",
    "/profile/:path*",
    "/settings",
    "/settings/:path*",
    "/notifications",
    "/notifications/:path*",
  ],
};
