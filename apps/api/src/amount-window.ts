function cents(value: number) {
  return Math.round(value * 100);
}

export function paidFitsCheckout(paid: number, expected: number, _base: number, under: number, over: number, _verifyBy: string) {
  const expectedCents = cents(expected);
  const underCents = Math.max(0, cents(under));
  const overCents = Math.max(0, cents(over));
  const paidCents = cents(paid);
  const floor = Math.max(0, expectedCents - underCents);
  const cap = overCents > 0 ? expectedCents + overCents : Number.POSITIVE_INFINITY;
  return paidCents >= floor && paidCents <= cap;
}
