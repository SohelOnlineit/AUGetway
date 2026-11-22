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

/** The payment app names itself this way. A browser is not allowed to change its User-Agent, so the website cannot pretend to be the phone. */
export function isPaymentApp(userAgent: string | undefined): boolean {
  return typeof userAgent === "string" && /^\s*AU-Getway\//i.test(userAgent);
}

export function wantsHandset(secFetchSite: string | undefined, client: string | undefined, userAgent?: string): boolean {
  if (client === "desk") return false;
  // The installed app can be told apart by its name. Some phone HTTP stacks also send Sec-Fetch-Site,
  // and that must not force the website's security check onto the phone, or the phone can never sign in.
  if (isPaymentApp(userAgent)) return true;
  if (typeof secFetchSite === "string") return false;
  return true;
}
