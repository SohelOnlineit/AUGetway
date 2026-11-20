/**
 * Messenger-style message pop, matching the amarpin live-chat tone.
 * Web Audio only — no bundled audio file.
 */

let audioCtx: AudioContext | null = null;
const heardMessageIds = new Set<string>();

/** One alert per new message, and only while that chat is not on screen. */
export function shouldAlertChatMessage(
  message: { id: string; createdAt: string },
  viewing: boolean,
): boolean {
  if (viewing && typeof document !== "undefined" && document.visibilityState === "visible") return false;
  const at = Date.parse(message.createdAt);
  if (!Number.isFinite(at)) return false;
  const age = Date.now() - at;
  if (age > 12_000 || age < -5_000) return false;
  if (heardMessageIds.has(message.id)) return false;
  heardMessageIds.add(message.id);
  if (heardMessageIds.size > 200) {
    const oldest = heardMessageIds.values().next().value;
    if (oldest) heardMessageIds.delete(oldest);
  }
  return true;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

export function silenceChatNotificationSound(): void {
  /* A blocked tone is dropped. It is not saved for a later click. */
}

export async function unlockChatNotificationSound(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "suspended") return;
  try {
    await ctx.resume();
  } catch {
    /* the next real message can try again */
  }
}

export function playChatNotificationSound(): void {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("native-app")) {
    return;
  }
  try {
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== "running") return;
    startTone(ctx);
  } catch {
    /* autoplay can block the tone until the next click */
  }
}

function startTone(ctx: AudioContext): void {
  try {
    const now = ctx.currentTime;
    const duration = 0.14;

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(987.77, now);
    osc.frequency.exponentialRampToValueAtTime(587.33, now + 0.065);
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(0.5, now + 0.007);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);

    const bufferSize = Math.floor(ctx.sampleRate * 0.025);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      const decay = 1 - i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * decay * decay;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1400;
    filter.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.14, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
  } catch {
    /* autoplay can block the tone until the next click */
  }
}
