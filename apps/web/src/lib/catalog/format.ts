/** Pure helpers — safe for client components without pulling in server-only catalog fetch. */
export function formatPrice(minor: number, currency = "BDT") {
  const major = minor / 100;
  return `${currency} ${major.toFixed(major % 1 === 0 ? 0 : 2)}`;
}
