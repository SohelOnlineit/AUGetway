import assert from "node:assert/strict";
import test from "node:test";
import { SecretBox } from "./secret-box.ts";
import { base32Decode, base32Encode, matchTotp, newTotpSecret, otpauthUrl, stepAt, totpAt } from "./totp.ts";
import { signWebhook, webhookHeaders, webhookIsGenuine } from "./webhook-sign.ts";

// RFC 6238 test secret: the ASCII text 12345678901234567890.
const rfcSecret = base32Encode(Buffer.from("12345678901234567890"));

test("base32 round-trips and matches the known text form", () => {
  assert.equal(base32Encode(Buffer.from("Hello!")), "JBSWY3DPEE");
  assert.equal(base32Decode("JBSWY3DPEE").toString("utf8"), "Hello!");
  const data = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 9, 8, 7]);
  assert.deepEqual(base32Decode(base32Encode(data)), data);
  assert.deepEqual(base32Decode("jbsw y3dp-ehpk 3pxp"), base32Decode("JBSWY3DPEHPK3PXP"));
});

test("TOTP gives the RFC 6238 values", () => {
  assert.equal(totpAt(rfcSecret, stepAt(59_000), 8), "94287082");
  assert.equal(totpAt(rfcSecret, stepAt(1_111_111_109_000), 8), "07081804");
  assert.equal(totpAt(rfcSecret, stepAt(2_000_000_000_000), 8), "69279037");
  assert.equal(totpAt(rfcSecret, stepAt(59_000)), "287082");
});

test("a code works inside its window and one step either side", () => {
  const now = 1_700_000_000_000;
  const step = stepAt(now);
  assert.equal(matchTotp(rfcSecret, totpAt(rfcSecret, step), now), step);
  assert.equal(matchTotp(rfcSecret, totpAt(rfcSecret, step - 1), now), step - 1);
  assert.equal(matchTotp(rfcSecret, totpAt(rfcSecret, step + 1), now), step + 1);
  assert.equal(matchTotp(rfcSecret, totpAt(rfcSecret, step - 2), now), null);
  assert.equal(matchTotp(rfcSecret, totpAt(rfcSecret, step + 2), now), null);
});

test("a code cannot be used twice", () => {
  const now = 1_700_000_000_000;
  const step = stepAt(now);
  const code = totpAt(rfcSecret, step);
  assert.equal(matchTotp(rfcSecret, code, now, step), null);
  assert.equal(matchTotp(rfcSecret, code, now, step - 1), step);
});

test("anything that is not six digits is refused", () => {
  const now = 1_700_000_000_000;
  for (const bad of ["", "12345", "1234567", "abcdef", "12 456", "١٢٣٤٥٦"]) assert.equal(matchTotp(rfcSecret, bad, now), null);
});

test("a new secret is 32 base32 characters and the setup link carries it", () => {
  const secret = newTotpSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
  assert.notEqual(secret, newTotpSecret());
  const url = otpauthUrl(secret, "owner@example.com");
  assert.ok(url.startsWith("otpauth://totp/AU-Getway%3Aowner%40example.com?secret="));
  assert.ok(url.includes(`secret=${secret}`));
});

test("a sealed secret opens again, and is not readable as stored", () => {
  const box = new SecretBox("a-long-test-secret-of-32-characters!");
  const sealed = box.seal("smtp-password-123", "pref:mailPassword");
  assert.ok(SecretBox.isSealed(sealed));
  assert.ok(!sealed.includes("smtp-password-123"));
  assert.equal(box.open(sealed, "pref:mailPassword"), "smtp-password-123");
  assert.notEqual(box.seal("smtp-password-123", "pref:mailPassword"), sealed);
});

test("a sealed value cannot be moved to another field or opened with another key", () => {
  const box = new SecretBox("a-long-test-secret-of-32-characters!");
  const sealed = box.seal("bot-token", "pref:telegramToken");
  assert.equal(box.open(sealed, "pref:mailPassword"), "");
  assert.equal(new SecretBox("another-secret-of-32-characters-xx").open(sealed, "pref:telegramToken"), "");
});

test("a damaged sealed value opens as empty and old plain text is kept as it is", () => {
  const box = new SecretBox("a-long-test-secret-of-32-characters!");
  const sealed = box.seal("value", "ctx");
  assert.equal(box.open(`${sealed.slice(0, -4)}AAAA`, "ctx"), "");
  assert.equal(box.open("enc:v1:", "ctx"), "");
  assert.equal(box.open("enc:v1:short", "ctx"), "");
  assert.equal(box.open("plain old value", "ctx"), "plain old value");
  assert.equal(box.seal("", "ctx"), "");
});

test("a webhook signature is checked with the secret, the time and the exact body", () => {
  const body = JSON.stringify({ invoice_id: "abc", status: "COMPLETED", amount: "100.00" });
  const now = 1_800_000_000_000;
  const headers = webhookHeaders("shop-secret", body, now);
  assert.equal(headers["x-webhook-timestamp"], "1800000000");
  assert.equal(headers["x-webhook-signature"], signWebhook("shop-secret", "1800000000", body));
  assert.equal(webhookIsGenuine("shop-secret", headers["x-webhook-timestamp"], body, headers["x-webhook-signature"], now), true);
  assert.equal(webhookIsGenuine("other-secret", headers["x-webhook-timestamp"], body, headers["x-webhook-signature"], now), false);
  assert.equal(webhookIsGenuine("shop-secret", headers["x-webhook-timestamp"], body.replace("100", "900"), headers["x-webhook-signature"], now), false);
  assert.equal(webhookIsGenuine("shop-secret", headers["x-webhook-timestamp"], body, headers["x-webhook-signature"], now + 301_000), false);
  assert.deepEqual(webhookHeaders("", body, now), {});
});
