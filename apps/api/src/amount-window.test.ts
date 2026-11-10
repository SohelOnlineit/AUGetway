import assert from "node:assert/strict";
import test from "node:test";
import { paidFitsCheckout, pickUniqueAmount, uniqueAmounts } from "./amount-window.ts";

test("a unique amount verifies only the exact assigned amount", () => {
  assert.equal(paidFitsCheckout(100.04, 100.04, 100, 0, 0, "unique_amount"), true);
  assert.equal(paidFitsCheckout(101, 101, 100, 0, 0, "unique_amount"), true);
  assert.equal(paidFitsCheckout(100, 100.04, 100, 0, 0, "unique_amount"), false);
  assert.equal(paidFitsCheckout(100.03, 100.04, 100, 0, 0, "unique_amount"), false);
  assert.equal(paidFitsCheckout(99.99, 100, 100, 0, 0, "unique_amount"), false);
});

test("the invoice amount itself still has to be paid in full", () => {
  assert.equal(paidFitsCheckout(99.99, 100, 100, 0, 0, "transaction_id"), false);
  assert.equal(paidFitsCheckout(100, 100, 100, 0, 0, "transaction_id"), true);
  assert.equal(paidFitsCheckout(150, 100, 100, 0, 0, "transaction_id"), true);
});

test("integer slots step by one taka and decimal slots step by one poisha", () => {
  assert.deepEqual(uniqueAmounts(100, "integer", 3), ["100.00", "101.00", "102.00", "103.00"]);
  assert.deepEqual(uniqueAmounts(100.4, "integer", 2), ["101.00", "102.00", "103.00"]);
  assert.deepEqual(uniqueAmounts(100, "decimal", 3), ["100.00", "100.01", "100.02", "100.03"]);
});

test("the next checkout takes the first amount that is not already reserved", () => {
  const taken = new Set(["100.00", "101.00"]);
  assert.equal(pickUniqueAmount(100, "integer", 3, taken), "102.00");
  assert.equal(pickUniqueAmount(100, "decimal", 1, new Set(["100.00"])), "100.01");
  assert.equal(pickUniqueAmount(100, "decimal", 1, new Set(["100.00", "100.01"])), "");
});
