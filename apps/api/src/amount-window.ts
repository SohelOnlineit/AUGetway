/** Extra taka above the product price that still counts as a successful payment. */
export const PRICE_EXTRA_TAKA = 10;

export function toPoisha(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const poisha = Math.round(value * 100);
  if (!Number.isSafeInteger(poisha)) return null;
  return poisha;
}

/**
 * Succeeds for the product price, or for more money up to 10 taka.
 * One poisha below the price does not succeed.
 * The method's saved under/over fields are not used: a short payment must never pass.
 */
export function paidCoversPrice(paid: number, price: number): boolean {
  const pricePoisha = toPoisha(price);
  const paidPoisha = toPoisha(paid);
  if (pricePoisha === null || paidPoisha === null || pricePoisha < 1 || paidPoisha < 1) return false;
  const extra = paidPoisha - pricePoisha;
  return extra >= 0 && extra <= PRICE_EXTRA_TAKA * 100;
}

export function paidFitsCheckout(paid: number, expected: number, _base: number, _under: number, _over: number, _verifyBy: string) {
  return paidCoversPrice(paid, expected);
}
