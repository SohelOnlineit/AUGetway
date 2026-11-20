import { proxyCatalogGet } from "@/lib/catalog/public-proxy";

export function GET(request: Request) {
  return proxyCatalogGet(request, "/brands");
}
