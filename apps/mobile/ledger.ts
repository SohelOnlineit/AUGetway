export const SERVICES = ["bkash", "nagad", "rocket", "upay"] as const;

export type Service = (typeof SERVICES)[number];

export type LedgerEvent = {
  at: string;
  kind: "initial" | "manual" | "verified" | "rejected";
  cents: number;
  amountCents: number;
  trxId: string;
  orderId: string;
};

export type WalletBook = {
  cents: number | null;
  trx: string[];
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
  return { cents: null, trx: [], events: [] };
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
  return { cents: event.cents, trx, events: [...book.events, event].slice(-40) };
}

export function setBalance(book: WalletBook, cents: number, kind: "initial" | "manual", at: string): WalletBook | null {
  if (!Number.isInteger(cents) || cents < 0 || cents > 100_000_000) return null;
  return remember(book, { at, kind, cents, amountCents: 0, trxId: "", orderId: "" });
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

export function applyVerified(book: WalletBook, job: VerifyJob, nextCents: number, at: string): WalletBook {
  return remember(book, {
    at,
    kind: "verified",
    cents: nextCents,
    amountCents: job.amountCents,
    trxId: job.trxId.trim().toUpperCase(),
    orderId: job.orderId,
  }, job.trxId.trim().toUpperCase());
}

export function mergeRemote(local: Books, remote: Partial<Record<Service, { cents: number | null; trx: string[] }>>): Books {
  const next = emptyBooks();
  for (const service of SERVICES) {
    const book = local[service] ?? emptyBook();
    const row = remote[service];
    const trx = [...book.trx, ...(row?.trx ?? [])].map((item) => item.trim().toUpperCase()).filter(Boolean);
    next[service] = {
      cents: book.cents === null ? row?.cents ?? null : book.cents,
      trx: [...new Set(trx)].slice(-500),
      events: book.events,
    };
  }
  return next;
}
