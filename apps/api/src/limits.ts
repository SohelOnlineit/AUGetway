import { isIP } from "node:net";

type Slot = { count: number; reset: number };

/**
 * Fixed-window counters kept in memory. The API runs as one process, so this is enough,
 * and a restart only forgets the counts. The map is capped so many different keys cannot grow it without limit.
 */
export class WindowCounter {
  private readonly slots = new Map<string, Slot>();
  private readonly maxKeys: number;

  constructor(maxKeys = 20_000) {
    this.maxKeys = maxKeys;
  }

  /** Adds one to the key. Returns how many seconds to wait when the limit is passed, otherwise 0. */
  hit(key: string, limit: number, windowMs: number, now = Date.now()): number {
    const slot = this.add(key, windowMs, now);
    if (slot.count <= limit) return 0;
    return Math.max(1, Math.ceil((slot.reset - now) / 1000));
  }

  /** Adds one to the key and starts a new window when the old one ended. */
  add(key: string, windowMs: number, now = Date.now()): Slot {
    const current = this.slots.get(key);
    if (current && current.reset > now) {
      current.count += 1;
      return current;
    }
    this.makeRoom(now);
    const fresh = { count: 1, reset: now + windowMs };
    this.slots.set(key, fresh);
    return fresh;
  }

  /** The count in the current window, without adding to it. */
  count(key: string, now = Date.now()): number {
    const current = this.slots.get(key);
    return current && current.reset > now ? current.count : 0;
  }

  forget(key: string) {
    this.slots.delete(key);
  }

  get size() {
    return this.slots.size;
  }

  private makeRoom(now: number) {
    if (this.slots.size < this.maxKeys) return;
    for (const [key, slot] of this.slots) {
      if (slot.reset <= now) this.slots.delete(key);
    }
    if (this.slots.size < this.maxKeys) return;
    // Still full: drop the oldest tenth. Map keeps insertion order, so the first keys are the oldest.
    let drop = Math.ceil(this.maxKeys / 10);
    for (const key of this.slots.keys()) {
      this.slots.delete(key);
      drop -= 1;
      if (drop <= 0) break;
    }
  }
}

/** One IPv6 user can own a whole /64, so IPv6 clients are counted by that prefix. */
export function normalizeAddress(raw: string): string {
  let address = raw.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const zone = address.indexOf("%");
  if (zone >= 0) address = address.slice(0, zone);
  if (address.startsWith("::ffff:") && isIP(address.slice(7)) === 4) return address.slice(7);
  if (isIP(address) !== 6) return address;
  const [head, tail = ""] = address.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = address.includes("::") ? Math.max(0, 8 - headParts.length - tailParts.length) : 0;
  const groups = [...headParts, ...Array<string>(missing).fill("0"), ...tailParts];
  return `${groups.slice(0, 4).map((group) => group.padStart(4, "0")).join(":")}::/64`;
}

/** `::1` becomes the all-zero /64 after normalizeAddress, so that prefix counts as this machine too. */
export function isLoopback(address: string) {
  return address === "127.0.0.1" || address === "0000:0000:0000:0000::/64";
}

/**
 * Wrong-password limits. One person at one address may miss a few times. A whole address, or one account
 * from everywhere, gets a larger allowance, so a single attacker cannot lock the real admin out by guessing
 * from one place, and many addresses together still cannot guess without limit.
 */
export class LoginThrottle {
  private readonly failures = new WindowCounter(5000);
  private readonly windowMs: number;
  private readonly pairLimit: number;
  private readonly addressLimit: number;
  private readonly accountLimit: number;

  constructor(windowMs = 15 * 60 * 1000, pairLimit = 8, addressLimit = 30, accountLimit = 60) {
    this.windowMs = windowMs;
    this.pairLimit = pairLimit;
    this.addressLimit = addressLimit;
    this.accountLimit = accountLimit;
  }

  private keys(subject: string, address: string) {
    return { pair: `pair|${subject}|${address}`, address: `ip|${address}`, account: `acct|${subject}` };
  }

  /** True while this person, address or account has failed too often. `address` may be empty. */
  blocked(subject: string, address = "", now = Date.now()): boolean {
    const key = this.keys(subject, address);
    if (this.failures.count(key.account, now) >= this.accountLimit) return true;
    if (address === "") return false;
    return this.failures.count(key.pair, now) >= this.pairLimit || this.failures.count(key.address, now) >= this.addressLimit;
  }

  fail(subject: string, address = "", now = Date.now()) {
    const key = this.keys(subject, address);
    this.failures.add(key.account, this.windowMs, now);
    if (address === "") return;
    this.failures.add(key.pair, this.windowMs, now);
    this.failures.add(key.address, this.windowMs, now);
  }

  /**
   * A good sign-in clears only this person's own count. The address and account counts stay,
   * so signing in to a different account cannot reset them.
   */
  clear(subject: string, address = "") {
    this.failures.forget(this.keys(subject, address).pair);
  }
}
