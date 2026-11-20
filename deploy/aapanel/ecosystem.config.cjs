/**
 * Unused. Production processes are systemd units in deploy/ubuntu/.
 * aaPanel only terminates the domain and SSL.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const LOG_DIR = path.join(ROOT, "deploy", "aapanel", "logs");

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function loadDotEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) env[key] = value;
  }
  return env;
}

ensureLogDir();
const rootEnv = loadDotEnv(path.join(ROOT, ".env"));
const webEnv = {
  ...loadDotEnv(path.join(ROOT, "apps", "web", ".env.production.local")),
  ...loadDotEnv(path.join(ROOT, "apps", "web", ".env.local")),
};

module.exports = {
  apps: [
    {
      name: "amarpin-api",
      cwd: path.join(ROOT, "apps/api"),
      script: "dist/main.js",
      instances: 1,
      exec_mode: "fork",
      kill_timeout: 8_000,
      max_memory_restart: "512M",
      out_file: path.join(LOG_DIR, "api-out.log"),
      error_file: path.join(LOG_DIR, "api-error.log"),
      merge_logs: true,
      env: {
        NODE_ENV: "production",
        // Sandbox must stay off in production even if .env was copied from dev.
        PAYMENT_SANDBOX_ENABLED: "false",
        ...rootEnv,
        NODE_ENV: "production",
        PAYMENT_SANDBOX_ENABLED: "false",
      },
    },
    {
      name: "amarpin-web",
      cwd: path.join(ROOT, "apps/web"),
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3000 --hostname 127.0.0.1",
      instances: 1,
      exec_mode: "fork",
      kill_timeout: 8_000,
      max_memory_restart: "768M",
      out_file: path.join(LOG_DIR, "web-out.log"),
      error_file: path.join(LOG_DIR, "web-error.log"),
      merge_logs: true,
      env: {
        NODE_ENV: "production",
        ...webEnv,
        NODE_ENV: "production",
      },
    },
  ],
};
