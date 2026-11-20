"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPresence, trackStorefrontEvent } from "@/lib/analytics/client";

const RESERVED_ROOT = new Set([
  "about",
  "admin",
  "blog",
  "brand",
  "cart",
  "category",
  "chat",
  "checkout",
  "contact",
  "dashboard",
  "disclaimers",
  "forgot-password",
  "login",
  "notifications",
  "orders",
  "privacy-policy",
  "product",
  "products",
  "profile",
  "refund-and-returns-policy",
  "refunds",
  "register",
  "reviews",
  "request-product",
  "reset-password",
  "search",
  "settings",
  "terms-conditions",
  "tickets",
  "verify-email",
  "wallet",
  "wishlist",
]);

/** Tracks allowlisted page_view events for public storefront paths only. */
export function StorefrontAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/api")
    ) {
      return;
    }
    trackStorefrontEvent({ name: "page_view", path: pathname });
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length === 1 && parts[0] && !RESERVED_ROOT.has(parts[0])) {
      trackStorefrontEvent({
        name: "product_view",
        path: pathname,
        entityType: "product_slug",
        entityId: parts[0],
      });
    }
    if (pathname.startsWith("/search")) {
      trackStorefrontEvent({ name: "search", path: pathname });
    }
  }, [pathname]);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || pathname.startsWith("/dashboard") || pathname.startsWith("/login")) {
      return;
    }
    const send = () => {
      if (document.visibilityState === "hidden") return;
      trackPresence();
    };
    send();
    const timer = window.setInterval(send, 20_000);
    document.addEventListener("visibilitychange", send);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", send);
    };
  }, [pathname]);

  return null;
}
