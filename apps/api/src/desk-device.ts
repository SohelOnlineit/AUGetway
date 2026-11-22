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

/**
 * A browser always sends Sec-Fetch-Site, so it cannot take the phone sign-in.
 * The payment app does not send that header. Older builds also omit client:"handset", and those must still
 * sign in as the phone. Otherwise the app stays open on a website token, payment SMS never reach the desk,
 * and the payment shows as failed.
 */
export function wantsHandset(secFetchSite: string | undefined, client: string | undefined): boolean {
  if (typeof secFetchSite === "string") return false;
  return client !== "desk";
}
