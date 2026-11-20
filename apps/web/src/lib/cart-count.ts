export const CART_COUNT_EVENT = "uq-cart-count";

export function publishCartCount(count: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CART_COUNT_EVENT, { detail: count }));
}
