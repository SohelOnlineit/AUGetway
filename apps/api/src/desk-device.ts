/**
 * The phone app and the website used to share one kind of sign-in token. A stolen website token could then
 * pretend to be the phone and send a fake payment message. Tokens say which one they are. A token from before
 * that mark is told apart by how long it lasts: the phone asked for 5 years, the website for 7 days.
 */
export function tokenDevice(payload: { device?: string; exp?: number; iat?: number }): "desk" | "handset" {
  if (payload.device === "handset" || payload.device === "desk") return payload.device;
  const life = (payload.exp ?? 0) - (payload.iat ?? 0);
  return life > 30 * 24 * 60 * 60 ? "handset" : "desk";
}
