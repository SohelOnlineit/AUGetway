import assert from "node:assert/strict";
import test from "node:test";
import { tokenDevice, wantsHandset } from "./desk-device.ts";

const day = 24 * 60 * 60;

test("a token that says it is the phone is the phone", () => {
  assert.equal(tokenDevice({ device: "handset", exp: 7 * day, iat: 0 }), "handset");
});

test("a token that says it is the website is the website", () => {
  assert.equal(tokenDevice({ device: "desk", exp: 5 * 365 * day, iat: 0 }), "desk");
});

test("an older phone token lasts for years, so it is still the phone", () => {
  assert.equal(tokenDevice({ exp: 5 * 365 * day, iat: 0 }), "handset");
});

test("an older website token lasts a week, so it cannot act as the phone", () => {
  assert.equal(tokenDevice({ exp: 7 * day, iat: 0 }), "desk");
});

test("a token with no lifetime is treated as the website", () => {
  assert.equal(tokenDevice({}), "desk");
});

test("the payment app is the phone even when an older build does not say so", () => {
  assert.equal(wantsHandset(undefined, undefined), true);
  assert.equal(wantsHandset(undefined, "handset"), true);
  assert.equal(wantsHandset("same-origin", "handset"), false);
  assert.equal(wantsHandset(undefined, "desk"), false);
});
