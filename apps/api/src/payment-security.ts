/** Exact sender labels copied for monitoring. A mismatch is only a log, never a rejection. */
const EXACT_SENDERS = [
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

export const HANDSET_BURST_LIMIT = 10;
export const HANDSET_BURST_WINDOW_MS = 10 * 60 * 1000;

export const SECURITY_KINDS = [
  "suspicious_sender",
  "repeated_trx",
  "high_frequency",
  "unique_amount_without_ref",
  "unmatched_sms",
  "duplicate_submission",
] as const;

export type SecurityKind = (typeof SECURITY_KINDS)[number];

export type OpenCheckoutSnap = {
  id: string;
  publicId: string;
  providerRef: string;
  status: string;
  verifyBy: string;
};

export type SecurityEventDraft = {
  kind: SecurityKind;
  sender: string;
  trxId: string;
  checkoutId: string;
  detail: string;
};

export type NoticeWatch = {
  sender: string;
  body: string;
  /** TrxID already extracted by the existing parser. Monitoring does not parse payments itself. */
  trxId: string;
  duplicate: boolean;
  /** Public checkout id returned by matchOwner, when this notice was matched. */
  matchedPublicId: string | null;
  recentNoticeCount: number;
  openBefore: OpenCheckoutSnap[];
  openAfter: OpenCheckoutSnap[];
};

const NOT_PROOF = "This log does not prove or disprove who sent the SMS.";

export function exactKnownSender(sender: string): boolean {
  const from = sender.trim().toLowerCase();
  if (!from) return false;
  return EXACT_SENDERS.some((name) => {
    if (/^\d+$/.test(name)) {
      const digits = from.replace(/\D/g, "");
      const local = digits.startsWith("880") ? digits.slice(3) : digits;
      return local === name;
    }
    return from === name.toLowerCase();
  });
}

export function classifyNotice(input: NoticeWatch): SecurityEventDraft[] {
  const sender = input.sender.trim();
  const trxId = input.trxId.trim().toUpperCase();
  const events: SecurityEventDraft[] = [];

  if (!exactKnownSender(sender)) {
    events.push({
      kind: "suspicious_sender",
      sender,
      trxId,
      checkoutId: "",
      detail: `Sender "${sender.slice(0, 80)}" is not an exact known wallet sender. ${NOT_PROOF}`,
    });
  }

  if (input.duplicate) {
    events.push({
      kind: "duplicate_submission",
      sender,
      trxId,
      checkoutId: "",
      detail: `The same handset submission key was received again. ${NOT_PROOF}`,
    });
    return events;
  }

  const prior = input.openBefore.find((row) => row.providerRef.trim().toUpperCase() === trxId && trxId);
  const matched = input.matchedPublicId
    ? input.openAfter.find((row) => row.publicId === input.matchedPublicId) ?? null
    : null;
  if (prior && prior.publicId !== input.matchedPublicId) {
    events.push({
      kind: "repeated_trx",
      sender,
      trxId,
      checkoutId: prior.id,
      detail: `TrxID ${trxId} is already stored on another checkout. ${NOT_PROOF}`,
    });
  }

  if (input.recentNoticeCount >= HANDSET_BURST_LIMIT) {
    events.push({
      kind: "high_frequency",
      sender,
      trxId,
      checkoutId: "",
      detail: `This handset saved ${input.recentNoticeCount} payment SMS in ${HANDSET_BURST_WINDOW_MS / 60000} minutes. ${NOT_PROOF}`,
    });
  }

  const before = matched ? input.openBefore.find((row) => row.id === matched.id) : undefined;
  if (
    before
    && matched
    && before.verifyBy === "unique_amount"
    && !before.providerRef.trim()
    && before.status !== matched.status
    && (matched.status === "paid" || matched.status === "pending")
  ) {
    events.push({
      kind: "unique_amount_without_ref",
      sender,
      trxId,
      checkoutId: matched.id,
      detail: `A unique-amount checkout was approved with no providerRef stored beforehand. ${NOT_PROOF}`,
    });
  }

  if (!input.matchedPublicId) {
    events.push({
      kind: "unmatched_sms",
      sender,
      trxId,
      checkoutId: "",
      detail: `A payment SMS was saved and did not match a checkout. ${NOT_PROOF}`,
    });
  }

  return events;
}

export function repeatedClaimEvent(trxId: string, checkoutId: string): SecurityEventDraft {
  return {
    kind: "repeated_trx",
    sender: "",
    trxId,
    checkoutId,
    detail: `TrxID ${trxId} was submitted again for another checkout. ${NOT_PROOF}`,
  };
}

/** Schedules monitoring and never changes the payment result, even when the write fails. */
export function watchInBackground(write: () => Promise<void>): void {
  void write().catch(() => undefined);
}

/**
 * Runs payment matching immediately. The snapshot promise is only read after matching,
 * and a failed snapshot becomes an empty list.
 */
export async function matchWithoutWaitingForSnapshot<T>(
  snapshot: Promise<OpenCheckoutSnap[]>,
  match: () => Promise<T>,
  watch: (result: T, openBefore: OpenCheckoutSnap[]) => void,
): Promise<T> {
  const settled = snapshot.catch(() => [] as OpenCheckoutSnap[]);
  const matched = await match();
  watchInBackground(async () => {
    watch(matched, await settled);
  });
  return matched;
}
