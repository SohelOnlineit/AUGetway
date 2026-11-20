import type { ReactNode } from "react";
import { buildNoIndexMetadata } from "@/lib/catalog/seo";

export const metadata = buildNoIndexMetadata({
  title: "Checkout — AuGetway",
  path: "/checkout",
});

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return children;
}
