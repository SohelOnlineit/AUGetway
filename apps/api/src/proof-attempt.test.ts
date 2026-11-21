import assert from "node:assert/strict";
import test from "node:test";
import { attemptsLeft, unmatchedAttempt } from "./proof-attempt.ts";

test("a transaction id that does not match can be submitted on the third try", () => {
  assert.equal(unmatchedAttempt(1), "retry");
  assert.equal(unmatchedAttempt(2), "retry");
  assert.equal(unmatchedAttempt(3), "pending");
  assert.equal(attemptsLeft(1), 2);
  assert.equal(attemptsLeft(2), 1);
  assert.equal(attemptsLeft(3), 0);
});
