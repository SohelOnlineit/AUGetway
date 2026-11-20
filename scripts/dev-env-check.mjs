#!/usr/bin/env node
/**
 * Local dev sanity: DB target + JWT secret alignment (web must match API).
 * Run from repo root: node scripts/dev-env-check.mjs
 *   or: pnpm dev:env-check
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/** Minimal KEY=VALUE parser for .env (no multiline values). */
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function sanitizeDatabaseUrl(url) {
  try {
    const u = new URL(url);
    const user = u.username ? `${u.username}@` : "";
    return `${u.protocol}//${user}${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "")}${u.search}`;
  } catch {
    return "(could not parse DATABASE_URL)";
  }
}

const rootEnv = loadEnvFile(join(root, ".env"));
const webEnv = loadEnvFile(join(root, "apps/web/.env.local"));

const dbUrl = rootEnv.DATABASE_URL;
console.log("=== AuGetway local dev check ===\n");

if (!dbUrl) {
  console.error("DATABASE_URL is missing in repo-root .env\n");
  process.exit(1);
}
console.log("API / Prisma DATABASE_URL (password hidden):");
console.log(`  ${sanitizeDatabaseUrl(dbUrl)}\n`);

const apiJwt = rootEnv.JWT_ACCESS_SECRET?.trim();
if (!apiJwt) {
  console.error("JWT_ACCESS_SECRET is missing in repo-root .env (min 32 chars).\n");
  process.exit(1);
}

const webJwt = webEnv.AUTH_JWT_ACCESS_SECRET?.trim();

console.log("JWT access secret alignment (Next verifies tokens the API signs):");
console.log(`  Root .env JWT_ACCESS_SECRET length: ${apiJwt.length} chars`);
if (!webJwt) {
  console.warn(
    "  apps/web/.env.local: AUTH_JWT_ACCESS_SECRET not found — add it and match JWT_ACCESS_SECRET from root .env",
  );
  console.warn("  Without this, login may succeed but /admin or /dashboard can look \"logged out\".\n");
} else {
  console.log(`  apps/web/.env.local AUTH_JWT_ACCESS_SECRET length: ${webJwt.length} chars`);
  if (apiJwt !== webJwt) {
    console.error("\n  MISMATCH: Copy JWT_ACCESS_SECRET from repo-root .env to AUTH_JWT_ACCESS_SECRET in apps/web/.env.local\n");
    process.exit(1);
  }
  console.log("  OK: secrets match.\n");
}

console.log("If login says \"Invalid email or password\" but VPS works with the same DB:");
console.log("  - Restart the local API after changing .env.");
console.log("  - Confirm DB: pnpm --filter @amarpin/api exec prisma migrate status --schema prisma/schema.prisma");
console.log("  - Use the same VPS credentials, or run: pnpm --filter @amarpin/api seed:identity\n");
