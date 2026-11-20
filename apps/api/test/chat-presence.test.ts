import assert from "node:assert/strict";
import test from "node:test";
import { ChatPresenceRegistry } from "../src/modules/chat/chat-presence.ts";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("a reconnect during the grace window stays online", async () => {
  const presence = new ChatPresenceRegistry(30);
  assert.equal(presence.connect("user"), true);
  assert.equal(presence.isOnline("user"), true);
  let offline = 0;
  assert.equal(presence.release("user", () => {
    offline += 1;
  }), false);
  assert.equal(presence.isOnline("user"), true);
  assert.equal(presence.connect("user"), false);
  await wait(50);
  assert.equal(offline, 0);
  assert.equal(presence.isOnline("user"), true);
});

test("the last socket goes offline after the grace window", async () => {
  const presence = new ChatPresenceRegistry(20);
  presence.connect("user");
  presence.connect("user");
  assert.equal(presence.release("user", () => undefined), true);
  assert.equal(presence.isOnline("user"), true);
  let offline = 0;
  presence.release("user", () => {
    offline += 1;
  });
  assert.equal(presence.isOnline("user"), true);
  await wait(40);
  assert.equal(offline, 1);
  assert.equal(presence.isOnline("user"), false);
});
