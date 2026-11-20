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

test("a typed transaction id still has to match the assigned unique amount", () => {
  assert.equal(paidFitsCheckout(100, 100.04, 100, 0, 0, "unique_amount"), false);
  assert.equal(paidFitsCheckout(100.04, 100.04, 100, 0, 0, "unique_amount"), true);
  assert.equal(paidFitsCheckout(100.03, 100.04, 100, 0, 0, "unique_amount"), false);
  assert.equal(paidFitsCheckout(99.99, 100, 100, 0, 0, "sender_number"), false);
  assert.equal(paidFitsCheckout(100, 100, 100, 0, 0, "sender_number"), true);
});

test("the invoice amount itself still has to be paid in full", () => {
  assert.equal(paidFitsCheckout(99.99, 100, 100, 0, 0, "transaction_id"), false);
  assert.equal(paidFitsCheckout(100, 100, 100, 0, 0, "transaction_id"), true);
  assert.equal(paidFitsCheckout(150, 100, 100, 0, 0, "transaction_id"), true);
});

test("the first checkout keeps the price and each next one adds one poisha", () => {
  assert.deepEqual(uniqueAmounts(100, "integer", 3), ["100.00", "100.01", "100.02", "100.03"]);
  assert.deepEqual(uniqueAmounts(100.4, "integer", 2), ["100.40", "100.41", "100.42"]);
  assert.deepEqual(uniqueAmounts(100, "decimal", 3), ["100.00", "100.01", "100.02", "100.03"]);
});

test("the next checkout takes the first amount that is not already reserved", () => {
  const taken = new Set(["100.00", "100.01"]);
  assert.equal(pickUniqueAmount(100, "integer", 3, taken), "100.02");
  assert.equal(pickUniqueAmount(100, "decimal", 1, new Set(["100.00"])), "100.01");
  assert.equal(pickUniqueAmount(100, "decimal", 1, new Set(["100.00", "100.01"])), "");
});
