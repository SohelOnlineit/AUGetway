import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyNotice,
  exactKnownSender,
  matchWithoutWaitingForSnapshot,
  repeatedClaimEvent,
  watchInBackground,
  type OpenCheckoutSnap,
} from "./payment-security.ts";

const waiting = (patch: Partial<OpenCheckoutSnap> = {}): OpenCheckoutSnap => ({
  id: "chk_1",
  publicId: "pub_1",
  providerRef: "",
  status: "waiting",
  verifyBy: "transaction_id",
  ...patch,
});

test("an exact bKash, Nagad, or Rocket sender is not marked suspicious", () => {
  assert.equal(exactKnownSender("bKash"), true);
  assert.equal(exactKnownSender("NAGAD"), true);
  assert.equal(exactKnownSender("Rocket"), true);
  assert.equal(exactKnownSender("+88016216"), true);
  const events = classifyNotice({
    sender: "bKash",
    body: "You have received Tk 260.00. TrxID ABC12345.",
    trxId: "ABC12345",
    duplicate: false,
    matchedPublicId: "pub_1",
    recentNoticeCount: 1,
    openBefore: [waiting()],
    openAfter: [waiting({ status: "paid", providerRef: "ABC12345" })],
  });
  assert.deepEqual(events.map((event) => event.kind), []);
});

test("a lookalike sender is logged and the notice can still be a match", () => {
  const events = classifyNotice({
    sender: "bKash Help",
    body: "You have received Tk 260.00. TrxID ABC12345.",
    trxId: "ABC12345",
    duplicate: false,
    matchedPublicId: "pub_1",
    recentNoticeCount: 1,
    openBefore: [waiting()],
    openAfter: [waiting({ status: "paid", providerRef: "ABC12345" })],
  });
  assert.deepEqual(events.map((event) => event.kind), ["suspicious_sender"]);
  assert.equal(events[0]?.detail.includes("does not prove"), true);
});

test("a TrxID already stored on another checkout is a repeated attempt", () => {
  const events = classifyNotice({
    sender: "Nagad",
    body: "Money received. Tk 10.00. TxnID NAGAD1234.",
    trxId: "NAGAD1234",
    duplicate: false,
    matchedPublicId: null,
    recentNoticeCount: 1,
    openBefore: [waiting({ id: "other", publicId: "pub_other", providerRef: "NAGAD1234" })],
    openAfter: [waiting({ id: "other", publicId: "pub_other", providerRef: "NAGAD1234" })],
  });
  assert.ok(events.some((event) => event.kind === "repeated_trx" && event.checkoutId === "other"));
  assert.ok(events.some((event) => event.kind === "unmatched_sms"));
});

test("ten SMS from one handset in the window is a frequency log", () => {
  const events = classifyNotice({
    sender: "Rocket",
    body: "Cash in Tk 50.00. TrxID ROCK1234.",
    trxId: "ROCK1234",
    duplicate: false,
    matchedPublicId: "pub_1",
    recentNoticeCount: 10,
    openBefore: [waiting({ verifyBy: "transaction_id", providerRef: "ROCK1234" })],
    openAfter: [waiting({ verifyBy: "transaction_id", providerRef: "ROCK1234", status: "paid" })],
  });
  assert.deepEqual(events.map((event) => event.kind), ["high_frequency"]);
});

test("a unique-amount approval with no prior providerRef is logged", () => {
  const events = classifyNotice({
    sender: "bKash",
    body: "You have received Tk 10.02. TrxID UNIQ1234.",
    trxId: "UNIQ1234",
    duplicate: false,
    matchedPublicId: "pub_1",
    recentNoticeCount: 1,
    openBefore: [waiting({ verifyBy: "unique_amount", providerRef: "" })],
    openAfter: [waiting({ verifyBy: "unique_amount", providerRef: "UNIQ1234", status: "paid" })],
  });
  assert.deepEqual(events.map((event) => event.kind), ["unique_amount_without_ref"]);
});

