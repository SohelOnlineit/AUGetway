export type Sender = { name: string; enabled: boolean };

export type InboxRules = {
  whitelistOn: boolean;
  senders: Sender[];
  keywords: string[];
  cleanDays: number;
};

export const DEFAULT_SENDERS: Sender[] = [
  "16216",
  "16269",
  "AB BANK",
  "AB BANK PLC",
  "BANK ASIA",
  "bKash",
  "BRAC BANK",
  "Cellfin",
  "CITY BANK",
  "Nagad",
  "Rocket",
  "Upay",
].map((name) => ({ name, enabled: true }));

export function parseTrx(body: string) {
  const match = /(?:trx\s*id|trxid|txn\s*id|transaction\s*id)[:\s]*([A-Z0-9]{6,})/i.exec(body);
  return match?.[1]?.toUpperCase() ?? "";
}

export function parseAmount(body: string) {
  const labeled = /(?:tk|bdt|৳)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i.exec(body);
  const plain = /([0-9][0-9,]*\.[0-9]{2})/.exec(body);
  return (labeled ?? plain)?.[1] ?? "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesSender(address: string, body: string, name: string) {
  const needle = name.trim().toLowerCase();
  if (needle.length < 2) return false;
  const from = address.toLowerCase();
  if (/^\d+$/.test(needle)) return from.replace(/\D/g, "") === needle;
  if (from === needle) return true;
  const word = new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`, "i");
  if (word.test(from)) return true;
  return needle.length >= 4 && word.test(body);
}

function isPayment(address: string, body: string) {
  const text = `${address} ${body}`.toLowerCase();
  const wallet = ["bkash", "nagad", "rocket", "upay", "16216", "16316"];
  const aboutMoney = text.includes("trx") || text.includes("txn") || text.includes("received") || text.includes("cash in");
  return wallet.some((hint) => text.includes(hint)) && aboutMoney;
}

export function keepMessage(
  row: { address: string; body: string; receivedAt: number },
  rules: InboxRules,
  now: number,
) {
  if (rules.cleanDays > 0 && now - row.receivedAt > rules.cleanDays * 24 * 60 * 60 * 1000) return false;
  const text = `${row.address} ${row.body}`.toLowerCase();
  if (rules.keywords.some((word) => word.trim().length >= 3 && text.includes(word.trim().toLowerCase()))) return false;
  if (!rules.whitelistOn) return isPayment(row.address, row.body);
  return rules.senders.some((sender) => sender.enabled && matchesSender(row.address, row.body, sender.name));
}

export function senderLabel(address: string, body: string, senders: Sender[]) {
  const hit = senders
    .filter((sender) => matchesSender(address, body, sender.name))
    .sort((left, right) => right.name.length - left.name.length)[0];
  if (hit) return hit.name;
  const text = `${address} ${body}`.toLowerCase();
  if (text.includes("bkash") || text.includes("16216")) return "bKash";
  if (text.includes("nagad")) return "Nagad";
  if (text.includes("rocket")) return "Rocket";
  if (text.includes("upay")) return "Upay";
  return address || "SMS";
}
