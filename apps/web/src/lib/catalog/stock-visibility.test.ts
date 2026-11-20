import assert from "node:assert/strict";
import test from "node:test";
import type { PublicProductDetail, PublicProductPackage } from "@amarpin/types";
import { hideOutOfStockPackages } from "./regions.ts";

function pkg(patch: Partial<PublicProductPackage> & Pick<PublicProductPackage, "valueId" | "name" | "inStock">): PublicProductPackage {
  return {
    priceMinor: 1000,
    region: "BD",
    regions: ["BD"],
    imageUrl: null,
    availableCount: patch.inStock ? 2 : 0,
    instant: true,
    ...patch,
  };
}

function product(packages: PublicProductPackage[], regions = ["BD", "US"]): PublicProductDetail {
  return {
    packages,
    regions,
    defaultRegion: "US",
  } as PublicProductDetail;
}

test("a shopper loses out-of-stock packages and their empty region", () => {
  const next = hideOutOfStockPackages(
    product([
      pkg({ valueId: "a", name: "BD 60", inStock: true, region: "BD", regions: ["BD"] }),
      pkg({ valueId: "b", name: "US 60", inStock: false, region: "US", regions: ["US"] }),
    ]),
  );
  assert.deepEqual(next.packages.map((item) => item.valueId), ["a"]);
  assert.deepEqual(next.regions, ["BD"]);
  assert.equal(next.defaultRegion, "BD");
});

test("a product with no packages is left unchanged", () => {
  const row = product([], []);
  assert.equal(hideOutOfStockPackages(row), row);
});
