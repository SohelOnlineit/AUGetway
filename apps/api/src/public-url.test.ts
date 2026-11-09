import assert from "node:assert/strict";
import test from "node:test";
import { browserHttpUrl } from "./public-url.ts";

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
