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

const WALLET_BRANDS: [string, string[]][] = [
  ["bkash", ["bkash"]],
  ["nagad", ["nagad"]],
  ["rocket", ["rocket", "16216", "dbbl"]],
  ["upay", ["upay"]],
  ["cellfin", ["cellfin"]],
];

const STRONG_DEBIT = ["transferred to", "transfer to", "sent to", "send money", "cash out", "payment to", "debited", "deducted"];
const WEAK_DEBIT = ["reserved for", "bill successfully paid", "biller:", "mobile recharge", "recharge of", "purchased", "payment of", "recharge"];

function walletBrand(value: string) {
  const text = value.toLowerCase();
  return WALLET_BRANDS.find(([, words]) => words.some((word) => text.includes(word)))?.[0] ?? "";
}

export function trxRefOk(value: string) {
  return /^(?=.*[A-Z])[A-Z0-9]{8,20}$/.test(value);
}

export function readTrxId(body: string) {
  const match = body.match(/(?:trx\s*id|trxid|txn\s*id|txnid|transaction\s*id|trx\s*code|transaction\s*no|trans\s*id)[\s:]+([A-Za-z0-9]{8,20})(?![A-Za-z0-9])/i);
  if (!match) return "";
  const ref = match[1].toUpperCase();
  return trxRefOk(ref) ? ref : "";
}

export function readPaidAmount(body: string) {
  const patterns = [
    /(?:amount|amt)\s*[:\s]\s*(?:tk|bdt|taka|৳)?\.?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi,
    /(?:received|credited|deposit|cash\s*in)[\s\S]{0,48}?(?:tk|bdt|taka|৳)\.?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi,
    /(?:tk|bdt|taka|৳)\.?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi,
  ];
  for (const pattern of patterns) {
    const matches = body.matchAll(pattern);
    for (const match of matches) {
      const amount = Number(match[1].replace(/,/g, ""));
      if (Number.isFinite(amount) && amount > 0) return amount;
    }
  }
  return null;
}

export function isCreditMessage(body: string) {
  const lower = body.toLowerCase();
  return ["received", "cash in", "deposit", "credited", "credit to"].some((hint) => lower.includes(hint));
}

export function isDebitMessage(body: string) {
  const lower = body.toLowerCase();
  if (STRONG_DEBIT.some((hint) => lower.includes(hint))) return true;
  if (isCreditMessage(body)) return false;
  return WEAK_DEBIT.some((hint) => lower.includes(hint));
}

export function senderFitsMethod(sender: string, body: string, label: string) {
  const labelBrand = walletBrand(label);
  const senderBrand = walletBrand(sender);
  if (!labelBrand) return isPaymentSender(sender);
  if (senderBrand) return senderBrand === labelBrand;
  return walletBrand(body) === labelBrand;
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
