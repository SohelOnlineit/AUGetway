"use client";

import { useEffect, useRef, useState } from "react";
import type { PaginatedResult, PublicProductSummary } from "@amarpin/types";
import { CATALOG_PAGE_SIZE } from "@/lib/catalog/product-page";
import { ProductGrid } from "./ProductGrid";

export function InfiniteProductGrid({
  products,
  total,
  query,
  emptyMessage,
  className,
}: {
  products: PublicProductSummary[];
  total: number;
  query: string;
  emptyMessage?: string;
  className?: string;
}) {
  const [items, setItems] = useState(products);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(products.length >= total);
  const sentinel = useRef<HTMLDivElement>(null);
  const pageRef = useRef(1);
  const loadingRef = useRef(false);

  useEffect(() => {
    setItems(products);
    setPage(1);
    pageRef.current = 1;
    setDone(products.length >= total);
    setLoading(false);
    loadingRef.current = false;
  }, [products, query, total]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || done) return;
    let cancelled = false;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || loadingRef.current || cancelled) return;
      void load();
    }, { rootMargin: "480px" });
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };

    async function load() {
      loadingRef.current = true;
      setLoading(true);
      const next = pageRef.current + 1;
      const params = new URLSearchParams(query);
      params.set("page", String(next));
      params.set("pageSize", String(CATALOG_PAGE_SIZE));
      try {
        const response = await fetch(`/api/products?${params.toString()}`);
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as PaginatedResult<PublicProductSummary>;
        pageRef.current = next;
        setPage(next);
        setItems((current) => {
          const seen = new Set(current.map((item) => item.id));
          const added = data.items.filter((item) => !seen.has(item.id));
          const merged = [...current, ...added];
          if (added.length === 0 || merged.length >= data.total) setDone(true);
          return merged;
        });
      } finally {
        if (!cancelled) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    }
  }, [done, page, query]);

  return (
    <div>
      <ProductGrid products={items} emptyMessage={emptyMessage} className={className} />
      {items.length > 0 && !done ? (
        <div ref={sentinel} className="catalog-more" aria-live="polite">
          {loading ? "Loading more products…" : ""}
        </div>
      ) : null}
    </div>
  );
}
