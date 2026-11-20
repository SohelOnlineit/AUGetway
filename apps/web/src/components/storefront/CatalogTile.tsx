import type { PublicProductSummary } from "@amarpin/types";
import { ProductLink } from "@/components/storefront/ProductLink";

export function CatalogTile({ product }: { product: PublicProductSummary }) {
  return (
    <div className="catalog-tile">
      <ProductLink product={product} className="catalog-tile-hit">
        <div className="catalog-tile-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.primaryImage?.url ?? "/placeholders/product.svg"}
            alt={product.primaryImage?.alt?.trim() || product.title}
            loading="lazy"
            decoding="async"
          />
        </div>
        <h3>
          <span>{product.title}</span>
        </h3>
      </ProductLink>
    </div>
  );
}
