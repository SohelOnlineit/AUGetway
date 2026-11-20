/** Who currently has a live chat socket. A short grace stops reconnects from flashing offline. */
export class ChatPresenceRegistry {
  private readonly counts = new Map<string, number>();
  private readonly pending = new Set<string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly graceMs: number;

  constructor(graceMs = 2500) {
    this.graceMs = graceMs;
  }

  isOnline(userId: string): boolean {
    return this.counts.has(userId) || this.pending.has(userId);
  }

  /** Returns true when the user was offline and this socket makes them online. */
  connect(userId: string): boolean {
    const staying = this.pending.has(userId);
    const timer = this.timers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(userId);
    }
    this.pending.delete(userId);
    const next = (this.counts.get(userId) ?? 0) + 1;
    this.counts.set(userId, next);
    return next === 1 && !staying;
  }

  /**
   * Drop one socket. Returns true while another socket is still open.
   * The last socket stays online through the grace window, then `onOffline` runs.
   */
  release(userId: string, onOffline: (userId: string) => void): boolean {
    const next = (this.counts.get(userId) ?? 1) - 1;
    if (next > 0) {
      this.counts.set(userId, next);
      return true;
    }
    this.counts.delete(userId);
    this.pending.add(userId);
    const existing = this.timers.get(userId);
    if (existing) clearTimeout(existing);
    this.timers.set(
      userId,
      setTimeout(() => {
        this.timers.delete(userId);
        if (this.counts.has(userId)) return;
        this.pending.delete(userId);
        onOffline(userId);
      }, this.graceMs),
    );
    return false;
  }
}
