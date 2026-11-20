import assert from "node:assert/strict";
import test from "node:test";
import { storefrontFromHeaders } from "../src/modules/catalog/storefronts.ts";

test("uniqbd.com sends mail as uniqbd", () => {
  assert.equal(storefrontFromHeaders({ origin: "https://uniqbd.com" }), "uniqbd");
  assert.equal(storefrontFromHeaders({ "x-storefront": "uniqbd" }), "uniqbd");
});

test("amarpin.com sends mail as amarpin", () => {
  assert.equal(storefrontFromHeaders({ origin: "https://amarpin.com" }), "amarpin");
  assert.equal(storefrontFromHeaders({ "x-storefront": "amarpin", origin: "https://uniqbd.com" }), "amarpin");
});

test("pay.uniqbd.com is AuGetway, not the UniQbd shop", () => {
  assert.equal(storefrontFromHeaders({ origin: "https://pay.uniqbd.com" }), "amarpin");
  assert.equal(storefrontFromHeaders({ host: "pay.uniqbd.com" }), "amarpin");
  assert.equal(storefrontFromHeaders({ host: "api.pay.uniqbd.com", origin: "https://pay.uniqbd.com" }), "amarpin");
});

test("an API host does not steal the shop from the website", () => {
  assert.equal(storefrontFromHeaders({ host: "api.internal", origin: "https://www.uniqbd.com" }), "uniqbd");
});
