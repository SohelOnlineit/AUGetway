import assert from "node:assert/strict";
import test from "node:test";
import { planApiStockDelivery } from "../src/modules/orders/api-stock-order.ts";

const api = () => ({ priceMinor: 200, stockType: "api" });

test("a full API reserve is delivered on the matching package line", () => {
  const plan = planApiStockDelivery(
    [{ id: "line-2", productId: "itunes", quantity: 2, unitPriceMinor: 200 }],
    [
      { id: "code-a", productId: "itunes", packageValueId: "2" },
      { id: "code-b", productId: "itunes", packageValueId: "2" },
    ],
    api,
  );
  assert.equal(plan.action, "fulfill");
  if (plan.action !== "fulfill") return;
  assert.deepEqual(
    plan.deliver.map((row) => row.unitId),
    ["code-a", "code-b"],
  );
  assert.deepEqual(plan.release, []);
});

test("fewer reserved API codes still complete the order", () => {
  const plan = planApiStockDelivery(
    [{ id: "line-2", productId: "itunes", quantity: 2, unitPriceMinor: 200 }],
    [{ id: "code-a", productId: "itunes", packageValueId: "2" }],
    api,
  );
  assert.equal(plan.action, "fulfill");
  if (plan.action !== "fulfill") return;
  assert.equal(plan.deliver.length, 1);
  assert.deepEqual(plan.release, []);
});

test("codes past the ordered quantity are released instead of sold", () => {
  const plan = planApiStockDelivery(
    [{ id: "line-2", productId: "itunes", quantity: 2, unitPriceMinor: 200 }],
    [
      { id: "code-a", productId: "itunes", packageValueId: "2" },
      { id: "code-b", productId: "itunes", packageValueId: "2" },
      { id: "code-c", productId: "itunes", packageValueId: "2" },
    ],
    api,
  );
  assert.equal(plan.action, "fulfill");
  if (plan.action !== "fulfill") return;
  assert.equal(plan.deliver.length, 2);
  assert.deepEqual(plan.release, ["code-c"]);
});

test("two API packages of one product stay on their own price line", () => {
  const plan = planApiStockDelivery(
    [
      { id: "line-2", productId: "itunes", quantity: 1, unitPriceMinor: 200 },
      { id: "line-10", productId: "itunes", quantity: 1, unitPriceMinor: 1000 },
    ],
    [
      { id: "code-10", productId: "itunes", packageValueId: "10" },
      { id: "code-2", productId: "itunes", packageValueId: "2" },
    ],
    (_productId, packageValueId) =>
      packageValueId === "10"
        ? { priceMinor: 1000, stockType: "api" }
        : { priceMinor: 200, stockType: "api" },
  );
  assert.equal(plan.action, "fulfill");
  if (plan.action !== "fulfill") return;
  assert.deepEqual(plan.deliver, [
    { unitId: "code-10", orderItemId: "line-10" },
    { unitId: "code-2", orderItemId: "line-2" },
  ]);
});

test("a reserved gift-card code keeps the order on the admin path", () => {
  const plan = planApiStockDelivery(
    [{ id: "line-2", productId: "itunes", quantity: 2, unitPriceMinor: 200 }],
    [
      { id: "code-a", productId: "itunes", packageValueId: "2" },
      { id: "code-b", productId: "itunes", packageValueId: "2" },
    ],
    () => ({ priceMinor: 200, stockType: "giftcard" }),
  );
  assert.deepEqual(plan, { action: "skip" });
});
