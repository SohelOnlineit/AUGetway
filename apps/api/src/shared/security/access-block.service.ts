import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { isIP } from "node:net";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

export type AccessBlockType = "ip" | "country";

export type AccessBlockDto = {
  id: string;
  type: AccessBlockType;
  value: string;
  reason: string | null;
  createdAt: string;
};

type BlockSnapshot = {
  ips: Set<string>;
  countries: Set<string>;
  expires: number;
};

const CACHE_MS = 15_000;

function toKind(type: AccessBlockType): "IP" | "COUNTRY" {
  return type === "ip" ? "IP" : "COUNTRY";
}

function fromKind(type: "IP" | "COUNTRY"): AccessBlockType {
  return type === "IP" ? "ip" : "country";
}

export function normalizeBlockValue(type: AccessBlockType, raw: string): string {
  const trimmed = raw.trim();
  if (type === "country") return trimmed.toUpperCase();
  return trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;
}

export function assertBlockValue(type: AccessBlockType, raw: string): string {
  const value = normalizeBlockValue(type, raw);
  if (type === "country") {
    if (!/^[A-Z]{2}$/.test(value) || value === "XX" || value === "T1") {
      throw new BadRequestException("Country must be a 2-letter ISO code, for example BD or US.");
    }
    return value;
  }
  if (!isIP(value)) {
    throw new BadRequestException("Enter a valid IPv4 or IPv6 address.");
  }
  return value;
}

@Injectable()
export class AccessBlockService {
  private snapshot: BlockSnapshot | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AccessBlockDto[]> {
    const rows = await this.prisma.accessBlock.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      type: fromKind(row.type),
      value: row.value,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async counts(): Promise<{ ip: number; country: number; total: number }> {
    const [ip, country] = await Promise.all([
      this.prisma.accessBlock.count({ where: { active: true, type: "IP" } }),
      this.prisma.accessBlock.count({ where: { active: true, type: "COUNTRY" } }),
    ]);
    return { ip, country, total: ip + country };
  }

  async add(input: { type: AccessBlockType; value: string; reason?: string }, userId?: string): Promise<AccessBlockDto> {
    const value = assertBlockValue(input.type, input.value);
    const reason = input.reason?.trim() || null;
    const type = toKind(input.type);
    const existing = await this.prisma.accessBlock.findUnique({
      where: { type_value: { type, value } },
    });
    if (existing?.active) {
      throw new BadRequestException(input.type === "ip" ? "That IP is already blocked." : "That country is already blocked.");
    }
    const row = existing
      ? await this.prisma.accessBlock.update({
          where: { id: existing.id },
          data: { active: true, reason, createdBy: userId ?? existing.createdBy },
        })
      : await this.prisma.accessBlock.create({
          data: { type, value, reason, active: true, createdBy: userId },
        });
    this.snapshot = null;
    await this.audit.record({
      action: "security.access_block",
      userId,
      entityType: "access_block",
      entityId: row.id,
      metadata: { type: input.type, value, reason },
    });
    return {
      id: row.id,
      type: input.type,
      value: row.value,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async remove(id: string, userId?: string): Promise<void> {
    const row = await this.prisma.accessBlock.findUnique({ where: { id } });
    if (!row || !row.active) throw new NotFoundException("Block rule not found.");
    await this.prisma.accessBlock.update({ where: { id }, data: { active: false } });
    this.snapshot = null;
    await this.audit.record({
      action: "security.access_unblock",
      userId,
      entityType: "access_block",
      entityId: row.id,
      metadata: { type: fromKind(row.type), value: row.value },
    });
  }

  async check(ip?: string, country?: string): Promise<{ blocked: boolean; type?: AccessBlockType; value?: string }> {
    const snapshot = await this.activeSnapshot();
    const normalizedIp = ip ? normalizeBlockValue("ip", ip) : "";
    if (normalizedIp && snapshot.ips.has(normalizedIp)) {
      return { blocked: true, type: "ip", value: normalizedIp };
    }
    const normalizedCountry = country ? normalizeBlockValue("country", country) : "";
    if (normalizedCountry && normalizedCountry !== "XX" && normalizedCountry !== "T1" && snapshot.countries.has(normalizedCountry)) {
      return { blocked: true, type: "country", value: normalizedCountry };
    }
    return { blocked: false };
  }

  private async activeSnapshot(): Promise<BlockSnapshot> {
    if (this.snapshot && Date.now() < this.snapshot.expires) return this.snapshot;
    const rows = await this.prisma.accessBlock.findMany({
      where: { active: true },
      select: { type: true, value: true },
    });
    const ips = new Set<string>();
    const countries = new Set<string>();
    for (const row of rows) {
      if (row.type === "IP") ips.add(row.value);
      else countries.add(row.value);
    }
    this.snapshot = { ips, countries, expires: Date.now() + CACHE_MS };
    return this.snapshot;
  }
}
