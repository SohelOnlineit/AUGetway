import type { PublicProductSummary } from "@amarpin/types";
import { CatalogTile } from "@/components/storefront/CatalogTile";

export function ProductCard({ product }: { product: PublicProductSummary }) {
  return <CatalogTile product={product} />;
}
