export const SERVICES = ["bkash", "nagad", "rocket", "upay"] as const;

export type Service = (typeof SERVICES)[number];

export type LedgerEvent = {
  at: string;
  kind: "initial" | "manual" | "verified" | "rejected" | "pending" | "sms";
  cents: number;
  amountCents: number;
  trxId: string;
  orderId: string;
  note?: string;
};

export type WalletBook = {
  cents: number | null;
  trx: string[];
  sms: string[];
  balanceAt: number;
  events: LedgerEvent[];
};

export type Books = Record<Service, WalletBook>;

export type VerifyJob = {
  id: string;
  orderId: string;
  customerId: string;
  service: Service;
  trxId: string;
  amountCents: number;
  reportedCents: number | null;
  createdAt: string;
};

export type Decision =
  | { type: "wait" }
  | { type: "reject"; reason: string }
  | { type: "verify"; nextCents: number };

export function emptyBook(): WalletBook {
  return { cents: null, trx: [], sms: [], balanceAt: 0, events: [] };
}

export function normalizeBook(book: Partial<WalletBook> | null | undefined): WalletBook {
  return {
    cents: typeof book?.cents === "number" ? book.cents : null,
    trx: Array.isArray(book?.trx) ? book.trx.filter((item) => typeof item === "string") : [],
    sms: Array.isArray(book?.sms) ? book.sms.filter((item) => typeof item === "string") : [],
    balanceAt: typeof book?.balanceAt === "number" ? book.balanceAt : 0,
    events: Array.isArray(book?.events) ? book.events : [],
  };
}

export function emptyBooks(): Books {
  return { bkash: emptyBook(), nagad: emptyBook(), rocket: emptyBook(), upay: emptyBook() };
}

export function isService(value: string): value is Service {
  return (SERVICES as readonly string[]).includes(value);
}

export function addCents(previous: number, amount: number) {
  if (!Number.isInteger(previous) || !Number.isInteger(amount) || previous < 0 || amount < 1) return null;
  const next = previous + amount;
  if (!Number.isSafeInteger(next) || next > 100_000_000) return null;
  return next;
}

