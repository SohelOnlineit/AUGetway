import { proxyCatalogGet } from "@/lib/catalog/public-proxy";

export function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return context.params.then(({ slug }) =>
    proxyCatalogGet(request, `/products/${encodeURIComponent(slug)}/reviews`),
  );
}
