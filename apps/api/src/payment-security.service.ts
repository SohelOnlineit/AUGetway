import { Injectable } from "@nestjs/common";
import { readTrxId } from "./payment-sms";
import {
  classifyNotice,
  HANDSET_BURST_WINDOW_MS,
  repeatedClaimEvent,
  watchInBackground,
  type OpenCheckoutSnap,
  type SecurityEventDraft,
} from "./payment-security";
import { PrismaService } from "./prisma.service";

type EventRow = SecurityEventDraft & {
  id: string;
  ownerId: string;
  handsetId: string;
  noticeId: string;
  createdAt: Date;
};

type SecurityDb = {
  checkout: {
    findMany: (args: {
      where: { ownerId: string; status: { in: string[] } } | { id: { in: string[] } };
      select: {
        id: true;
        publicId: true;
        providerRef: true;
        status: true;
        method: { select: { verifyBy: true } };
      };
    }) => Promise<Array<{
      id: string;
      publicId: string;
      providerRef: string | null;
      status: string;
      method: { verifyBy: string } | null;
    }>>;
  };
  inboxNotice: {
    count: (args: { where: { handsetId: string; createdAt: { gte: Date } } }) => Promise<number>;
  };
  paymentSecurityEvent: {
    createMany: (args: { data: Array<Omit<EventRow, "id" | "createdAt">> }) => Promise<unknown>;
    findMany: (args: {
      where: { ownerId: string };
      orderBy: { createdAt: "desc" };
      take: number;
    }) => Promise<EventRow[]>;
  };
};

@Injectable()
export class PaymentSecurityService {
  constructor(private readonly prisma: PrismaService) {}

  private db(): SecurityDb {
    return this.prisma as unknown as SecurityDb;
  }

  /** Read-only snapshot. A failure returns an empty list and does not stop payment. */
  async snapshot(ownerId: string): Promise<OpenCheckoutSnap[]> {
    try {
      const rows = await this.db().checkout.findMany({
        where: { ownerId, status: { in: ["waiting", "pending"] } },
        select: {
          id: true,
          publicId: true,
          providerRef: true,
          status: true,
          method: { select: { verifyBy: true } },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        publicId: row.publicId,
        providerRef: row.providerRef ?? "",
        status: row.status,
        verifyBy: row.method?.verifyBy ?? "transaction_id",
      }));
    } catch {
      return [];
    }
  }

  watchNotice(input: {
    ownerId: string;
    handsetId: string;
    noticeId: string;
    sender: string;
    body: string;
    duplicate: boolean;
    matchedPublicId: string | null;
    openBefore: OpenCheckoutSnap[] | Promise<OpenCheckoutSnap[]>;
  }): void {
    watchInBackground(() => this.writeNotice(input));
  }

  watchRepeatedClaim(input: { ownerId: string; trxId: string; checkoutId: string }): void {
    watchInBackground(() => this.writeEvents(input.ownerId, "", "", [repeatedClaimEvent(input.trxId, input.checkoutId)]));
  }

  async list(ownerId: string) {
    try {
      const rows = await this.db().paymentSecurityEvent.findMany({
        where: { ownerId },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        sender: row.sender,
        trxId: row.trxId,
        handsetId: row.handsetId,
        noticeId: row.noticeId,
        checkoutId: row.checkoutId,
        detail: row.detail,
        authenticity: "not-checked" as const,
        createdAt: row.createdAt.toISOString(),
      }));
    } catch {
      return [];
    }
  }

  private async writeNotice(input: {
    ownerId: string;
    handsetId: string;
    noticeId: string;
    sender: string;
    body: string;
    duplicate: boolean;
    matchedPublicId: string | null;
    openBefore: OpenCheckoutSnap[] | Promise<OpenCheckoutSnap[]>;
  }): Promise<void> {
    const openBefore = await Promise.resolve(input.openBefore).catch(() => [] as OpenCheckoutSnap[]);
    const recentNoticeCount = input.duplicate ? 0 : await this.recentCount(input.handsetId);
    const openAfter = input.duplicate ? [] : await this.reload(openBefore.map((row) => row.id));
    const events = classifyNotice({
      sender: input.sender,
      body: input.body,
      trxId: readTrxId(input.body),
      duplicate: input.duplicate,
      matchedPublicId: input.matchedPublicId,
      recentNoticeCount,
      openBefore,
      openAfter,
    });
    await this.writeEvents(input.ownerId, input.handsetId, input.noticeId, events);
  }

  private async recentCount(handsetId: string): Promise<number> {
    try {
      return await this.db().inboxNotice.count({
        where: { handsetId, createdAt: { gte: new Date(Date.now() - HANDSET_BURST_WINDOW_MS) } },
      });
    } catch {
      return 0;
    }
  }

  private async reload(ids: string[]): Promise<OpenCheckoutSnap[]> {
    if (ids.length === 0) return [];
    try {
      const rows = await this.db().checkout.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          publicId: true,
          providerRef: true,
          status: true,
          method: { select: { verifyBy: true } },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        publicId: row.publicId,
        providerRef: row.providerRef ?? "",
        status: row.status,
        verifyBy: row.method?.verifyBy ?? "transaction_id",
      }));
    } catch {
      return [];
    }
  }

  private async writeEvents(ownerId: string, handsetId: string, noticeId: string, events: SecurityEventDraft[]): Promise<void> {
    if (events.length === 0) return;
    try {
      await this.db().paymentSecurityEvent.createMany({
        data: events.map((event) => ({
          ownerId,
          handsetId,
          noticeId,
          checkoutId: event.checkoutId,
          kind: event.kind,
          sender: event.sender.slice(0, 80),
          trxId: event.trxId.slice(0, 40),
          detail: event.detail.slice(0, 300),
        })),
      });
    } catch {
      // The security table may not exist yet. Payment processing must continue.
    }
  }
}
