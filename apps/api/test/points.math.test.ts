import assert from "node:assert/strict";
import test from "node:test";
import { pointsAfterDiscount, pointsAfterRefund, pointsForLine, pointsValueMinor } from "../src/modules/points/points.math.ts";

test("each product earns points from its own taka rule", () => {
  assert.equal(pointsForLine(25_000, 10_000, 5), 13);
  assert.equal(pointsForLine(9_999, 10_000, 5), 5);
  assert.equal(pointsForLine(10_000, 0, 5), 0);
  assert.equal(pointsForLine(10_000, 10_000, 0), 0);
});

test("a refund gives back the matching share of points", () => {
  assert.equal(pointsAfterRefund(10, 25_000, 0), 10);
  assert.equal(pointsAfterRefund(10, 25_000, 12_500), 5);
  assert.equal(pointsAfterRefund(10, 25_000, 25_000), 0);
  assert.equal(pointsAfterRefund(2_000_000_000, 2_000_000_000, 1_000_000_000), 1_000_000_000);
});

test("a coupon only earns points on the money that was paid", () => {
  assert.equal(pointsAfterDiscount(10, 10_000, 10_000), 10);
  assert.equal(pointsAfterDiscount(10, 10_000, 5_000), 5);
  assert.equal(pointsAfterDiscount(10, 10_000, 0), 0);
});

test("the customer receives the points entered for the taka entered", () => {
  assert.equal(pointsForLine(100, 100, 1), 1);
  assert.equal(pointsForLine(1_000, 1_000, 1), 1);
  assert.equal(pointsForLine(2_000, 1_000, 1), 2);
  assert.equal(pointsForLine(30_000, 30_000, 10), 10);
  assert.equal(pointsForLine(50_000, 50_000, 10), 10);
  assert.equal(pointsForLine(4_900, 5_000, 10), 10);
  assert.equal(pointsForLine(2_500, 5_000, 10), 5);
  assert.equal(pointsForLine(100, 5_000, 10), 1);
});

test("every 10 points are worth 1 taka", () => {
  assert.equal(pointsValueMinor(1), 10);
  assert.equal(pointsValueMinor(10), 100);
  assert.equal(pointsValueMinor(100), 1_000);
  assert.equal(pointsValueMinor(0), 0);
});

test("a tiny spend rule cannot mint an unsafe point total", () => {
  assert.equal(pointsForLine(50_000_000, 1, 1_000_000), 2_000_000_000);
});
