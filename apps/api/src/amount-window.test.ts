import assert from "node:assert/strict";
import test from "node:test";
import { paidCoversPrice, paidFitsCheckout } from "./amount-window.ts";

test("the exact product price succeeds and one poisha less does not", () => {
  assert.equal(paidCoversPrice(100, 100), true);
  assert.equal(paidCoversPrice(99.99, 100), false);
  assert.equal(paidCoversPrice(100.01, 100), true);
  assert.equal(paidFitsCheckout(99.99, 100, 100, 5, 0, "transaction_id"), false);
});

test("one taka through ten taka extra still succeeds, and more than ten does not", () => {
  assert.equal(paidCoversPrice(101, 100), true);
  assert.equal(paidCoversPrice(110, 100), true);
  assert.equal(paidCoversPrice(110.01, 100), false);
  assert.equal(paidCoversPrice(150, 100), false);
  assert.equal(paidFitsCheckout(110, 100, 100, 0, 1, "transaction_id"), true);
  assert.equal(paidFitsCheckout(110.01, 100, 100, 0, 1, "transaction_id"), false);
});
