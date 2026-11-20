/** Format a poisha amount. 100 poisha is 1 taka. */
export function formatTaka(minor: number): string {
  const taka = (Number.isFinite(minor) ? minor : 0) / 100;
  const text = Number.isInteger(taka)
    ? taka.toLocaleString("en-US")
    : taka.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `৳${text}`;
}

/** 10 points = 1 taka. */
export function formatPointsWorth(points: number): string {
  const whole = Math.max(0, Math.round(Number(points) || 0));
  return formatTaka(whole * 10);
}
