import { BadRequestException } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
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
  // An IPv4 address written in hex, like ::ffff:7f00:1, is the same host as 127.0.0.1.
  const hex = /^(?:0:0:0:0:0:ffff|::ffff):([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return ipv4Private(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  if (ip === "::1" || ip === "::") return true;
  if (ip.startsWith("64:ff9b:")) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("ff")) return true;
  if (/^fe[89abcdef]/.test(ip)) return true;
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

export function browserHttpUrl(value: string | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    throw new BadRequestException("That address must start with http:// or https://");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException("That address must start with http:// or https://");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || !url.hostname) {
    throw new BadRequestException("That address must start with http:// or https://");
  }
  return url.toString();
}

export async function postPublicJson(value: string, body: string, extraHeaders: Record<string, string> = {}) {
  const target = await publicHttpUrl(value);
  if (!target) return;
  const url = new URL(target);
  const records = await lookup(url.hostname, { all: true, verbatim: true });
  const chosen = records.find((record) => !isPrivateAddress(record.address));
  if (!chosen || records.some((record) => isPrivateAddress(record.address))) return;
  const family = chosen.family === 6 ? 6 : 4;
  const lib = url.protocol === "https:" ? https : http;
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  await new Promise<void>((resolve, reject) => {
    const request = lib.request(
      {
        host: chosen.address,
        servername: url.hostname,
        port,
        family,
        method: "POST",
        path: `${url.pathname}${url.search}`,
        headers: {
          ...extraHeaders,
          host: url.host,
          "content-type": "application/json",
          accept: "application/json",
          "content-length": Buffer.byteLength(body),
        },
        timeout: 8000,
      },
      (response) => {
        response.resume();
        resolve();
      },
    );
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.end(body);
  });
}
