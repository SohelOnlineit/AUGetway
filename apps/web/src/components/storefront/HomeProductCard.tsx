import type { PublicProductSummary } from "@amarpin/types";
import { CatalogTile } from "@/components/storefront/CatalogTile";

export function HomeProductCard({ product }: { product: PublicProductSummary }) {
  return <CatalogTile product={product} />;
}
