import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { once } from "node:events";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { chmod, lstat, mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import type { Readable, Writable } from "node:stream";
import { finished } from "node:stream/promises";
import { Client } from "pg";

const SAVED_FILE = /^augetway-database-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}(?:-\d+)?\.sql$/;
const DAILY_ZONE = "Asia/Dhaka";
const DAILY_HOUR = 5;
const KEEP_DAYS = 60;

type Column = { name: string; udt: string };
type ForeignKey = { child: string; parent: string; column: string };

export type SavedBackup = { name: string; bytes: number; savedAt: string };

/**
 * Database backups for AU-Getway. A copy is saved every day at 05:00 (Asia/Dhaka),
 * kept for 60 days, and can be saved or downloaded by the main admin.
 * The file is plain SQL. Restore it with psql (see deploy/ubuntu/README.md).
 */
@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupService.name);
  private running = false;
  private dailyTimer: NodeJS.Timeout | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    void this.startSchedule();
  }

  onModuleDestroy() {
    if (this.dailyTimer) clearTimeout(this.dailyTimer);
  }

  status() {
    return {
      database: Boolean(this.config.get<string>("DATABASE_URL")),
      dailySave: "05:00 Asia/Dhaka",
      keepDays: KEEP_DAYS,
      includes: ["All database tables"],
    };
  }

  private async startSchedule() {
    try {
      await this.pruneOldFiles();
      await this.catchUp();
    } catch {
      this.logger.warn("Backup start-up check failed");
    }
    this.scheduleNext();
  }

  private scheduleNext() {
    if (this.dailyTimer) clearTimeout(this.dailyTimer);
    this.dailyTimer = setTimeout(() => {
      void this.runDaily().finally(() => this.scheduleNext());
    }, this.millisecondsUntilDaily());
    this.dailyTimer.unref();
  }

  // If the server was off at 05:00, save once as soon as it starts.
  private async catchUp() {
    const due = this.todayAtFive().getTime();
    if (Number.isNaN(due) || Date.now() < due) return;
    const files = await this.listFiles().catch(() => []);
    if (files.some((file) => Date.parse(file.savedAt) >= due)) return;
    await this.saveQuiet();
  }

  private async runDaily() {
    await this.saveQuiet();
    await this.pruneOldFiles().catch(() => undefined);
  }

  private async saveQuiet() {
    try {
      const saved = await this.saveDatabase();
      this.logger.log(`Saved database backup ${saved.name}`);
    } catch (error) {
      if (error instanceof ConflictException) return;
      this.logger.warn("Daily database backup failed");
    }
  }

  private todayAtFive() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: DAILY_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return new Date(`${value("year")}-${value("month")}-${value("day")}T0${DAILY_HOUR}:00:00+06:00`);
  }

  private millisecondsUntilDaily() {
    const due = this.todayAtFive().getTime();
    if (Number.isNaN(due)) return 24 * 60 * 60 * 1000;
    const wait = due - Date.now();
    return wait > 0 ? wait : wait + 24 * 60 * 60 * 1000;
  }

  private async pruneOldFiles() {
    const dir = this.backupsDir();
    if (!existsSync(dir)) return;
    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
    for (const name of (await readdir(dir)).filter((item) => SAVED_FILE.test(item))) {
      const target = path.join(dir, name);
      const info = await lstat(target).catch(() => null);
      if (!info?.isFile() || info.mtimeMs >= cutoff) continue;
      await unlink(target).catch(() => undefined);
      this.logger.log(`Removed backup older than ${KEEP_DAYS} days: ${name}`);
    }
  }

  async listFiles(): Promise<SavedBackup[]> {
    const dir = this.backupsDir();
    if (!existsSync(dir)) return [];
    const files: SavedBackup[] = [];
    for (const name of (await readdir(dir)).filter((item) => SAVED_FILE.test(item))) {
      try {
        const info = await lstat(path.join(dir, name));
        if (!info.isFile()) continue;
        files.push({ name, bytes: info.size, savedAt: info.mtime.toISOString() });
      } catch {
        continue;
      }
    }
    return files.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  }

  async saveDatabase(): Promise<SavedBackup> {
    const dir = await this.ensurePrivateDir();
    const name = this.uniqueName(dir);
    const target = path.join(dir, name);
    await this.occupy(() => this.writeDatabaseFile(target));
    const info = await lstat(target);
    await this.pruneOldFiles().catch(() => undefined);
    return { name, bytes: info.size, savedAt: info.mtime.toISOString() };
  }

  async openFile(name: string): Promise<{ stream: Readable; bytes: number }> {
    const target = this.savedFile(name);
    const info = await lstat(target).catch(() => null);
    if (!info) throw new NotFoundException("Saved file was not found");
    if (info.isSymbolicLink()) {
      await unlink(target).catch(() => undefined);
      throw new NotFoundException("Saved file was not found");
    }
    if (!info.isFile()) throw new NotFoundException("Saved file was not found");
    return { stream: createReadStream(target), bytes: info.size };
  }

  async deleteFile(name: string) {
    const target = this.savedFile(name);
    const info = await lstat(target).catch(() => null);
    if (!info) throw new NotFoundException("Saved file was not found");
    if (!info.isFile()) {
      if (info.isSymbolicLink()) await unlink(target).catch(() => undefined);
      throw new NotFoundException("Saved file was not found");
    }
    await unlink(target);
  }

  private async occupy<T>(work: () => Promise<T>): Promise<T> {
    if (this.running) throw new ConflictException("A backup is already running");
    this.running = true;
    try {
      return await work();
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) throw error;
      this.logger.warn(`Backup failed: ${error instanceof Error ? error.message : "unknown error"}`);
      throw new ServiceUnavailableException("Backup failed");
    } finally {
      this.running = false;
    }
  }

  private uniqueName(dir: string) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    let name = `augetway-database-${stamp}.sql`;
    let extra = 2;
    while (existsSync(path.join(dir, name))) {
      name = `augetway-database-${stamp}-${extra}.sql`;
      extra += 1;
    }
    return name;
  }

  private databaseUrl() {
    const url = this.config.get<string>("DATABASE_URL")?.trim();
    if (!url) throw new ServiceUnavailableException("Database backup is not configured");
    // A pooled Neon host cannot hold a long dump. Use the direct host, like the deploy script does.
    return url.replace("-pooler", "");
  }

  private backupsDir() {
    return path.resolve(process.cwd(), "../../backups");
  }

  private async ensurePrivateDir() {
    const dir = this.backupsDir();
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await chmod(dir, 0o700);
    } catch {
      throw new ServiceUnavailableException("Backup failed");
    }
    return dir;
  }

  private savedFile(name: string) {
    if (!SAVED_FILE.test(name)) throw new BadRequestException("Unknown saved file");
    const dir = this.backupsDir();
    const target = path.resolve(dir, name);
    if (path.dirname(target) !== dir) throw new BadRequestException("Unknown saved file");
    return target;
  }

  private async writeDatabaseFile(file: string) {
    const output = createWriteStream(file, { flags: "wx", mode: 0o600 });
    const errored = new Promise<never>((_, reject) => output.on("error", reject));
    try {
      await Promise.race([
        (async () => {
          await this.writeDatabaseContents(output);
          output.end();
          await finished(output);
        })(),
        errored,
      ]);
      await chmod(file, 0o600);
    } catch (error) {
      output.destroy();
      await unlink(file).catch(() => undefined);
      throw error;
    }
  }

  private async writeDatabaseContents(output: Writable): Promise<void> {
    const client = new Client({ connectionString: this.databaseUrl() });
    await client.connect();
    try {
      // One snapshot for the whole dump, so orders and payments always agree with each other.
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const tables = await this.tables(client);
      const columns = new Map<string, Column[]>();
      for (const table of tables) columns.set(table, await this.columns(client, table));
      const { ordered, deferred } = this.arrange(tables, await this.foreignKeys(client));
      await this.writeChunk(
        output,
        `-- AU-Getway database backup ${new Date().toISOString()}\n-- Restore into this same website after its schema is applied (prisma db push).\nBEGIN;\n`,
      );
      if (ordered.length > 0) {
        await this.writeChunk(
          output,
          `TRUNCATE TABLE ${ordered.map((table) => this.ident(table)).join(", ")} RESTART IDENTITY CASCADE;\n`,
        );
      }
      for (const table of ordered) {
        await this.writeTable(client, output, table, columns.get(table) ?? [], deferred.get(table) ?? new Set());
      }
      for (const table of ordered) {
        const skipped = deferred.get(table);
        if (!skipped || skipped.size === 0) continue;
        await this.writeDeferred(client, output, table, columns.get(table) ?? [], skipped);
      }
      await this.writeSequences(client, output);
      await this.writeChunk(output, "COMMIT;\n");
      await client.query("COMMIT");
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private ident(name: string) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new ServiceUnavailableException("Backup failed");
    return `"${name}"`;
  }

  private async tables(client: Client) {
    const result = await client.query<{ name: string }>(
      `SELECT c.relname AS name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY c.relname`,
    );
    return result.rows.map((row) => row.name);
  }

  private async columns(client: Client, table: string) {
    const result = await client.query<Column>(
      `SELECT column_name AS name, udt_name AS udt
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table],
    );
    for (const column of result.rows) {
      this.ident(column.udt);
      this.ident(column.name);
    }
    return result.rows;
  }

  private async foreignKeys(client: Client) {
    const result = await client.query<ForeignKey>(
      `SELECT child.relname AS child, parent.relname AS parent, att.attname AS column
       FROM pg_constraint c
       JOIN pg_class child ON child.oid = c.conrelid
       JOIN pg_class parent ON parent.oid = c.confrelid
       JOIN pg_namespace n ON n.oid = child.relnamespace
       JOIN unnest(c.conkey) AS ck(attnum) ON true
       JOIN pg_attribute att ON att.attrelid = child.oid AND att.attnum = ck.attnum
       WHERE c.contype = 'f' AND n.nspname = 'public'`,
    );
    return result.rows.filter((row) => {
      this.ident(row.child);
      this.ident(row.parent);
      this.ident(row.column);
      return true;
    });
  }

  // Parents are written before children. A self-reference or a cycle is filled in afterwards.
  private arrange(tables: string[], edges: ForeignKey[]) {
    const deferred = new Map<string, Set<string>>();
    const defer = (table: string, column: string) => {
      const columns = deferred.get(table) ?? new Set<string>();
      columns.add(column);
      deferred.set(table, columns);
    };
    const active = edges.filter((edge) => tables.includes(edge.child) && tables.includes(edge.parent));
    for (const edge of active) {
      if (edge.child === edge.parent) defer(edge.child, edge.column);
    }
    const deps = new Map(tables.map((table) => [table, new Set<string>()]));
    for (const edge of active) {
      if (edge.child !== edge.parent) deps.get(edge.child)?.add(edge.parent);
    }
    const pending = new Set(tables);
    const ordered: string[] = [];
    while (pending.size > 0) {
      const ready = [...pending]
        .filter((table) => [...(deps.get(table) ?? [])].every((parent) => !pending.has(parent)))
        .sort();
      if (ready.length === 0) {
        let changed = false;
        for (const edge of active) {
          if (pending.has(edge.child) && pending.has(edge.parent) && edge.child !== edge.parent) {
            defer(edge.child, edge.column);
            if (deps.get(edge.child)?.delete(edge.parent)) changed = true;
          }
        }
        if (!changed) throw new ServiceUnavailableException("Backup failed");
        continue;
      }
      for (const table of ready) {
        pending.delete(table);
        ordered.push(table);
      }
    }
    return { ordered, deferred };
  }

  private async writeTable(client: Client, output: Writable, table: string, columns: Column[], deferred: Set<string>) {
    if (columns.length === 0) return;
    const names = columns.map((column) => this.ident(column.name)).join(", ");
    const selected = columns.map((column) => `${this.ident(column.name)}::text AS ${this.ident(column.name)}`).join(", ");
    await client.query(`DECLARE backup_rows NO SCROLL CURSOR FOR SELECT ${selected} FROM ${this.ident(table)}`);
    try {
      for (;;) {
        const batch = await client.query<Record<string, string | null>>("FETCH 200 FROM backup_rows");
        if (batch.rows.length === 0) break;
        const values = batch.rows
          .map(
            (row) =>
              `(${columns
                .map((column) => (deferred.has(column.name) ? "NULL" : this.literal(row[column.name] ?? null, column.udt)))
                .join(", ")})`,
          )
          .join(",\n");
        await this.writeChunk(output, `INSERT INTO ${this.ident(table)} (${names}) VALUES\n${values};\n`);
      }
    } finally {
      await client.query("CLOSE backup_rows").catch(() => undefined);
    }
  }

  private async writeDeferred(client: Client, output: Writable, table: string, columns: Column[], deferred: Set<string>) {
    const keys = await this.primaryKey(client, table);
    if (keys.length === 0 || keys.some((key) => deferred.has(key))) throw new ServiceUnavailableException("Backup failed");
    const wanted = [...keys, ...deferred];
    const byName = new Map(columns.map((column) => [column.name, column]));
    if (wanted.some((name) => !byName.has(name))) throw new ServiceUnavailableException("Backup failed");
    const selected = wanted.map((name) => `${this.ident(name)}::text AS ${this.ident(name)}`).join(", ");
    await client.query(`DECLARE backup_rows NO SCROLL CURSOR FOR SELECT ${selected} FROM ${this.ident(table)}`);
    try {
      for (;;) {
        const batch = await client.query<Record<string, string | null>>("FETCH 200 FROM backup_rows");
        if (batch.rows.length === 0) break;
        for (const row of batch.rows) {
          const assignments = [...deferred].filter((name) => (row[name] ?? null) !== null);
          if (assignments.length === 0) continue;
          const pair = (name: string) => {
            const column = byName.get(name);
            if (!column) throw new ServiceUnavailableException("Backup failed");
            return `${this.ident(name)} = ${this.literal(row[name] ?? null, column.udt)}`;
          };
          await this.writeChunk(
            output,
            `UPDATE ${this.ident(table)} SET ${assignments.map(pair).join(", ")} WHERE ${keys.map(pair).join(" AND ")};\n`,
          );
        }
      }
    } finally {
      await client.query("CLOSE backup_rows").catch(() => undefined);
    }
  }

  private async primaryKey(client: Client, table: string) {
    const result = await client.query<{ name: string }>(
      `SELECT a.attname AS name
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
       WHERE i.indrelid = $1::regclass AND i.indisprimary
       ORDER BY array_position(i.indkey, a.attnum)`,
      [`public.${this.ident(table)}`],
    );
    return result.rows.map((row) => {
      this.ident(row.name);
      return row.name;
    });
  }

  private async writeSequences(client: Client, output: Writable) {
    const result = await client.query<{ sequence: string; table: string; column: string }>(
      `SELECT s.relname AS sequence, t.relname AS "table", a.attname AS column
       FROM pg_class s
       JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
       JOIN pg_class t ON d.refobjid = t.oid
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
       JOIN pg_namespace n ON n.oid = s.relnamespace
       WHERE s.relkind = 'S' AND n.nspname = 'public'`,
    );
    for (const row of result.rows) {
      await this.writeChunk(
        output,
        `SELECT setval(${this.ident(row.sequence)}::regclass, COALESCE((SELECT MAX(${this.ident(row.column)}) FROM ${this.ident(row.table)}), 1), true);\n`,
      );
    }
  }

  private writeChunk(output: Writable, chunk: string) {
    if (output.write(chunk)) return Promise.resolve();
    return once(output, "drain").then(() => undefined);
  }

  private literal(value: string | null, udt: string) {
    if (value === null) return "NULL";
    let tag = "q";
    while (value.includes(`$${tag}$`)) tag += "q";
    return `$${tag}$${value}$${tag}$::${this.ident(udt)}`;
  }
}