export function formatTaka(cents: number) {
  const whole = Math.floor(Math.abs(cents) / 100);
  const frac = String(Math.abs(cents) % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${whole}.${frac}`;
}

export function parseTaka(value: string) {
  const text = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents > 100_000_000) return null;
  return cents;
}

function remember(book: WalletBook, event: LedgerEvent, trxId = ""): WalletBook {
  const trx = trxId && !book.trx.includes(trxId) ? [...book.trx, trxId].slice(-500) : book.trx;
  return { ...book, cents: event.cents, trx, sms: book.sms ?? [], events: [...book.events, event].slice(-40) };
}

export function setBalance(book: WalletBook, cents: number, kind: "initial" | "manual", at: string): WalletBook | null {
  if (!Number.isInteger(cents) || cents < 0 || cents > 100_000_000) return null;
  const saved = remember(book, { at, kind, cents, amountCents: 0, trxId: "", orderId: "" });
  const stamped = Date.parse(at);
  return { ...saved, balanceAt: Number.isFinite(stamped) ? stamped : Date.now() };
}

export function nextDecision(book: WalletBook, job: VerifyJob, checkReported: boolean): Decision {
  if (book.cents === null) return { type: "wait" };
  if (checkReported && job.reportedCents !== null && job.reportedCents !== book.cents) return { type: "wait" };
  const trxId = job.trxId.trim().toUpperCase();
  if (trxId.length < 8) return { type: "reject", reason: "Transaction ID is missing" };
  if (book.trx.includes(trxId)) return { type: "reject", reason: "Transaction ID already used" };
  if (!Number.isInteger(job.amountCents) || job.amountCents < 1) return { type: "reject", reason: "Amount is not valid" };
  const nextCents = addCents(book.cents, job.amountCents);
  if (nextCents === null) return { type: "reject", reason: "Amount is not valid" };
  return { type: "verify", nextCents };
}

export function applyVerified(book: WalletBook, job: VerifyJob, nextCents: number, at: string, smsKey = "", trxFromSms = ""): WalletBook {
  const trxId = (trxFromSms || job.trxId).trim().toUpperCase();
  const saved = remember(book, {
    at,
    kind: "verified",
    cents: nextCents,
    amountCents: job.amountCents,
    trxId,
    orderId: job.orderId,
    note: smsKey,
  }, trxId);
  if (!smsKey || saved.sms.includes(smsKey)) return saved;
  return { ...saved, sms: [...saved.sms, smsKey].slice(-500) };
}

export function logWait(book: WalletBook, job: VerifyJob, reason: string, at: string): WalletBook {
  const trxId = job.trxId.trim().toUpperCase();
  const last = book.events[book.events.length - 1];
  if (last?.kind === "pending" && last.trxId === trxId && last.note === reason) return book;
  return {
    ...book,
    events: [...book.events, { at, kind: "pending", cents: book.cents ?? 0, amountCents: job.amountCents, trxId, orderId: job.orderId, note: reason }].slice(-40),
  };
}

function confirmedBalance(previous: number, amountCents: number, smsBalance: number | null):
  | { type: "verify"; nextCents: number }
  | { type: "reject"; reason: string } {
  const expected = addCents(previous, amountCents);
  if (expected === null) return { type: "reject", reason: "Amount is not valid" };
  if (smsBalance === null) return { type: "reject", reason: "SMS balance is missing" };
  if (smsBalance !== expected) return { type: "reject", reason: "SMS balance does not match the app balance" };
  return { type: "verify", nextCents: smsBalance };
}

function relaxedNext(previous: number | null, amountCents: number, smsBalance: number | null) {
  if (previous !== null) return addCents(previous, amountCents);
  return smsBalance;
}

export function decideWithSms(book: WalletBook, job: VerifyJob, messages: SmsHit[], checkReported: boolean, peers: VerifyJob[] = [], balanceCheck = true) {
  if (balanceCheck && book.cents === null) return { type: "wait" as const, reason: "Set the wallet balance first" };
  if (balanceCheck && checkReported && job.reportedCents !== null && job.reportedCents !== book.cents) return { type: "wait" as const, reason: "Saved balance does not match this phone" };
  const trxId = job.trxId.trim().toUpperCase();
  if (!trxId) return decideUniqueAmount(book, job, messages, peers, balanceCheck);
  if (book.trx.includes(trxId)) return { type: "reject" as const, reason: "Transaction ID already used" };
  const sms = matchJobSms(job, messages, book.sms);
  if (sms.type === "wait") return sms;
  if (!balanceCheck) {
    const nextCents = relaxedNext(book.cents, job.amountCents, sms.sms.balanceCents);
    if (nextCents === null) return { type: "reject" as const, reason: "Amount is not valid" };
    return { type: "verify" as const, nextCents, sms: sms.sms };
  }
  const confirmed = confirmedBalance(book.cents ?? 0, job.amountCents, sms.sms.balanceCents);
  if (confirmed.type === "reject") return confirmed;
  return { type: "verify" as const, nextCents: confirmed.nextCents, sms: sms.sms };
}

export function mergeRemote(local: Books, remote: Partial<Record<Service, { cents: number | null; trx: string[] }>>): Books {
  const next = emptyBooks();
  for (const service of SERVICES) {
    const book = local[service] ?? emptyBook();
    const row = remote[service];
    const remoteTrx = (row?.trx ?? []).map((item) => item.trim().toUpperCase()).filter(Boolean);
    const freshTrx = remoteTrx.filter((item) => !book.trx.includes(item));
    const trx = [...new Set([...book.trx, ...remoteTrx])].slice(-500);
    let cents = book.cents === null ? row?.cents ?? null : book.cents;
    let events = book.events;
    if (book.cents !== null && row?.cents != null && freshTrx.length > 0 && row.cents !== book.cents) {
      cents = row.cents;
      const amount = row.cents - book.cents;
      events = [...events, {
        at: new Date().toISOString(),
        kind: "verified" as const,
        cents: row.cents,
        amountCents: amount > 0 ? amount : 0,
        trxId: freshTrx[freshTrx.length - 1] ?? "",
        orderId: "",
        note: "Paid",
      }].slice(-40);
    }
    next[service] = {
      cents,
      trx,
      sms: book.sms,
      balanceAt: book.balanceAt ?? 0,
      events,
    };
  }
  return next;
}

export type InboxSms = { key: string; sender: string; body: string; receivedAt: number };

export type SmsHit = {
  key: string;
  service: Service;
  trxId: string;
  amountCents: number;
  balanceCents: number | null;
  sender: string;
  receivedAt: number;
};

export type SmsBalance = {
  key: string;
  service: Service;
  balanceCents: number;
  receivedAt: number;
};

const HARD_DEBIT = ["transferred to", "transfer to", "sent to", "send money", "cash out", "payment to"];
const SOFT_DEBIT = ["debited", "deducted"];
const CREDIT = ["received", "cash in", "deposit", "credited", "credit to"];

function serviceOf(sender: string, body: string): Service | "" {
  const from = `${sender} ${body}`.toLowerCase();
  if (from.includes("bkash")) return "bkash";
  if (from.includes("nagad") || from.includes("16167")) return "nagad";
  if (from.includes("rocket") || from.includes("16216") || from.includes("dbbl")) return "rocket";
  if (from.includes("upay")) return "upay";
  return "";
}

function senderService(sender: string): Service | "" {
  const from = sender.toLowerCase();
  if (from.includes("bkash")) return "bkash";
  if (from.includes("nagad") || from.includes("16167")) return "nagad";
  if (from.includes("rocket") || from.includes("16216") || from.includes("dbbl")) return "rocket";
  if (from.includes("upay")) return "upay";
  return "";
}

function moneyCents(value: string, allowZero = false) {
  const text = value.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100_000_000) return null;
  if (!allowZero && cents < 1) return null;
  return cents;
}

function creditCents(body: string) {
  const cleaned = body
    .replace(/\bbal(?:ance)?[\s\S]{0,24}?(?:tk|bdt|taka|৳)?\.?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?/gi, " ")
    .replace(/\b(?:fee|comm(?:ission)?|charge)[\s\S]{0,24}?(?:tk|bdt|taka|৳)?\.?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?/gi, " ");
  const labeled = cleaned.match(/(?:received|credited|deposit|cash\s*in)[\s\S]{0,60}?(?:tk|bdt|taka|৳)\.?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  const raw = labeled?.[1] ?? cleaned.match(/(?:tk|bdt|taka|৳)\.?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i)?.[1];
  if (!raw) return null;
  return moneyCents(raw);
}

export function readSmsBalance(row: InboxSms): SmsBalance | null {
  const service = senderService(row.sender) || serviceOf(row.sender, row.body);
  if (service !== "bkash" && service !== "nagad" && service !== "rocket" && service !== "upay") return null;
  const match = row.body.match(/\bbal(?:ance)?\s*(?:is\s*)?:?\s*(?:tk|bdt|taka|৳)\.?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (!match || row.receivedAt < 1 || !row.key) return null;
  const balanceCents = moneyCents(match[1], true);
  if (balanceCents === null) return null;
  return { key: row.key, service, balanceCents, receivedAt: row.receivedAt };
}

export function applySmsBalance(book: WalletBook, hit: SmsBalance, at: string): WalletBook | null {
  if (hit.receivedAt <= (book.balanceAt ?? 0)) return null;
  const saved = remember(book, {
    at,
    kind: "sms",
    cents: hit.balanceCents,
    amountCents: 0,
    trxId: "",
    orderId: "",
    note: "SMS balance",
  });
  return { ...saved, balanceAt: hit.receivedAt };
}

export function readSmsPayment(row: InboxSms): SmsHit | null {
  const body = row.body.trim();
  const lower = body.toLowerCase();
  const credit = CREDIT.some((hint) => lower.includes(hint));
  if (!body || HARD_DEBIT.some((hint) => lower.includes(hint)) || (!credit && SOFT_DEBIT.some((hint) => lower.includes(hint)))) return null;
  if (!credit) return null;
  const found = body.match(/(?:trx\s*id|trxid|txn\s*id|txnid|txn\s*no|txnno|transaction\s*id|trx\s*code|transaction\s*no|trans\s*id)[\s:]+([A-Za-z0-9]{8,20})(?![A-Za-z0-9])/i);
  const trxId = found?.[1]?.toUpperCase() ?? "";
  if (!/^[A-Z0-9]{8,20}$/.test(trxId) || /^(\d)\1+$/.test(trxId) || /^01[3-9]\d{8}$/.test(trxId)) return null;
  const amountCents = creditCents(body);
  const service = senderService(row.sender) || serviceOf(row.sender, body);
  if (service !== "bkash" && service !== "nagad" && service !== "rocket" && service !== "upay") return null;
  if (amountCents === null || row.receivedAt < 1 || !row.key) return null;
  const balance = readSmsBalance(row);
  return {
    key: row.key,
    service,
    trxId,
    amountCents,
    balanceCents: balance && balance.service === service ? balance.balanceCents : null,
    sender: row.sender.trim().slice(0, 80),
    receivedAt: row.receivedAt,
  };
}

function decideUniqueAmount(book: WalletBook, job: VerifyJob, messages: SmsHit[], peers: VerifyJob[], balanceCheck: boolean) {
  const shared = peers.some((peer) => peer.id !== job.id && peer.service === job.service && peer.amountCents === job.amountCents && !peer.trxId.trim());
  if (shared) return { type: "wait" as const, reason: "Two orders share this amount" };
  const opened = Date.parse(job.createdAt);
  const exact = messages
    .filter((row) => row.service === job.service && row.amountCents === job.amountCents)
    .filter((row) => !Number.isFinite(opened) || row.receivedAt + 30_000 >= opened)
    .sort((left, right) => left.receivedAt - right.receivedAt);
  const fresh = exact.find((row) => !book.sms.includes(row.key));
  if (!fresh) return { type: "wait" as const, reason: exact.length > 0 ? "This SMS was already used" : "Waiting for the payment SMS" };
  if (book.trx.includes(fresh.trxId)) return { type: "reject" as const, reason: "Transaction ID already used" };
  if (!balanceCheck) {
    const nextCents = relaxedNext(book.cents, job.amountCents, fresh.balanceCents);
    if (nextCents === null) return { type: "reject" as const, reason: "Amount is not valid" };
    return { type: "verify" as const, nextCents, sms: fresh };
  }
  const confirmed = confirmedBalance(book.cents ?? 0, job.amountCents, fresh.balanceCents);
  if (confirmed.type === "reject") return confirmed;
  return { type: "verify" as const, nextCents: confirmed.nextCents, sms: fresh };
}

export function matchJobSms(
  job: { service: Service; trxId: string; amountCents: number },
  rows: SmsHit[],
  usedKeys: string[],
): { type: "hit"; sms: SmsHit } | { type: "wait"; reason: string } {
  const trxId = job.trxId.trim().toUpperCase();
  const same = rows.filter((row) => row.trxId === trxId);
  if (same.length === 0) return { type: "wait", reason: "Waiting for the payment SMS" };
  const exact = same
    .filter((row) => row.service === job.service && row.amountCents === job.amountCents)
    .sort((left, right) => left.receivedAt - right.receivedAt);
  const fresh = exact.find((row) => !usedKeys.includes(row.key));
  if (fresh) return { type: "hit", sms: fresh };
  if (exact.length > 0) return { type: "wait", reason: "This SMS was already used" };
  if (!same.some((row) => row.service === job.service)) return { type: "wait", reason: "SMS service does not match" };
  return { type: "wait", reason: "SMS amount does not match" };
}

export function mergeSms(saved: SmsHit[], incoming: SmsHit[]) {
  const byKey = new Map<string, SmsHit>();
  for (const row of [...saved, ...incoming]) byKey.set(row.key, row);
  return [...byKey.values()].sort((left, right) => left.receivedAt - right.receivedAt).slice(-200);
}
