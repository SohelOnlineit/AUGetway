/**
 * Deterministic minor-unit discount.
 * PERCENT uses integer percent and floor division (no float).
 * FIXED never exceeds the eligible subtotal.
 * Result is always >= 0 and <= eligibleSubtotalMinor.
 */
export function computeDiscountMinor(input: {
  discountType: "PERCENT" | "FIXED";
  percent: number | null;
  amountMinor: number | null;
  eligibleSubtotalMinor: number;
}): number {
  const base = Math.max(0, Math.trunc(input.eligibleSubtotalMinor));
  if (base === 0) return 0;

  if (input.discountType === "PERCENT") {
    const percent = input.percent ?? 0;
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) return 0;
    return Math.floor((base * percent) / 100);
  }

  const amount = Math.max(0, Math.trunc(input.amountMinor ?? 0));
  return Math.min(amount, base);
}
