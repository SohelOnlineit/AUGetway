import { permanentRedirect } from "next/navigation";
import { productPublicPath } from "@/lib/catalog/paths";

/** Older /product/slug links stay working and land on /slug. */
export default async function LegacyProductRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const raw = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value) query.set(key, value);
  }
  const suffix = query.toString();
  permanentRedirect(`${productPublicPath(slug)}${suffix ? `?${suffix}` : ""}`);
}
