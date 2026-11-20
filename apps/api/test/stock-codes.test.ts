import assert from "node:assert/strict";
import test from "node:test";
import { splitStockCodes } from "../src/modules/admin/stock-codes.ts";

test("a code already in stock is not added again", () => {
  const split = splitStockCodes(["CARD-100"], ["CARD-100", "CARD-200", "CARD-100"]);
  assert.deepEqual(split.fresh, ["CARD-200"]);
  assert.deepEqual(split.duplicates, ["CARD-100"]);
});

test("the same new code is kept once", () => {
  const split = splitStockCodes([], ["NEW-1", "NEW-1", "  NEW-2  "]);
  assert.deepEqual(split.fresh, ["NEW-1", "NEW-2"]);
  assert.deepEqual(split.duplicates, ["NEW-1"]);
});
