#!/usr/bin/env node
/**
 * Fail the build if NestJS major >= 12 or Prisma major >= 8 sneaks into the lockfile.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function majorOf(version) {
  const cleaned = String(version).replace(/^[^\d]*/, "");
  const major = Number.parseInt(cleaned.split(".")[0] ?? "", 10);
  if (Number.isNaN(major)) {
    throw new Error(`Could not parse major version from "${version}"`);
  }
  return major;
}

function readPkgVersion(pkgName) {
  try {
    const pkgJson = require(join(root, "node_modules", pkgName, "package.json"));
    return pkgJson.version;
  } catch {
    // Workspace packages may resolve under apps/api/node_modules with pnpm
    try {
      const resolved = require.resolve(`${pkgName}/package.json`, {
        paths: [
          join(root, "apps/api"),
          join(root, "apps/web"),
          root,
        ],
      });
      return require(resolved).version;
    } catch (error) {
      throw new Error(`Unable to resolve ${pkgName}: ${error.message}`);
    }
  }
}

const checks = [
  { name: "@nestjs/core", maxMajorExclusive: 12 },
  { name: "@nestjs/common", maxMajorExclusive: 12 },
  { name: "prisma", maxMajorExclusive: 8 },
  { name: "@prisma/client", maxMajorExclusive: 8 },
];

let failed = false;
for (const check of checks) {
  const version = readPkgVersion(check.name);
  const major = majorOf(version);
  if (major >= check.maxMajorExclusive) {
    console.error(
      `[guard:versions] REJECTED ${check.name}@${version} (major must be < ${check.maxMajorExclusive})`,
    );
    failed = true;
  } else {
    console.log(`[guard:versions] OK ${check.name}@${version}`);
  }
}

if (failed) {
  process.exit(1);
}
