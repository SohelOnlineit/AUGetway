import type { ReactNode } from "react";
import { buildNoIndexMetadata } from "@/lib/catalog/seo";

export const metadata = buildNoIndexMetadata({
  title: "Cart — AuGetway",
  path: "/cart",
});

export default function CartLayout({ children }: { children: ReactNode }) {
  return children;
}