test("a unique-amount checkout that already had a providerRef is not that event", () => {
  const events = classifyNotice({
    sender: "bKash",
    body: "You have received Tk 10.02. TrxID UNIQ1234.",
    trxId: "UNIQ1234",
    duplicate: false,
    matchedPublicId: "pub_1",
    recentNoticeCount: 1,
    openBefore: [waiting({ verifyBy: "unique_amount", providerRef: "UNIQ1234", status: "pending" })],
    openAfter: [waiting({ verifyBy: "unique_amount", providerRef: "UNIQ1234", status: "paid" })],
  });
  assert.equal(events.some((event) => event.kind === "unique_amount_without_ref"), false);
});

test("an unmatched saved SMS is logged", () => {
  const events = classifyNotice({
    sender: "bKash",
    body: "You have received Tk 15.00. TrxID MISS1234.",
    trxId: "MISS1234",
    duplicate: false,
    matchedPublicId: null,
    recentNoticeCount: 1,
    openBefore: [],
    openAfter: [],
  });
  assert.deepEqual(events.map((event) => event.kind), ["unmatched_sms"]);
});

test("a duplicate submission is logged and does not invent a new unmatched payment", () => {
  const events = classifyNotice({
    sender: "bKash.",
    body: "You have received Tk 15.00. TrxID MISS1234.",
    trxId: "MISS1234",
    duplicate: true,
    matchedPublicId: null,
    recentNoticeCount: 99,
    openBefore: [],
    openAfter: [],
  });
  assert.deepEqual(events.map((event) => event.kind), ["suspicious_sender", "duplicate_submission"]);
});

test("a repeated claim names the checkout and does not approve anything", () => {
  const event = repeatedClaimEvent("ABC12345", "chk_9");
  assert.equal(event.kind, "repeated_trx");
  assert.equal(event.checkoutId, "chk_9");
  assert.equal("decision" in event, false);
});

test("monitoring failure does not change a successful payment result", async () => {
  const paid = await Promise.resolve({ id: "notice_1", matched: "pub_1" });
  watchInBackground(async () => {
    throw new Error("security table missing");
  });
  assert.deepEqual(paid, { id: "notice_1", matched: "pub_1" });
});

test("a slow security read does not delay payment matching", async () => {
  let release: (rows: OpenCheckoutSnap[]) => void = () => undefined;
  const snapshot = new Promise<OpenCheckoutSnap[]>((resolve) => {
    release = resolve;
  });
  let watched: OpenCheckoutSnap[] | null = null;
  const started = Date.now();
  const matched = await matchWithoutWaitingForSnapshot(snapshot, async () => "pub_1", (_result, rows) => {
    watched = rows;
  });
  assert.equal(matched, "pub_1");
  assert.ok(Date.now() - started < 50);
  assert.equal(watched, null);
  release([waiting({ verifyBy: "unique_amount", providerRef: "" })]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(watched?.[0]?.verifyBy, "unique_amount");
});

test("a failed security read still returns the payment match", async () => {
  let watched: OpenCheckoutSnap[] | null = null;
  const matched = await matchWithoutWaitingForSnapshot(
    Promise.reject(new Error("security database down")),
    async () => "pub_1",
    (_result, rows) => {
      watched = rows;
    },
  );
  assert.equal(matched, "pub_1");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(watched, []);
});

test("available monitoring still records a unique-amount event after matching returns", async () => {
  const before = [waiting({ verifyBy: "unique_amount", providerRef: "", status: "waiting" })];
  const after = [waiting({ verifyBy: "unique_amount", providerRef: "UNIQ1234", status: "paid" })];
  let recorded: string[] = [];
  const matched = await matchWithoutWaitingForSnapshot(Promise.resolve(before), async () => "pub_1", (result, openBefore) => {
    recorded = classifyNotice({
      sender: "bKash",
      body: "You have received Tk 10.02. TrxID UNIQ1234.",
      trxId: "UNIQ1234",
      duplicate: false,
      matchedPublicId: result,
      recentNoticeCount: 1,
      openBefore,
      openAfter: after,
    }).map((event) => event.kind);
  });
  assert.equal(matched, "pub_1");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(recorded, ["unique_amount_without_ref"]);
});
