import assert from "node:assert/strict";
import test from "node:test";
import { paidCoversPrice, paidFitsCheckout } from "./amount-window.ts";

test("the exact product price succeeds and one poisha less does not", () => {
  assert.equal(paidCoversPrice(100, 100, 10), true);
  assert.equal(paidCoversPrice(99.99, 100, 10), false);
  assert.equal(paidCoversPrice(100.01, 100, 10), true);
  assert.equal(paidFitsCheckout(99.99, 100, 100, 5, 10, "transaction_id"), false);
});

test("the gateway extra limit is the most a customer may pay over the price", () => {
  assert.equal(paidCoversPrice(110, 100, 10), true);
  assert.equal(paidCoversPrice(110.01, 100, 10), false);
  assert.equal(paidCoversPrice(105, 100, 5), true);
  assert.equal(paidCoversPrice(105.01, 100, 5), false);
  assert.equal(paidCoversPrice(100, 100, 0), true);
  assert.equal(paidCoversPrice(100.01, 100, 0), false);
  assert.equal(paidFitsCheckout(101, 100, 100, 0, 1, "transaction_id"), true);
  assert.equal(paidFitsCheckout(101.01, 100, 100, 0, 1, "transaction_id"), false);
});
