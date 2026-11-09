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

function paymentSignals(body: string) {
  return {
    trx: /(?:trx\s*id|trxid|txn\s*id|transaction\s*id)[:\s]*[A-Z0-9]{6,}/i.test(body),
    amount: /(?:tk|bdt|৳)\s*[0-9]/i.test(body) || /[0-9][0-9,]*\.[0-9]{2}/.test(body),
  };
}

export function trxRefOk(value: string) {
  return /^(?=.*[A-Z])[A-Z0-9]{8,20}$/.test(value);
}

export function bodyHasRef(body: string, ref: string) {
  const upper = body.toUpperCase();
  let from = 0;
  while (from < upper.length) {
    const index = upper.indexOf(ref, from);
    if (index < 0) return false;
    const before = upper[index - 1] ?? " ";
    const after = upper[index + ref.length] ?? " ";
    const beforeOk = !/[A-Z0-9.]/.test(before);
    const afterOk = !/[A-Z0-9]/.test(after) && !(after === "." && /^[0-9]+$/.test(ref));
    if (beforeOk && afterOk) return true;
    from = index + 1;
  }
  return false;
}

export function acceptInboundSms(sender: string, body: string) {
  const text = body.trim();
  if (text.length < 4 || text.length > 500) return false;
  if (isOtpMessage(text) || isPersonalNumber(sender)) return false;
  const proof = paymentSignals(text);
  if (!sender.trim() || isPaymentSender(sender)) return proof.trx || proof.amount;
  return proof.trx && proof.amount;
}
