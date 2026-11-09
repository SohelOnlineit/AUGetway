import { BadRequestException } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function ipv4Private(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 168 || b === 0)) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

export function isPrivateAddress(address: string) {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(mapped) === 4) return ipv4Private(mapped);
  if (isIP(ip) !== 6) return true;
  if (ip === "::1" || ip === "::") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("ff")) return true;
  if (/^fe[89ab]/.test(ip)) return true;
  return false;
}

function blockedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "metadata.google.internal" || host === "metadata.google.com") return true;
  if (/^\d+$/.test(host)) return true;
  return false;
}

export async function publicHttpUrl(value: string | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException("Webhook URL must start with http:// or https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BadRequestException("Webhook URL must start with http:// or https://");
  }
  if (url.username || url.password || blockedHost(url.hostname)) {
    throw new BadRequestException("Use a public http or https webhook address");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new BadRequestException("Use a public http or https webhook address");
    return url.toString();
  }
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new BadRequestException("Webhook address could not be resolved");
  }
  if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
    throw new BadRequestException("Use a public http or https webhook address");
  }
  return url.toString();
}
