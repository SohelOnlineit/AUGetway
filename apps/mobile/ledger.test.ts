import assert from "node:assert/strict";
import test from "node:test";
import { addCents, applyVerified, emptyBook, mergeRemote, nextDecision, parseTaka, setBalance, type VerifyJob } from "./ledger.ts";

const job = (patch: Partial<VerifyJob> = {}): VerifyJob => ({
  id: "job_1",
  orderId: "pub_1",
  customerId: "order-19",
  service: "bkash",
  trxId: "ABC123XYZ",
  amountCents: 10000,
  reportedCents: 10100,
  createdAt: "2026-11-12T00:00:00.000Z",
  ...patch,
});

test("101 taka plus 100 taka is 201 taka, in cents", () => {
  assert.equal(parseTaka("101"), 10100);
  assert.equal(parseTaka("100.00"), 10000);
  assert.equal(addCents(10100, 10000), 20100);
  assert.equal(addCents(20100, 5000), 25100);
});

test("a matching balance and a new transaction id verifies once", () => {
  const book = setBalance(emptyBook(), 10100, "initial", "t0");
  assert.ok(book);
  const first = nextDecision(book, job(), true);
  assert.deepEqual(first, { type: "verify", nextCents: 20100 });
  const saved = applyVerified(book, job(), 20100, "t1");
  assert.equal(saved.cents, 20100);
  assert.deepEqual(nextDecision(saved, job(), false), { type: "reject", reason: "Transaction ID already used" });
  const second = nextDecision(saved, job({ id: "job_2", trxId: "NEXT12345", amountCents: 5000, reportedCents: 10100 }), false);
  assert.deepEqual(second, { type: "verify", nextCents: 25100 });
});

test("nagad balance is not used for a bkash payment", () => {
  const nagad = setBalance(emptyBook(), 50000, "initial", "t0");
  assert.ok(nagad);
  const bkash = emptyBook();
  assert.equal(nextDecision(bkash, job(), true).type, "wait");
  assert.equal(nagad.cents, 50000);
});

test("a drifted saved balance waits instead of approving", () => {
  const book = setBalance(emptyBook(), 10100, "initial", "t0");
  assert.ok(book);
  assert.equal(nextDecision(book, job({ reportedCents: 9000 }), true).type, "wait");
});

test("a reinstall keeps the used transaction ids", () => {
  const merged = mergeRemote(
    { bkash: emptyBook(), nagad: emptyBook(), rocket: emptyBook(), upay: emptyBook() },
    { bkash: { cents: 20100, trx: ["ABC123XYZ"] } },
  );
  assert.equal(merged.bkash.cents, 20100);
  assert.equal(nextDecision(merged.bkash, job({ reportedCents: 20100 }), true).type, "reject");
  assert.equal(merged.nagad.cents, null);
});

test("a paid order updates the saved balance from the server", () => {
  const local = setBalance(emptyBook(), 500000, "manual", "t0");
  assert.ok(local);
  const merged = mergeRemote(
    { bkash: local, nagad: emptyBook(), rocket: emptyBook(), upay: emptyBook() },
    { bkash: { cents: 510000, trx: ["PAID12345"] } },
  );
  assert.equal(merged.bkash.cents, 510000);
  assert.equal(merged.bkash.trx.includes("PAID12345"), true);
  const again = mergeRemote(
    { bkash: merged.bkash, nagad: emptyBook(), rocket: emptyBook(), upay: emptyBook() },
    { bkash: { cents: 510000, trx: ["PAID12345"] } },
  );
  assert.equal(again.bkash.cents, 510000);
  assert.equal(again.bkash.events.filter((event) => event.kind === "verified").length, 1);
});
