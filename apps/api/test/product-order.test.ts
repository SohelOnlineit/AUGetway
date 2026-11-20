import assert from "node:assert/strict";
import test from "node:test";
import {
  EmptyProductOrderError,
  UnknownProductOrderError,
  mergeProductOrder,
} from "../src/modules/admin/product-order";

test("a full reorder matches the requested order and has unique positions", () => {
  const merged = mergeProductOrder(["A", "B", "C", "D"], ["D", "B", "A", "C"]);
  assert.deepEqual(merged.ids, ["D", "B", "A", "C"]);
  assert.equal(new Set(merged.ids).size, merged.ids.length);
  assert.equal(merged.count, 4);
});

test("a partial reorder keeps products that were not included", () => {
  const merged = mergeProductOrder(["A", "B", "C", "D", "E"], ["D", "B"]);
  assert.deepEqual(merged.ids, ["A", "D", "C", "B", "E"]);
  assert.equal(merged.count, 2);
  assert.equal(new Set(merged.ids.map((_, index) => index)).size, merged.ids.length);
});

test("duplicate and blank ids do not change the saved order twice", () => {
  const merged = mergeProductOrder(["A", "B", "C"], ["  B ", "B", "", "A"]);
  assert.deepEqual(merged.ids, ["B", "A", "C"]);
  assert.equal(merged.count, 2);
});

test("a missing id is rejected before any order is returned", () => {
  assert.throws(
    () => mergeProductOrder(["A", "B"], ["A", "missing"]),
    UnknownProductOrderError,
  );
});

test("an empty id list is rejected", () => {
  assert.throws(() => mergeProductOrder(["A"], [" ", ""]), EmptyProductOrderError);
});
