import assert from "node:assert/strict";
import test from "node:test";
import { browserHttpUrl, isPrivateAddress } from "./public-url.ts";

test("a webhook cannot point at an internal address, even written as IPv6", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.5",
    "192.168.1.9",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a9fe:a9fe",
    "0:0:0:0:0:ffff:c0a8:101",
    "fd00::1",
    "fe80::1",
    "fec0::1",
    "64:ff9b::7f00:1",
  ]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
});

test("a normal public address is allowed", () => {
  for (const address of ["8.8.8.8", "93.184.216.34", "::ffff:808:808", "2606:4700:4700::1111"]) {
    assert.equal(isPrivateAddress(address), false, address);
  }
});

test("a customer return address stays a normal web address", () => {
  assert.equal(browserHttpUrl(""), "");
  assert.equal(browserHttpUrl("https://shop.example/thanks"), "https://shop.example/thanks");
  assert.equal(browserHttpUrl("http://127.0.0.1:3100/done"), "http://127.0.0.1:3100/done");
});

test("a script address cannot be stored as the return link", () => {
  assert.throws(() => browserHttpUrl("javascript:alert(1)"));
  assert.throws(() => browserHttpUrl("data:text/html,hi"));
  assert.throws(() => browserHttpUrl("https://user:secret@shop.example/back"));
  assert.throws(() => browserHttpUrl("https://shop.example/\n.evil"));
});
