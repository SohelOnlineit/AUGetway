/** Extra taka above the product price that still counts as a successful payment. */
export const PRICE_EXTRA_TAKA = 10;

export function toPoisha(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const poisha = Math.round(value * 100);
  if (!Number.isSafeInteger(poisha)) return null;
  return poisha;
}

/**
 * Succeeds for the product price, or for more money up to extraTaka.
 * One poisha below the price does not succeed. extraTaka comes from the gateway page.
 */
export function paidCoversPrice(paid: number, price: number, extraTaka = PRICE_EXTRA_TAKA): boolean {
  const pricePoisha = toPoisha(price);
  const paidPoisha = toPoisha(paid);
  const capPoisha = toPoisha(extraTaka);
  if (pricePoisha === null || paidPoisha === null || capPoisha === null) return false;
  if (pricePoisha < 1 || paidPoisha < 1 || capPoisha < 0) return false;
  const extra = paidPoisha - pricePoisha;
  return extra >= 0 && extra <= capPoisha;
}

export function paidFitsCheckout(paid: number, expected: number, _base: number, _under: number, over: number, _verifyBy: string) {
  return paidCoversPrice(paid, expected, over);
}
