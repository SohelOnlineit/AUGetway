import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const EmbeddedPostgres = require("embedded-postgres").default;

const port = 5433;
const databaseDir = path.resolve(process.cwd(), ".pgdata");
const ready = path.join(databaseDir, "PG_VERSION");

function portOpen() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(800);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

if (await portOpen()) {
  console.log(`PostgreSQL already listening on 127.0.0.1:${port}`);
  process.exit(0);
}

await mkdir(databaseDir, { recursive: true });

const postgres = new EmbeddedPostgres({
  databaseDir,
  user: "uniqpay",
  password: "uniqpay_local",
  port,
  persistent: true,
});

if (!existsSync(ready)) {
  await postgres.initialise();
}
await postgres.start();
try {
  await postgres.createDatabase("uniqpay");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!/already exists/i.test(message)) throw error;
}

console.log("PostgreSQL ready on 127.0.0.1:5433 database uniqpay");

await new Promise((resolve) => {
  const stop = async () => {
    await postgres.stop();
    resolve();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
});
