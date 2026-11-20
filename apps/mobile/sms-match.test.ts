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

test("nagad and rocket payment messages keep their transaction id and balance", () => {
  const nagad = readSmsPayment({
    key: "nagad-1",
    sender: "Nagad",
    body: "Money Received.\nAmount: Tk 100.00\nSender: 01700000000\nRef: 2\nTxnID: 733423DO\nBalance: Tk 201.00",
    receivedAt: 1_700_000_000_000,
  });
  assert.equal(nagad?.service, "nagad");
  assert.equal(nagad?.trxId, "733423DO");
  assert.equal(nagad?.amountCents, 10000);
  assert.equal(nagad?.balanceCents, 20100);
  const rocket = readSmsPayment({
    key: "rocket-1",
    sender: "16216",
    body: "Tk.100.00 received from 01700000000. Fee Tk.0.00. Balance Tk.201.00. TxnId:5291837465.",
    receivedAt: 1_700_000_000_000,
  });
  assert.equal(rocket?.service, "rocket");
  assert.equal(rocket?.trxId, "5291837465");
  assert.equal(rocket?.amountCents, 10000);
  assert.equal(rocket?.balanceCents, 20100);
  const charged = readSmsPayment({
    key: "nagad-fee",
    sender: "16167",
    body: "Money Received. Amount: Tk 100.00. Charge deducted Tk 5.00. TxnID: 733423DO. Bal: Tk 201.00",
    receivedAt: 1_700_000_000_000,
  });
  assert.equal(charged?.service, "nagad");
  assert.equal(charged?.amountCents, 10000);
  assert.equal(charged?.balanceCents, 20100);
  const upay = readSmsPayment({
    key: "upay-1",
    sender: "upay",
    body: "You have received BDT 100.00 from 01700000000. Fee BDT 0.00. Balance: BDT 201.00. TxnID: UP12AB34CD.",
    receivedAt: 1_700_000_000_000,
  });
  assert.equal(upay?.service, "upay");
  assert.equal(upay?.trxId, "UP12AB34CD");
  assert.equal(upay?.amountCents, 10000);
  assert.equal(upay?.balanceCents, 20100);
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

test("a unique amount order is paid from the matching SMS without a typed transaction id", () => {
  const book = setBalance(emptyBook(), 10100, "initial", "2026-11-13T00:00:00.000Z");
  const fresh = sms ? { ...sms, receivedAt: Date.parse("2026-11-13T00:10:00.000Z") } : null;
  assert.ok(book && fresh);
  const unique = job({ trxId: "", amountCents: 10000, createdAt: "2026-11-13T00:00:00.000Z" });
  const decision = decideWithSms(book, unique, [fresh], true);
  assert.equal(decision.type, "verify");
  if (decision.type !== "verify") return;
  assert.equal(decision.sms.trxId, "ABC123XYZ");
  assert.equal(decision.nextCents, 20100);
  const early = { ...fresh, key: "sms-old", receivedAt: Date.parse("2026-11-12T00:00:00.000Z") };
  assert.equal(decideWithSms(book, unique, [early], true).type, "wait");
  assert.equal(decideWithSms(book, job({ trxId: "", amountCents: 10004 }), [fresh], true).type, "wait");
  const shared = decideWithSms(book, unique, [fresh], true, [unique, job({ id: "job_2", trxId: "", amountCents: 10000 })]);
  assert.equal(shared.type, "wait");
});

test("a saved balance of 5000 does not verify when the SMS balance is 31574.85", () => {
  const book = setBalance(emptyBook(), 500000, "manual", "2026-11-13T00:00:00.000Z");
  const text = "You have received payment Tk 2.00 from 01770000000. Fee Tk 0.00. Balance Tk 31,574.85. TrxID DKD4EW5O5Y at 13/11/2026 01:40";
  const row = readSmsPayment({ key: "sms-gap", sender: "bKash", body: text, receivedAt: Date.parse("2026-11-13T01:40:00.000Z") });
  assert.ok(book && row);
  assert.equal(row?.amountCents, 200);
  assert.equal(row?.balanceCents, 3_157_485);
  const decision = decideWithSms(book, job({ trxId: "DKD4EW5O5Y", amountCents: 200, reportedCents: 500000 }), [row], true);
  assert.equal(decision.type, "reject");
  assert.equal(book.cents, 500000);
  const close = { ...row, balanceCents: 500200 };
  const allowed = decideWithSms(book, job({ trxId: "DKD4EW5O5Y", amountCents: 200, reportedCents: 500000 }), [close], true);
  assert.equal(allowed.type, "verify");
  if (allowed.type === "verify") assert.equal(allowed.nextCents, 500200);
  const onePoisha = { ...row, key: "sms-poisha", balanceCents: 500201 };
  assert.equal(decideWithSms(book, job({ trxId: "DKD4EW5O5Y", amountCents: 200, reportedCents: 500000 }), [onePoisha], true).type, "reject");
  const off = decideWithSms(book, job({ trxId: "DKD4EW5O5Y", amountCents: 200, reportedCents: 500000 }), [row], true, [], false);
  assert.equal(off.type, "verify");
  if (off.type === "verify") assert.equal(off.nextCents, 500200);
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
