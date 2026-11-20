import assert from "node:assert/strict";
import test from "node:test";
import { productDropIndex } from "./product-drop";

function drop(ids: string[], from: number, to: number) {
  const next = [...ids];
  const insertAt = productDropIndex(from, to);
  const [moved] = next.splice(from, 1);
  if (!moved) throw new Error("Missing dragged product");
  next.splice(insertAt, 0, moved);
  return next;
}

test("dragging down lands on the hovered product", () => {
  assert.equal(productDropIndex(0, 3), 2);
  assert.deepEqual(drop(["A", "B", "C", "D"], 0, 3), ["B", "C", "A", "D"]);
});

test("dragging up lands before the hovered product", () => {
  assert.equal(productDropIndex(3, 0), 0);
  assert.deepEqual(drop(["A", "B", "C", "D"], 3, 0), ["D", "A", "B", "C"]);
});

test("dropping on the next row does not skip past it", () => {
  assert.deepEqual(drop(["A", "B", "C"], 0, 1), ["A", "B", "C"]);
  assert.deepEqual(drop(["A", "B", "C"], 0, 2), ["B", "A", "C"]);
});
