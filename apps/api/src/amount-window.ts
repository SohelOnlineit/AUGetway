function cents(value: number) {
  return Math.round(value * 100);
}

export function paidFitsCheckout(paid: number, expected: number, _base: number, under: number, over: number, verifyBy: string) {
  const expectedCents = cents(expected);
  const underCents = Math.max(0, cents(under));
  const overCents = Math.max(0, cents(over));
  const paidCents = cents(paid);
  const floor = Math.max(0, expectedCents - underCents);
  const cap = overCents > 0 ? expectedCents + overCents : verifyBy === "unique_amount" ? expectedCents : Number.POSITIVE_INFINITY;
  return paidCents >= floor && paidCents <= cap;
}

export function uniqueAmounts(base: number, _kind: string, slots: number) {
  const start = cents(base);
  const room = Math.max(1, Math.min(499, Math.round(slots) || 1));
  const amounts: string[] = [];
  for (let index = 0; index <= room; index += 1) amounts.push(((start + index) / 100).toFixed(2));
  return amounts;
}

export function pickUniqueAmount(base: number, kind: string, slots: number, taken: Set<string>) {
  return uniqueAmounts(base, kind, slots).find((amount) => !taken.has(amount)) ?? "";
}
