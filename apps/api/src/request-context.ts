import { AsyncLocalStorage } from "node:async_hooks";

/** What the API knows about the address a visitor came in on. */
export type RequestInfo = {
  /** Lower case, no port. May still start with api. (the address programs use). */
  host: string;
  /** ":3100" in local testing, empty on the real sites. */
  port: string;
  proto: "http" | "https";
};

const store = new AsyncLocalStorage<RequestInfo>();

/** Runs the rest of the request with its address known. Every function called from it can read currentRequest(). */
export function runWithRequest<T>(info: RequestInfo, work: () => T): T {
  return store.run(info, work);
}

export function currentRequest(): RequestInfo | undefined {
  return store.getStore();
}

/**
 * Behind nginx the Host header is the real website address, and that is what counts. Only when the API is reached
 * through the local Next.js dev server (its Host is 127.0.0.1 or localhost, because Next rewrites it) is the
 * X-Forwarded-Host header used. A visitor of the live site cannot use that to pose as another address.
 */
export function pickHostHeader(host: string | undefined, forwarded: string | string[] | undefined): string | undefined {
  const own = (host ?? "").trim().toLowerCase();
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(own);
  return local && first ? first : host;
}

/** Splits a Host header into host and port. */
export function describeRequest(hostHeader: string | undefined, protocol: string | undefined): RequestInfo {
  const raw = (hostHeader ?? "").trim().toLowerCase();
  const match = /^(.*?)(?::(\d{1,5}))?$/.exec(raw);
  const host = (match?.[1] ?? "").replace(/\.$/, "");
  const port = match?.[2] ? `:${match[2]}` : "";
  return { host, port, proto: protocol === "https" ? "https" : "http" };
}

/**
 * The names a request address could be registered under. `api.pay.amarpin.com` is the program address of
 * `pay.amarpin.com`, so both are tried, the exact one first.
 */
export function hostCandidates(host: string): string[] {
  const clean = host.trim().toLowerCase().replace(/:\d{1,5}$/, "").replace(/\.$/, "");
  if (!clean) return [];
  const out = [clean];
  if (clean.startsWith("api.") && clean.split(".").length > 2) out.push(clean.slice(4));
  return out;
}

/** A website address that may be registered: a normal domain name, or localhost for testing. */
export function isValidSiteHost(value: string): boolean {
  if (value === "localhost") return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return true;
  return /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value);
}

/** What a person typed into the Domains page, cleaned: lower case, no scheme, no path, no port, no trailing dot. */
export function cleanSiteHost(value: string): string {
  let host = value.trim().toLowerCase();
  host = host.replace(/^[a-z]+:\/\//, "");
  host = host.split(/[/?#]/)[0] ?? "";
  host = host.replace(/:\d{1,5}$/, "").replace(/\.$/, "");
  return host;
}
