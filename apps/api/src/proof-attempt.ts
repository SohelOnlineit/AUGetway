/** A transaction id that does not match the payment can be submitted on the third try, and then the order stays pending. */
export function unmatchedAttempt(tries: number): "retry" | "pending" {
  return tries >= 3 ? "pending" : "retry";
}

export function attemptsLeft(tries: number) {
  return Math.max(0, 3 - tries);
}
