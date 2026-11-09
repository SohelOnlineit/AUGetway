const UNIQUE_SHORTFALL_CENTS = 4;

function cents(value: number) {
  return Math.round(value * 100);
}

export function paidFitsCheckout(paid: number, expected: number, base: number, under: number, over: number, verifyBy: string) {
  const expectedCents = cents(expected);
  const baseCents = cents(base);
  const underCents = Math.max(0, cents(under));
  const overCents = Math.max(0, cents(over));
  const paidCents = cents(paid);
  const anchor = verifyBy === "unique_amount" && expectedCents > baseCents
    ? Math.max(baseCents, expectedCents - UNIQUE_SHORTFALL_CENTS)
    : expectedCents;
  const floor = Math.max(0, anchor - underCents);
  const cap = overCents > 0 ? expectedCents + overCents : verifyBy === "unique_amount" ? expectedCents : Number.POSITIVE_INFINITY;
  return paidCents >= floor && paidCents <= cap;
}
