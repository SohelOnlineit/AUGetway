import assert from "node:assert/strict";
import test from "node:test";
import { needsPictureBody } from "./body-limit.ts";
import { isLoopback, LoginThrottle, normalizeAddress, WindowCounter } from "./limits.ts";

test("a counter lets the limit through and then asks to wait", () => {
  const counter = new WindowCounter();
  const now = 1_000_000;
  for (let i = 0; i < 3; i += 1) assert.equal(counter.hit("a", 3, 60_000, now), 0);
  assert.ok(counter.hit("a", 3, 60_000, now + 1000) > 0);
  assert.equal(counter.hit("b", 3, 60_000, now), 0);
});

test("a counter starts again after its window ends", () => {
  const counter = new WindowCounter();
  const now = 5_000_000;
  counter.hit("a", 1, 1000, now);
  assert.ok(counter.hit("a", 1, 1000, now + 10) > 0);
  assert.equal(counter.hit("a", 1, 1000, now + 1001), 0);
});

test("a counter never holds more keys than its cap", () => {
  const counter = new WindowCounter(100);
  const now = 9_000_000;
  for (let i = 0; i < 1000; i += 1) counter.add(`key-${i}`, 60_000, now);
  assert.ok(counter.size <= 100);
});

test("addresses are cleaned and IPv6 is counted by its /64", () => {
  assert.equal(normalizeAddress("203.0.113.7"), "203.0.113.7");
  assert.equal(normalizeAddress("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(normalizeAddress("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), normalizeAddress("2001:db8:1:2::1"));
  assert.notEqual(normalizeAddress("2001:db8:1:2::1"), normalizeAddress("2001:db8:1:3::1"));
  assert.equal(normalizeAddress("[2001:DB8::1]"), "2001:0db8:0000:0000::/64");
});

test("only this machine counts as loopback", () => {
  assert.equal(isLoopback(normalizeAddress("127.0.0.1")), true);
  assert.equal(isLoopback(normalizeAddress("::1")), true);
  assert.equal(isLoopback(normalizeAddress("::ffff:127.0.0.1")), true);
  assert.equal(isLoopback(normalizeAddress("203.0.113.7")), false);
  assert.equal(isLoopback(normalizeAddress("2001:db8::1")), false);
});

test("one person is blocked after 8 misses but another address is not", () => {
  const throttle = new LoginThrottle();
  const now = 1_000;
  for (let i = 0; i < 8; i += 1) {
    assert.equal(throttle.blocked("owner@example.com", "198.51.100.1", now), false);
    throttle.fail("owner@example.com", "198.51.100.1", now);
  }
  assert.equal(throttle.blocked("owner@example.com", "198.51.100.1", now), true);
  assert.equal(throttle.blocked("owner@example.com", "198.51.100.2", now), false);
});

test("one address cannot lock a real admin out from other addresses", () => {
  const throttle = new LoginThrottle();
  for (let i = 0; i < 100; i += 1) throttle.fail("owner@example.com", "198.51.100.1");
  assert.equal(throttle.blocked("owner@example.com", "203.0.113.50"), true);
});

test("a single address is stopped even when it tries many emails", () => {
  const throttle = new LoginThrottle();
  for (let i = 0; i < 30; i += 1) throttle.fail(`user${i}@example.com`, "198.51.100.9");
  assert.equal(throttle.blocked("someone-new@example.com", "198.51.100.9"), true);
  assert.equal(throttle.blocked("someone-new@example.com", "198.51.100.10"), false);
});

test("a good sign-in clears only its own pair, not the address count", () => {
  const throttle = new LoginThrottle();
  for (let i = 0; i < 30; i += 1) throttle.fail("victim@example.com", "198.51.100.9");
  throttle.clear("attacker@example.com", "198.51.100.9");
  assert.equal(throttle.blocked("victim@example.com", "198.51.100.9"), true);
  assert.equal(throttle.blocked("other@example.com", "198.51.100.9"), true);
});

test("failures are forgotten after the window", () => {
  const throttle = new LoginThrottle(1000);
  for (let i = 0; i < 8; i += 1) throttle.fail("owner@example.com", "198.51.100.1", 0);
  assert.equal(throttle.blocked("owner@example.com", "198.51.100.1", 500), true);
  assert.equal(throttle.blocked("owner@example.com", "198.51.100.1", 1500), false);
});

test("only the routes that carry a picture may send a large body", () => {
  assert.equal(needsPictureBody("POST", "/api/desk/methods"), true);
  assert.equal(needsPictureBody("PATCH", "/api/desk/methods/abc123"), true);
  assert.equal(needsPictureBody("POST", "/api/desk/links"), true);
  assert.equal(needsPictureBody("PATCH", "/api/desk/links/my-link"), true);
  assert.equal(needsPictureBody("POST", "/api/desk/settings"), true);
  assert.equal(needsPictureBody("POST", "/api/public/pay/abcDEF123/proof"), true);
  assert.equal(needsPictureBody("POST", "/api/auth/login"), false);
  assert.equal(needsPictureBody("POST", "/api/public/pay/abcDEF123/method"), false);
  assert.equal(needsPictureBody("POST", "/api/checkout-v2"), false);
  assert.equal(needsPictureBody("POST", "/api/desk/keys"), false);
  assert.equal(needsPictureBody("GET", "/api/desk/settings"), false);
  assert.equal(needsPictureBody("POST", "/api/desk/methods/x/../../auth/login"), false);
});
