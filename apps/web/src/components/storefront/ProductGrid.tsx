import type { PublicProductSummary } from "@amarpin/types";
import { ProductCard } from "./ProductCard";

export function ProductGrid({
  products,
  emptyMessage = "No published products found.",
  className = "",
}: {
  products: PublicProductSummary[];
  emptyMessage?: string;
  className?: string;
}) {
  if (products.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }
  return (
    <div className={className ? `product-grid ${className}` : "product-grid"}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
