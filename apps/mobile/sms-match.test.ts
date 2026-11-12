import assert from "node:assert/strict";
import test from "node:test";
import { applySmsBalance, applyVerified, decideWithSms, emptyBook, matchJobSms, readSmsBalance, readSmsPayment, setBalance, type VerifyJob } from "./ledger.ts";

const body = "You have received Tk 100.00 from 01700000000. Fee Tk 0.00. Balance Tk 201.00. TrxID ABC123XYZ at 13/11/2026 00:10.";

const sms = readSmsPayment({ key: "sms-1", sender: "bKash", body, receivedAt: 1_700_000_000_000 });

const job = (patch: Partial<VerifyJob> = {}): VerifyJob => ({
  id: "job_1",
  orderId: "pub_1",
  customerId: "order-19",
  service: "bkash",
  trxId: "ABC123XYZ",
  amountCents: 10000,
  reportedCents: 10100,
  createdAt: "2026-11-13T00:00:00.000Z",
  ...patch,
});

test("the payment amount is read and the SMS balance text is ignored", () => {
  assert.ok(sms);
  assert.equal(sms?.amountCents, 10000);
  assert.equal(sms?.service, "bkash");
  assert.equal(sms?.trxId, "ABC123XYZ");
  assert.equal(sms?.receivedAt, 1_700_000_000_000);
});

test("a matching SMS lets the phone add the amount once", () => {
  const book = setBalance(emptyBook(), 10100, "initial", "t0");
  assert.ok(book && sms);
  const decision = decideWithSms(book, job(), [sms], true);
  assert.equal(decision.type, "verify");
  if (decision.type !== "verify") return;
  assert.equal(decision.nextCents, 20100);
  const saved = applyVerified(book, job(), decision.nextCents, "t1", sms.key);
  assert.equal(saved.cents, 20100);
  assert.equal(saved.sms.includes(sms.key), true);
  const again = decideWithSms(saved, job({ id: "job_2" }), [sms], false);
  assert.equal(again.type, "reject");
});

test("the wrong amount or service stays pending and does not change the balance", () => {
  const book = setBalance(emptyBook(), 10100, "initial", "t0");
  assert.ok(book && sms);
  assert.equal(decideWithSms(book, job({ amountCents: 5000 }), [sms], true).type, "wait");
  assert.equal(decideWithSms(book, job({ service: "nagad" }), [sms], true).type, "wait");
  assert.equal(book.cents, 10100);
});

test("a bKash SMS balance replaces the saved bKash balance", () => {
  const text = "You have received payment Tk 1.00 from 01770000000. Fee Tk 0.00. Balance Tk 30,600.89. TrxID DKD0EV1CB6 at 13/11/2026 00:37";
  const row = { key: "sms-bkash", sender: "bKash", body: text, receivedAt: Date.parse("2026-11-13T00:37:00.000Z") };
  const balance = readSmsBalance(row);
  const payment = readSmsPayment(row);
  assert.equal(balance?.balanceCents, 3_060_089);
  assert.equal(payment?.amountCents, 100);
  assert.equal(payment?.balanceCents, 3_060_089);
  const book = setBalance(emptyBook(), 3_059_989, "manual", "2026-11-12T18:00:00.000Z");
  assert.ok(book && balance);
  const saved = applySmsBalance(book, balance, "2026-11-13T00:37:00.000Z");
  assert.equal(saved?.cents, 3_060_089);
  assert.equal(applySmsBalance(saved ?? book, { ...balance, receivedAt: balance.receivedAt - 1 }, "later"), null);
  const nagad = readSmsBalance({ ...row, key: "sms-nagad", sender: "Nagad" });
  assert.equal(nagad?.service, "nagad");
  assert.equal(saved?.cents, 3_060_089);
});

test("one SMS cannot be used for a second order", () => {
  assert.ok(sms);
  const first = matchJobSms(job(), [sms], []);
  assert.equal(first.type, "hit");
  const second = matchJobSms(job({ id: "job_2", trxId: "OTHER1234" }), [sms], [sms.key]);
  assert.equal(second.type, "wait");
  const same = matchJobSms(job(), [sms], [sms.key]);
  assert.equal(same.type, "wait");
  if (same.type === "wait") assert.equal(same.reason, "This SMS was already used");
});
