import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SENDERS, keepMessage, senderLabel, type InboxRules } from "./inbox-rules.ts";

const now = Date.parse("2026-11-09T07:00:00Z");
const fresh = now - 60_000;
const old = now - 10 * 24 * 60 * 60 * 1000;

function rules(patch: Partial<InboxRules> = {}): InboxRules {
  return { whitelistOn: true, senders: DEFAULT_SENDERS, keywords: [], cleanDays: 0, ...patch };
}

test("an enabled whitelist sender is kept", () => {
  const row = { address: "bKash", body: "You have received payment Tk 260.00", receivedAt: fresh };
  assert.equal(keepMessage(row, rules(), now), true);
  assert.equal(senderLabel(row.address, row.body, DEFAULT_SENDERS), "bKash");
});

test("a personal message is dropped while validation is on", () => {
  const row = { address: "01711111111", body: "Come home", receivedAt: fresh };
  assert.equal(keepMessage(row, rules(), now), false);
});

test("a disabled sender is not synced", () => {
  const senders = DEFAULT_SENDERS.map((sender) => (sender.name === "bKash" ? { ...sender, enabled: false } : sender));
  const row = { address: "bKash", body: "You have received payment Tk 10", receivedAt: fresh };
  assert.equal(keepMessage(row, rules({ senders }), now), false);
});

test("an ignore keyword blocks the message", () => {
  const row = { address: "bKash", body: "OTP 123456 for login", receivedAt: fresh };
  assert.equal(keepMessage(row, rules({ keywords: ["otp"] }), now), false);
});

test("cleaning hides messages older than the chosen days", () => {
  const row = { address: "16216", body: "You have received payment Tk 10", receivedAt: old };
  assert.equal(keepMessage(row, rules({ cleanDays: 7 }), now), false);
  assert.equal(keepMessage(row, rules({ cleanDays: 0 }), now), true);
});

test("validation off keeps only payment SMS", () => {
  const payment = { address: "16216", body: "TrxID ABC12345 received Tk 10", receivedAt: fresh };
  const chat = { address: "Mom", body: "Call me", receivedAt: fresh };
  assert.equal(keepMessage(payment, rules({ whitelistOn: false }), now), true);
  assert.equal(keepMessage(chat, rules({ whitelistOn: false }), now), false);
});

test("a bank sender name is the card title", () => {
  assert.equal(senderLabel("AB BANK", "Cash in Tk 500", DEFAULT_SENDERS), "AB BANK");
  assert.equal(senderLabel("AB BANK PLC", "Cash in Tk 500", DEFAULT_SENDERS), "AB BANK PLC");
});

test("a short code does not match a number inside the message", () => {
  const row = { address: "01711111111", body: "Call me about 16216 later", receivedAt: fresh };
  assert.equal(keepMessage(row, rules(), now), false);
});

test("a two-letter keyword cannot hide every message", () => {
  const row = { address: "bKash", body: "You have received payment Tk 10", receivedAt: fresh };
  assert.equal(keepMessage(row, rules({ keywords: ["in"] }), now), true);
  assert.equal(keepMessage(row, rules({ keywords: ["otp"] }), now), true);
});
