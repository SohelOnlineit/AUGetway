import assert from "node:assert/strict";
import test from "node:test";
import { paidFitsCheckout } from "./amount-window.ts";

test("a unique amount still verifies when the customer pays 1 to 4 poisha less", () => {
  assert.equal(paidFitsCheckout(100, 100.04, 100, 0, 0, "unique_amount"), true);
  assert.equal(paidFitsCheckout(100.03, 100.04, 100, 0, 0, "unique_amount"), true);
  assert.equal(paidFitsCheckout(100.01, 100.02, 100, 0, 0, "unique_amount"), true);
  assert.equal(paidFitsCheckout(100, 100.01, 100, 0, 0, "unique_amount"), true);
});

test("a unique amount does not verify below the invoice or more than 4 poisha short", () => {
  assert.equal(paidFitsCheckout(99.99, 100.04, 100, 0, 0, "unique_amount"), false);
  assert.equal(paidFitsCheckout(99.97, 100.01, 100, 0, 0, "unique_amount"), false);
  assert.equal(paidFitsCheckout(100, 100.05, 100, 0, 0, "unique_amount"), false);
  assert.equal(paidFitsCheckout(100.01, 100.05, 100, 0, 0, "unique_amount"), true);
});

test("the invoice amount itself still has to be paid in full", () => {
  assert.equal(paidFitsCheckout(99.99, 100, 100, 0, 0, "unique_amount"), false);
  assert.equal(paidFitsCheckout(99.99, 100, 100, 0, 0, "transaction_id"), false);
  assert.equal(paidFitsCheckout(100, 100, 100, 0, 0, "transaction_id"), true);
});
