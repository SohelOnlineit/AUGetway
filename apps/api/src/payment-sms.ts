const PAYMENT_SENDERS = [
  "16216",
  "16269",
  "16316",
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
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function localDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("880") ? digits.slice(3) : digits;
}

function senderMatches(address: string, name: string) {
  const needle = name.trim().toLowerCase();
  const from = address.trim().toLowerCase();
  if (!needle || !from) return false;
  if (/^\d+$/.test(needle)) return localDigits(from) === needle;
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

export function isPaymentSender(sender: string) {
  const from = sender.trim();
  if (!from || isPersonalNumber(from)) return false;
  return PAYMENT_SENDERS.some((name) => senderMatches(from, name));
}
