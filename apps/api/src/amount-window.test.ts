import assert from "node:assert/strict";
import test from "node:test";
import { paidFitsCheckout } from "./amount-window.ts";

test("a transaction id payment can be the invoice amount or more when no over limit is set", () => {
  assert.equal(paidFitsCheckout(99.99, 100, 100, 0, 0, "transaction_id"), false);
  assert.equal(paidFitsCheckout(100, 100, 100, 0, 0, "transaction_id"), true);
  assert.equal(paidFitsCheckout(150, 100, 100, 0, 0, "transaction_id"), true);
});

test("an over limit caps how much extra the SMS may show", () => {
  assert.equal(paidFitsCheckout(100, 100, 100, 0, 1, "transaction_id"), true);
  assert.equal(paidFitsCheckout(101, 100, 100, 0, 1, "transaction_id"), true);
  assert.equal(paidFitsCheckout(101.01, 100, 100, 0, 1, "transaction_id"), false);
});
