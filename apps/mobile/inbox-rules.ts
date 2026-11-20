export type Sender = { name: string; enabled: boolean };

export type InboxRules = {
  whitelistOn: boolean;
  senders: Sender[];
  keywords: string[];
  cleanDays: number;
};

export const DEFAULT_SENDERS: Sender[] = [
  "16167",
  "16216",
  "16269",
  "AB BANK",
  "AB BANK PLC",
  "BANK ASIA",
  "bKash",
  "BRAC BANK",
  "Cellfin",
  "CITY BANK",
  "DBBL",
  "Nagad",
  "Rocket",
  "Upay",
  "16316",
].map((name) => ({ name, enabled: true }));

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesSender(address: string, name: string) {
  const needle = name.trim().toLowerCase();
  if (needle.length < 2) return false;
  const from = address.trim().toLowerCase();
  if (!from) return false;
  if (/^\d+$/.test(needle)) {
    const digits = from.replace(/\D/g, "");
    return (digits.startsWith("880") ? digits.slice(3) : digits) === needle;
  }
  if (from === needle) return true;
  const word = new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`, "i");
  return word.test(from);
}

export function isOtpMessage(body: string) {
  return /\botp\b/i.test(body) || /\bverification\s*code\b/i.test(body);
}

export function isPersonalNumber(sender: string) {
  const digits = sender.replace(/\D/g, "");
  return /^01[3-9]\d{8}$/.test(digits) || /^8801[3-9]\d{8}$/.test(digits);
}

function isPayment(address: string, body: string) {
  if (isOtpMessage(body)) return false;
  return DEFAULT_SENDERS.some((sender) => matchesSender(address, sender.name));
}

export function keepMessage(
  row: { address: string; body: string; receivedAt: number },
  rules: InboxRules,
  now: number,
) {
  if (isPersonalNumber(row.address) || isOtpMessage(row.body)) return false;
  if (rules.cleanDays > 0 && now - row.receivedAt > rules.cleanDays * 24 * 60 * 60 * 1000) return false;
  const text = `${row.address} ${row.body}`.toLowerCase();
  if (rules.keywords.some((word) => word.trim().length >= 3 && text.includes(word.trim().toLowerCase()))) return false;
  if (!rules.whitelistOn) return isPayment(row.address, row.body);
  return rules.senders.some((sender) => sender.enabled && matchesSender(row.address, sender.name));
}

const DEBIT = ["transferred to", "transfer to", "sent to", "send money", "cash out", "payment to"];

export function shouldUpload(
  row: { address: string; body: string; trxId: string; amount: string },
  senders: Sender[],
) {
  if (isPersonalNumber(row.address) || isOtpMessage(row.body)) return false;
  if (!senders.some((sender) => sender.enabled && matchesSender(row.address, sender.name))) return false;
  const lower = row.body.toLowerCase();
  if (DEBIT.some((hint) => lower.includes(hint))) return false;
  return Boolean(row.trxId || row.amount);
}

export function senderLabel(address: string, _body: string, senders: Sender[]) {
  const hit = senders
    .filter((sender) => matchesSender(address, sender.name))
    .sort((left, right) => right.name.length - left.name.length)[0];
  return hit?.name || address || "SMS";
}
