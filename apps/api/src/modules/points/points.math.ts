/** Stay inside a signed 32-bit column, with a little room under the absolute max. */
export const MAX_POINTS = 2_000_000_000;

/** Poisha value of a point balance. 10 points = 100 poisha = 1 taka. */
export function pointsValueMinor(points: number): number {
  if (!Number.isInteger(points) || points <= 0) return 0;
  if (points > Math.floor(MAX_POINTS / 10)) return MAX_POINTS;
  return points * 10;
}

/**
 * Points for one order line. Spend and the line total are minor units.
 * A smaller spend earns the same share, rounded to the nearest point.
 * Any paid amount on a live rule earns at least 1 point.
 */
export function pointsForLine(lineTotalMinor: number, spendMinor: number, reward: number): number {
  if (!Number.isInteger(lineTotalMinor) || lineTotalMinor <= 0) return 0;
  if (!Number.isInteger(spendMinor) || spendMinor <= 0) return 0;
  if (!Number.isInteger(reward) || reward <= 0) return 0;
  const product = BigInt(lineTotalMinor) * BigInt(reward);
  const spend = BigInt(spendMinor);
  const rounded = Number((product + spend / 2n) / spend);
  if (!Number.isFinite(rounded) || rounded <= 0) return 1;
  return rounded > MAX_POINTS ? MAX_POINTS : rounded;
}

/** Scale list-price points down to the amount the customer actually paid. */
export function pointsAfterDiscount(points: number, subtotalMinor: number, totalMinor: number): number {
  if (!Number.isInteger(points) || points <= 0) return 0;
  if (!Number.isInteger(subtotalMinor) || subtotalMinor <= 0) return 0;
  if (!Number.isInteger(totalMinor) || totalMinor <= 0) return 0;
  if (totalMinor >= subtotalMinor) return Math.min(points, MAX_POINTS);
  const kept = (BigInt(points) * BigInt(totalMinor)) / BigInt(subtotalMinor);
  const asNumber = Number(kept);
  return asNumber > MAX_POINTS ? MAX_POINTS : asNumber;
}

/** Points kept after a refund. A full refund keeps none. */
export function pointsAfterRefund(earned: number, totalMinor: number, refundedMinor: number): number {
  if (!Number.isInteger(earned) || earned <= 0) return 0;
  if (!Number.isInteger(totalMinor) || totalMinor <= 0 || refundedMinor >= totalMinor) return 0;
  if (!Number.isInteger(refundedMinor) || refundedMinor <= 0) return earned;
  const kept = (BigInt(earned) * BigInt(totalMinor - refundedMinor)) / BigInt(totalMinor);
  const asNumber = Number(kept);
  return asNumber > MAX_POINTS ? MAX_POINTS : asNumber;
}
