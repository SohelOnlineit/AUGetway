import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { guestOrdersEnabled } from "./guest-orders";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function shopperSourcePath() {
  const candidates = [
    join(__dirname, "shopper.ts"),
    join(process.cwd(), "src/lib/auth/shopper.ts"),
    join(process.cwd(), "apps/web/src/lib/auth/shopper.ts"),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error("shopper.ts was not found");
  return found;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("a failed storefront response disables guest orders", async () => {
  globalThis.fetch = async () => jsonResponse(503, { message: "down" });
  assert.equal(await guestOrdersEnabled(), false);
});

test("a timeout or network error disables guest orders", async () => {
  globalThis.fetch = async () => {
    throw new Error("timeout");
  };
  assert.equal(await guestOrdersEnabled(), false);
});

test("an invalid payload disables guest orders", async () => {
  globalThis.fetch = async () =>
    new Response("not-json", { status: 200, headers: { "content-type": "text/plain" } });
  assert.equal(await guestOrdersEnabled(), false);
});

test("guest orders stay off unless the API says enabled", async () => {
  globalThis.fetch = async () => jsonResponse(200, {});
  assert.equal(await guestOrdersEnabled(), false);
  globalThis.fetch = async () => jsonResponse(200, { enabled: false });
  assert.equal(await guestOrdersEnabled(), false);
  globalThis.fetch = async () => jsonResponse(200, { enabled: true });
  assert.equal(await guestOrdersEnabled(), true);
});

test("authenticated checkout is decided before the guest-order gate", () => {
  const source = readFileSync(shopperSourcePath(), "utf8");
  const guestGate = source.indexOf("if (!(await guestOrdersEnabled()))");
  const bearerUse = source.indexOf('incoming.get("authorization")');
  const accessUse = source.indexOf("jar.get(ACCESS_COOKIE)");
  assert.ok(guestGate > 0);
  assert.ok(bearerUse >= 0 && bearerUse < guestGate);
  assert.ok(accessUse >= 0 && accessUse < guestGate);
});
