export const CATALOG_PAGE_SIZE = 18;

export function catalogQuery(
  raw: Record<string, string | string[] | undefined>,
  fixed?: Record<string, string>,
) {
  const rest = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (key === "page" || key === "pageSize") continue;
    if (typeof value === "string" && value) rest.set(key, value);
  }
  if (fixed) {
    for (const [key, value] of Object.entries(fixed)) rest.set(key, value);
  }
  const first = new URLSearchParams(rest);
  first.set("page", "1");
  first.set("pageSize", String(CATALOG_PAGE_SIZE));
  return { first, rest: rest.toString() };
}
