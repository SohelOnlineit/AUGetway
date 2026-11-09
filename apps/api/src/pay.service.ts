import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { acceptInboundSms, bodyHasRef, isCreditMessage, isDebitMessage, isOtpMessage, isPaymentSender, readPaidAmount, readTrxId, senderFitsMethod, trxRefOk } from "./payment-sms";
import { PrismaService } from "./prisma.service";

type MoneyRow = { toString(): string };

function money(value: MoneyRow | number | string) {
  return Number(value).toFixed(2);
}

function publicId() {
  return randomBytes(9).toString("base64url");
}

function hashKey(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const keyAbilities = ["payment:checkout", "payment:verify", "payment:refund", "sms:sync", "sms:receive", "sms:send"];

function freshKey(keyType: string) {
  if (keyType === "sms") {
    const mark = randomBytes(6).toString("hex").slice(0, 8);
    return `sg_live_${mark}.${randomBytes(24).toString("base64url")}`;
  }
  return `uq_live_${randomBytes(24).toString("base64url")}`;
}

function siteBase() {
  const origin = (process.env.WEB_ORIGIN ?? "http://127.0.0.1:3100").split(",")[0]?.trim().replace(/\/+$/, "");
  return origin || "http://127.0.0.1:3100";
}

function httpUrl(value: string | undefined) {
  const url = (value ?? "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) throw new BadRequestException("That address must start with http:// or https://");
  return url;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function reportBounds(now: Date) {
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekDay = (today.getDay() + 6) % 7;
  const thisWeek = new Date(today);
  thisWeek.setDate(today.getDate() - weekDay);
  const nextWeek = new Date(thisWeek);
  nextWeek.setDate(thisWeek.getDate() + 7);
  const lastWeek = new Date(thisWeek);
  lastWeek.setDate(thisWeek.getDate() - 7);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const thisYear = new Date(today.getFullYear(), 0, 1);
  const nextYear = new Date(today.getFullYear() + 1, 0, 1);
  const lastYear = new Date(today.getFullYear() - 1, 0, 1);
  return {
    today: { start: today, end: tomorrow },
    yesterday: { start: yesterday, end: today },
    this_week: { start: thisWeek, end: nextWeek },
    last_week: { start: lastWeek, end: thisWeek },
    this_month: { start: thisMonth, end: nextMonth },
    last_month: { start: lastMonth, end: thisMonth },
    this_year: { start: thisYear, end: nextYear },
    last_year: { start: lastYear, end: thisYear },
  };
}

function priceAmount(
  amount: number,
  method: { fixedDiscount: { toString(): string }; percentageDiscount: { toString(): string }; fixedCharge: { toString(): string }; percentageCharge: { toString(): string } },
) {
  const discount = Number(method.fixedDiscount) + (amount * Number(method.percentageDiscount)) / 100;
  const charge = Number(method.fixedCharge) + (amount * Number(method.percentageCharge)) / 100;
  return Math.max(0, Math.round((amount - discount + charge) * 100) / 100);
}

function bdMobile(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (/^01[3-9]\d{8}$/.test(digits)) return digits;
  if (/^8801[3-9]\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  return "";
}

function looksLikeDebit(body: string) {
  return isDebitMessage(body);
}

function accountList(value: string) {
  return value.split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean);
}

function shownAccount(payTo: string, stored: string) {
  const accounts = accountList(stored);
  if (accounts.length === 0) return "";
  if (payTo && accounts.includes(payTo)) return payTo;
  return accounts[0];
}

function accentColor(value: string | undefined) {
  const text = value?.trim() ?? "";
  if (!text) return "";
  const hex = text.startsWith("#") ? text : `#${text}`;
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex) ? hex : "";
}

type SiteCard = {
  brandName: string;
  supportEmail: string;
  supportPhone: string;
  currency: string;
  currencySymbol: string;
  checkoutNote: string;
  brandLogo: string;
  brandFavicon: string;
  themeAccent: string;
  checkoutTheme: string;
  faqTitle: string;
  faqContent: string;
  metaTitle: string;
  metaDescription: string;
};

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function senderNumberOk(value: string) {
  return /^01[3-9]\d{8}$/.test(value.trim());
}

const PREF_KEYS = new Set([
  "supportPhone",
  "usdRate",
  "currencySymbol",
  "brandLogo",
  "brandFavicon",
  "apiTimeout",
  "webhookSecret",
  "autoRedirect",
  "mailHost",
  "mailPort",
  "mailUsername",
  "mailPassword",
  "mailEncryption",
  "mailFromAddress",
  "mailFromName",
  "telegramToken",
  "telegramChatId",
  "telegramNotify",
  "themeAccent",
  "themeMode",
  "checkoutTheme",
  "faqTitle",
  "faqContent",
  "metaTitle",
  "metaDescription",
  "metaKeywords",
  "metaPixelId",
  "metaCapiToken",
  "metaTestCode",
]);

function cleanPrefs(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const prefs: Record<string, string> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (!PREF_KEYS.has(key) || typeof raw !== "string") continue;
    const text = raw.trim();
    if (key === "brandLogo" || key === "brandFavicon") {
      if (!text || (text.startsWith("data:image/") && text.length <= 1_200_000)) prefs[key] = text;
      continue;
    }
    const limit = key === "faqContent" || key === "metaCapiToken" ? 4000 : 500;
    prefs[key] = text.slice(0, limit);
  }
  return prefs;
}

function senderInNotice(sender: string, body: string) {
  const tail = digits(sender);
  if (!senderNumberOk(tail)) return false;
  if (digits(body).includes(tail)) return true;
  return body.includes(`***${tail.slice(-3)}`);
}

function parsePaidAmount(body: string) {
  return readPaidAmount(body);
}

function amountFits(paid: number, payable: number, under: number, over: number) {
  if (paid + 0.001 < payable - under) return false;
  if (over > 0 && paid > payable + over + 0.001) return false;
  return true;
}

@Injectable()
export class PayService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit() {
    const owner = await this.ensureOwner();
    if (owner) {
      await this.ensureCatalog(owner.id);
      await this.applyReceiptDefault();
    }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.deskUser.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Email or password is wrong");
    }
    return this.session(user);
  }

  async me(userId: string) {
    const user = await this.prisma.deskUser.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("Sign in required");
    return { id: user.id, name: user.name, email: user.email, role: user.deskId ? "admin" : "owner" };
  }

  async updateAccount(userId: string, input: { currentPassword: string; email: string; name: string; newPassword?: string }) {
    const user = await this.prisma.deskUser.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
      throw new BadRequestException("Current password is wrong");
    }
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    const newPassword = input.newPassword?.trim() ?? "";
    if (name.length < 2) throw new BadRequestException("Name must be at least 2 characters");
    if (email === user.email && name === user.name && !newPassword) {
      throw new BadRequestException("Change the name, email, or password");
    }
    try {
      const updated = await this.prisma.deskUser.update({
        where: { id: user.id },
        data: {
          email,
          name,
          ...(newPassword ? { passwordHash: await bcrypt.hash(newPassword, 12) } : {}),
        },
      });
      return this.session(updated);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new BadRequestException("That email is already used");
      }
      throw error;
    }
  }

  async listAdmins(actorId: string, deskId: string) {
    await this.requireOwner(actorId, deskId);
    const rows = await this.prisma.deskUser.findMany({
      where: { deskId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    return rows;
  }

  async createAdmin(actorId: string, deskId: string, input: { name: string; email: string; password: string }) {
    await this.requireOwner(actorId, deskId);
    const email = input.email.trim().toLowerCase();
    try {
      const row = await this.prisma.deskUser.create({
        data: {
          name: input.name.trim(),
          email,
          passwordHash: await bcrypt.hash(input.password, 12),
          role: "admin",
          deskId,
          receiptDefaulted: true,
        },
        select: { id: true, name: true, email: true, createdAt: true },
      });
      return row;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new BadRequestException("That email is already used");
      }
      throw error;
    }
  }

  async removeAdmin(actorId: string, deskId: string, id: string) {
    await this.requireOwner(actorId, deskId);
    const row = await this.prisma.deskUser.findFirst({ where: { id, deskId } });
    if (!row) throw new NotFoundException("Admin account not found");
    await this.prisma.deskUser.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async summary(ownerId: string) {
    const [open, waiting, paid, methods, handsets] = await Promise.all([
      this.prisma.checkout.count({ where: { ownerId, status: "open" } }),
      this.prisma.checkout.count({ where: { ownerId, status: { in: ["waiting", "pending"] } } }),
      this.prisma.checkout.count({ where: { ownerId, status: "paid" } }),
      this.prisma.walletMethod.count({ where: { ownerId, active: true } }),
      this.prisma.handset.count({ where: { ownerId } }),
    ]);
    const paidRows = await this.prisma.checkout.findMany({
      where: { ownerId, status: "paid" },
      select: { payable: true },
    });
    const volume = paidRows.reduce((sum, row) => sum + Number(row.payable), 0);
    return {
      open,
      waiting,
      paid,
      methods,
      handsets,
      volume: volume.toFixed(2),
      currency: "BDT",
    };
  }

  async listMethods(ownerId: string) {
    const rows = await this.prisma.walletMethod.findMany({
      where: { ownerId },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });
    return rows.map((row) => this.methodView(row, false));
  }

  async getMethod(ownerId: string, id: string) {
    return this.methodView(await this.ownMethod(ownerId, id), true);
  }

  async createMethod(
    ownerId: string,
    input: {
      label: string;
      internalLabel?: string;
      code?: string;
      accountNumber?: string;
      instructions?: string;
      minAmount?: number;
      maxAmount?: number;
      fixedCharge?: number;
      percentageCharge?: number;
      fixedDiscount?: number;
      percentageDiscount?: number;
      qrImage?: string;
      verifyBy?: string;
      payWindow?: number;
      uniqueSlots?: number;
      uniqueKind?: string;
      acceptProof?: boolean;
      holdUnmatched?: boolean;
      holdAbove?: number;
      underTolerance?: number;
      overTolerance?: number;
      shiftAmount?: boolean;
      active?: boolean;
    },
  ) {
    this.assertLimits(input.minAmount ?? 1, input.maxAmount ?? 25000);
    const last = await this.prisma.walletMethod.aggregate({ where: { ownerId }, _max: { sortOrder: true } });
    const row = await this.prisma.walletMethod.create({
      data: {
        ownerId,
        label: input.label.trim(),
        internalLabel: input.internalLabel?.trim() ?? "",
        code: (input.code || input.label).trim(),
        accountNumber: input.accountNumber?.trim() ?? "",
        instructions: input.instructions?.trim() ?? "",
        minAmount: input.minAmount ?? 1,
        maxAmount: input.maxAmount ?? 25000,
        fixedCharge: input.fixedCharge ?? 0,
        percentageCharge: input.percentageCharge ?? 0,
        fixedDiscount: input.fixedDiscount ?? 0,
        percentageDiscount: input.percentageDiscount ?? 0,
        qrImage: input.qrImage ?? "",
        verifyBy: input.verifyBy ?? "transaction_id",
        payWindow: input.payWindow ?? 15,
        uniqueSlots: input.uniqueSlots ?? 3,
        uniqueKind: input.uniqueKind ?? "integer",
        acceptProof: input.acceptProof === true,
        holdUnmatched: Boolean(input.holdUnmatched),
        holdAbove: input.holdAbove ?? 0,
        underTolerance: input.underTolerance ?? 0,
        overTolerance: input.overTolerance ?? 0,
        shiftAmount: input.verifyBy === "unique_amount" || Boolean(input.shiftAmount),
        active: input.active !== false,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
    });
    return this.methodView(row, false);
  }

  async updateMethod(
    ownerId: string,
    id: string,
    input: {
      label?: string;
      internalLabel?: string;
      code?: string;
      accountNumber?: string;
      instructions?: string;
      minAmount?: number;
      maxAmount?: number;
      fixedCharge?: number;
      percentageCharge?: number;
      fixedDiscount?: number;
      percentageDiscount?: number;
      qrImage?: string;
      verifyBy?: string;
      payWindow?: number;
      uniqueSlots?: number;
      uniqueKind?: string;
      acceptProof?: boolean;
      holdUnmatched?: boolean;
      holdAbove?: number;
      underTolerance?: number;
      overTolerance?: number;
      shiftAmount?: boolean;
      active?: boolean;
    },
  ) {
    const current = await this.ownMethod(ownerId, id);
    const minAmount = input.minAmount ?? Number(current.minAmount);
    const maxAmount = input.maxAmount ?? Number(current.maxAmount);
    this.assertLimits(minAmount, maxAmount);
    const row = await this.prisma.walletMethod.update({
      where: { id },
      data: {
        label: input.label?.trim(),
        internalLabel: input.internalLabel?.trim(),
        code: input.code?.trim(),
        accountNumber: input.accountNumber?.trim(),
        instructions: input.instructions?.trim(),
        minAmount: input.minAmount,
        maxAmount: input.maxAmount,
        fixedCharge: input.fixedCharge,
        percentageCharge: input.percentageCharge,
        fixedDiscount: input.fixedDiscount,
        percentageDiscount: input.percentageDiscount,
        qrImage: input.qrImage,
        verifyBy: input.verifyBy,
        payWindow: input.payWindow,
        uniqueSlots: input.uniqueSlots,
        uniqueKind: input.uniqueKind,
        acceptProof: input.acceptProof,
        holdUnmatched: input.holdUnmatched,
        holdAbove: input.holdAbove,
        underTolerance: input.underTolerance,
        overTolerance: input.overTolerance,
        shiftAmount: input.verifyBy ? input.verifyBy === "unique_amount" : input.shiftAmount,
        active: input.active,
      },
    });
    return this.methodView(row, false);
  }

  async removeMethods(ownerId: string, ids: string[]) {
    await this.prisma.walletMethod.deleteMany({ where: { ownerId, id: { in: ids } } });
    return { ok: true };
  }

  async listCheckouts(ownerId: string) {
    await this.prisma.checkout.updateMany({
      where: { ownerId, status: { in: ["open", "waiting"] }, expiresAt: { lt: new Date() } },
      data: { status: "expired" },
    });
    const rows = await this.prisma.checkout.findMany({
      where: { ownerId },
      include: { method: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const site = await this.siteView(ownerId);
    return Promise.all(rows.map((row) => this.checkoutCard(row, false, true, site)));
  }

  async createCheckout(
    ownerId: string,
    input: {
      reference: string;
      amount: number;
      currency?: string;
      successUrl?: string;
      cancelUrl?: string;
      webhookUrl?: string;
      billId?: string;
      linkId?: string;
    },
  ) {
    const row = await this.prisma.checkout.create({
      data: {
        publicId: publicId(),
        ownerId,
        reference: input.reference.trim(),
        amount: input.amount,
        payable: input.amount,
        currency: (input.currency ?? "BDT").toUpperCase(),
        successUrl: input.successUrl || null,
        cancelUrl: input.cancelUrl || null,
        webhookUrl: input.webhookUrl || "",
        billId: input.billId,
        linkId: input.linkId,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
      include: { method: true },
    });
    return this.checkoutCard(row, true);
  }

  async setStatus(ownerId: string, id: string, status: "paid" | "failed", providerRef?: string) {
    const row = await this.prisma.checkout.findFirst({ where: { ownerId, publicId: id } });
    if (!row) throw new NotFoundException("Checkout not found");
    if (row.status === "paid") return this.publicPay(id);
    const ref = (providerRef ?? "").trim().toUpperCase();
    if (ref && !trxRefOk(ref)) throw new BadRequestException("Enter the transaction ID from the payment message");
    const nextRef = ref || row.providerRef;
    if (status === "paid" && nextRef) {
      const used = await this.prisma.checkout.findFirst({
        where: { ownerId, status: "paid", providerRef: nextRef, id: { not: row.id } },
        select: { id: true },
      });
      if (used) throw new BadRequestException("This Transaction ID is already used on another order.");
    }
    const updated = await this.prisma.checkout.update({
      where: { id: row.id },
      data: { status, ...(ref ? { providerRef: ref } : {}) },
      include: { method: true },
    });
    if (status === "paid" && updated.billId) {
      await this.prisma.bill.update({ where: { id: updated.billId }, data: { status: "paid" } });
    }
    this.notifyGateway(updated);
    return this.checkoutCard(updated, false);
  }

  async editCheckout(
    ownerId: string,
    publicId: string,
    input: { reference: string; amount?: number; payerAccount?: string; providerRef?: string },
  ) {
    const row = await this.prisma.checkout.findFirst({ where: { ownerId, publicId }, include: { method: true } });
    if (!row) throw new NotFoundException("Checkout not found");
    const reference = input.reference.trim();
    const payer = (input.payerAccount ?? "").trim();
    if (payer && !/^01\d{9}$/.test(payer)) {
      throw new BadRequestException("Sender number must start with 01 and be exactly 11 digits.");
    }
    const ref = (input.providerRef ?? "").trim().toUpperCase();
    if (ref && !trxRefOk(ref)) throw new BadRequestException("Enter the transaction ID from the payment message");
    if (ref) {
      const used = await this.prisma.checkout.findFirst({
        where: { ownerId, providerRef: ref, id: { not: row.id }, status: { in: ["waiting", "pending", "paid"] } },
        select: { id: true },
      });
      if (used) throw new BadRequestException("This Transaction ID is already used on another order.");
    }
    const openSlot = row.status === "open" && Number(row.amount) === Number(row.payable);
    const updated = await this.prisma.checkout.update({
      where: { id: row.id },
      data: {
        reference,
        payerAccount: payer || null,
        providerRef: ref || null,
        ...(openSlot && input.amount != null ? { amount: input.amount, payable: input.amount } : {}),
      },
      include: { method: true },
    });
    return this.checkoutCard(updated, false);
  }

  async removeCheckouts(ownerId: string, publicIds: string[]) {
    const wanted = [...new Set(publicIds.map((id) => id.trim()).filter(Boolean))].slice(0, 500);
    if (!wanted.length) return { ok: true, removed: 0 };
    const rows = await this.prisma.checkout.findMany({
      where: { ownerId, publicId: { in: wanted } },
      select: { id: true },
    });
    return this.dropCheckouts(ownerId, rows.map((row) => row.id));
  }

  async removeAllCheckouts(ownerId: string) {
    const rows = await this.prisma.checkout.findMany({ where: { ownerId }, select: { id: true } });
    return this.dropCheckouts(ownerId, rows.map((row) => row.id));
  }

  private async dropCheckouts(ownerId: string, ids: string[]) {
    if (!ids.length) return { ok: true, removed: 0 };
    await this.prisma.$transaction([
      this.prisma.inboxNotice.updateMany({ where: { checkoutId: { in: ids } }, data: { checkoutId: null } }),
      this.prisma.checkout.deleteMany({ where: { ownerId, id: { in: ids } } }),
    ]);
    return { ok: true, removed: ids.length };
  }

  async uddoktaCheckout(
    token: string,
    input: {
      full_name: string;
      email?: string;
      amount: number;
      metadata?: Record<string, unknown>;
      redirect_url?: string;
      cancel_url?: string;
      webhook_url?: string;
    },
  ) {
    const key = await this.keyFromToken(token);
    this.requireAbility(key, "payment:checkout");
    const orderId = typeof input.metadata?.orderId === "string" ? input.metadata.orderId.trim() : "";
    if (orderId.length < 2 || orderId.length > 80) throw new BadRequestException("metadata.orderId is required");
    const row = await this.prisma.checkout.create({
      data: {
        publicId: publicId(),
        ownerId: key.ownerId,
        reference: orderId,
        amount: input.amount,
        payable: input.amount,
        currency: "BDT",
        successUrl: httpUrl(input.redirect_url) || null,
        cancelUrl: httpUrl(input.cancel_url) || null,
        webhookUrl: httpUrl(input.webhook_url),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    return {
      status: true,
      payment_url: `${siteBase()}/pay/${row.publicId}`,
      invoice_id: row.publicId,
    };
  }

  async uddoktaVerify(token: string, invoiceId: string) {
    const key = await this.keyFromToken(token);
    this.requireAbility(key, "payment:verify");
    const row = await this.prisma.checkout.findFirst({ where: { publicId: invoiceId, ownerId: key.ownerId } });
    if (!row) throw new NotFoundException("Invoice not found");
    const status = row.status === "paid" ? "COMPLETED" : row.status === "failed" || row.status === "expired" ? "FAILED" : "PENDING";
    return {
      invoice_id: row.publicId,
      status,
      amount: money(row.amount),
      metadata: { orderId: row.reference },
    };
  }

  private notifyGateway(row: { publicId: string; reference: string; amount: MoneyRow | number | string; webhookUrl: string; status: string }) {
    const url = row.webhookUrl.trim();
    if (!url) return;
    const status = row.status === "paid" ? "COMPLETED" : row.status === "failed" ? "FAILED" : "";
    if (!status) return;
    const body = JSON.stringify({
      invoice_id: row.publicId,
      status,
      amount: money(row.amount),
      metadata: { orderId: row.reference },
    });
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body,
      signal: AbortSignal.timeout(8000),
    }).catch(() => undefined);
  }

  async listBills(ownerId: string) {
    const rows = await this.prisma.bill.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" }, take: 500 });
    return rows.map((row) => this.billView(row));
  }

  createBill(
    ownerId: string,
    input: { customerName: string; customerEmail?: string; title: string; total: number; note?: string; dueOn?: string },
  ) {
    return this.prisma.bill.create({
      data: {
        ownerId,
        number: `UB-${randomBytes(4).toString("hex").toUpperCase()}`,
        customerName: input.customerName.trim(),
        customerEmail: input.customerEmail?.trim() || null,
        title: input.title.trim(),
        total: input.total,
        note: input.note?.trim() ?? "",
        dueOn: this.readDay(input.dueOn),
      },
    });
  }

  async editBill(
    ownerId: string,
    number: string,
    input: { customerName?: string; customerEmail?: string; title?: string; total?: number; note?: string; dueOn?: string; status?: string },
  ) {
    const row = await this.prisma.bill.findFirst({ where: { ownerId, number } });
    if (!row) throw new NotFoundException("Invoice not found");
    const data: { customerName?: string; customerEmail?: string | null; title?: string; total?: number; note?: string; dueOn?: Date | null; status?: string } = {};
    if (input.customerName !== undefined) data.customerName = input.customerName.trim();
    if (input.customerEmail !== undefined) {
      const email = input.customerEmail.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException("Email is not valid");
      data.customerEmail = email || null;
    }
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.total !== undefined) data.total = input.total;
    if (input.note !== undefined) data.note = input.note.trim().slice(0, 400);
    if (input.dueOn !== undefined) data.dueOn = this.readDay(input.dueOn);
    if (input.status !== undefined) data.status = input.status;
    const updated = await this.prisma.bill.update({ where: { id: row.id }, data });
    return this.billView(updated);
  }

  async removeBills(ownerId: string, numbers: string[]) {
    const wanted = [...new Set(numbers.map((number) => number.trim()).filter(Boolean))].slice(0, 200);
    if (!wanted.length) return { ok: true, removed: 0 };
    const rows = await this.prisma.bill.findMany({ where: { ownerId, number: { in: wanted } }, select: { id: true } });
    const ids = rows.map((row) => row.id);
    if (!ids.length) return { ok: true, removed: 0 };
    await this.prisma.$transaction([
      this.prisma.checkout.updateMany({ where: { billId: { in: ids } }, data: { billId: null } }),
      this.prisma.bill.deleteMany({ where: { ownerId, id: { in: ids } } }),
    ]);
    return { ok: true, removed: ids.length };
  }

  private readDay(value?: string) {
    if (value === undefined) return undefined;
    const day = value.trim();
    if (!day) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new BadRequestException("Due date must be a calendar date");
    const date = new Date(`${day}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
      throw new BadRequestException("Due date must be a calendar date");
    }
    return date;
  }

  private billView(row: {
    number: string;
    customerName: string;
    customerEmail: string | null;
    title: string;
    total: MoneyRow;
    currency: string;
    status: string;
    note: string;
    dueOn: Date | null;
    createdAt: Date;
  }) {
    return {
      number: row.number,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      title: row.title,
      total: money(row.total),
      currency: row.currency,
      status: row.status,
      note: row.note,
      dueOn: row.dueOn ? row.dueOn.toISOString().slice(0, 10) : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async startBill(number: string) {
    const bill = await this.prisma.bill.findUnique({ where: { number } });
    if (!bill) throw new NotFoundException("Bill not found");
    if (bill.status === "paid") throw new BadRequestException("This bill is already paid");
    const existing = await this.prisma.checkout.findFirst({
      where: { billId: bill.id, status: { in: ["open", "waiting", "pending"] }, expiresAt: { gt: new Date() } },
    });
    if (existing) return { publicId: existing.publicId };
    const created = await this.createCheckout(bill.ownerId, {
      reference: bill.number,
      amount: Number(bill.total),
      currency: bill.currency,
      billId: bill.id,
    });
    return { publicId: created.publicId };
  }

  async listLinks(ownerId: string) {
    const rows = await this.prisma.payLink.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" } });
    return rows.map((row) => this.linkView(row));
  }

  async editLink(
    ownerId: string,
    slug: string,
    input: { title?: string; detail?: string; amount?: number; active?: boolean; slug?: string },
  ) {
    const row = await this.prisma.payLink.findFirst({ where: { ownerId, slug } });
    if (!row) throw new NotFoundException("Payment link not found");
    const data: { title?: string; detail?: string; amount?: number; active?: boolean; slug?: string } = {};
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.detail !== undefined) data.detail = input.detail.trim().slice(0, 400);
    if (input.amount !== undefined) data.amount = input.amount;
    if (input.active !== undefined) data.active = input.active;
    if (input.slug !== undefined && input.slug.trim().toLowerCase() !== row.slug) {
      const next = input.slug.trim().toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next)) {
        throw new BadRequestException("Slug can use lowercase letters, numbers, and dashes");
      }
      const used = await this.prisma.payLink.findUnique({ where: { slug: next } });
      if (used) throw new BadRequestException("This slug is already used");
      data.slug = next;
    }
    const updated = await this.prisma.payLink.update({ where: { id: row.id }, data });
    return this.linkView(updated);
  }

  async removeLinks(ownerId: string, slugs: string[]) {
    const wanted = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))].slice(0, 200);
    if (!wanted.length) return { ok: true, removed: 0 };
    const rows = await this.prisma.payLink.findMany({
      where: { ownerId, slug: { in: wanted } },
      select: { id: true },
    });
    const ids = rows.map((row) => row.id);
    if (!ids.length) return { ok: true, removed: 0 };
    await this.prisma.$transaction([
      this.prisma.checkout.updateMany({ where: { linkId: { in: ids } }, data: { linkId: null } }),
      this.prisma.payLink.deleteMany({ where: { ownerId, id: { in: ids } } }),
    ]);
    return { ok: true, removed: ids.length };
  }

  private linkView(row: { slug: string; title: string; detail: string; amount: MoneyRow; currency: string; active: boolean; createdAt: Date }) {
    return {
      slug: row.slug,
      title: row.title,
      detail: row.detail,
      amount: money(row.amount),
      currency: row.currency,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
    };
  }

  createLink(ownerId: string, input: { title: string; detail?: string; amount: number }) {
    const base = input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    return this.prisma.payLink.create({
      data: {
        ownerId,
        title: input.title.trim(),
        detail: input.detail?.trim() ?? "",
        amount: input.amount,
        slug: `${base || "pay"}-${randomBytes(2).toString("hex")}`,
      },
    });
  }

  async startLink(slug: string, reference?: string) {
    const link = await this.prisma.payLink.findUnique({ where: { slug } });
    if (!link || !link.active) throw new NotFoundException("Payment link is not available");
    const created = await this.createCheckout(link.ownerId, {
      reference: reference?.trim() || link.title,
      amount: Number(link.amount),
      currency: link.currency,
      linkId: link.id,
    });
    return { publicId: created.publicId };
  }

  async publicLink(slug: string) {
    const link = await this.prisma.payLink.findUnique({ where: { slug } });
    if (!link || !link.active) throw new NotFoundException("Payment link is not available");
    return {
      slug: link.slug,
      title: link.title,
      detail: link.detail,
      amount: money(link.amount),
      currency: link.currency,
    };
  }

  async publicBill(number: string) {
    const bill = await this.prisma.bill.findUnique({ where: { number } });
    if (!bill) throw new NotFoundException("Bill not found");
    return {
      number: bill.number,
      customerName: bill.customerName,
      title: bill.title,
      total: money(bill.total),
      currency: bill.currency,
      status: bill.status,
      note: bill.note,
    };
  }

  listKeys(ownerId: string) {
    return this.prisma.merchantKey.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        label: true,
        prefix: true,
        keyType: true,
        abilities: true,
        webhookUrl: true,
        expiresAt: true,
        active: true,
        createdAt: true,
      },
    });
  }

  async createKey(
    ownerId: string,
    input: {
      label: string;
      keyType: "checkout" | "sms";
      generation: "auto" | "custom";
      token?: string;
      secret?: string;
      abilities: string[];
      webhookUrl?: string;
      expiresAt?: string;
      active: boolean;
    },
  ) {
    const abilities = [...new Set(input.abilities.filter((item) => keyAbilities.includes(item)))];
    if (abilities.length === 0) throw new BadRequestException("Choose at least one ability");
    const webhookUrl = (input.webhookUrl ?? "").trim();
    if (webhookUrl) {
      try {
        const url = new URL(webhookUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
      } catch {
        throw new BadRequestException("Webhook URL must start with http:// or https://");
      }
    }
    let expiresAt: Date | null = null;
    if (input.expiresAt) {
      expiresAt = new Date(`${input.expiresAt.slice(0, 10)}T23:59:59`);
      if (Number.isNaN(expiresAt.getTime())) throw new BadRequestException("Expiry date is not valid");
    }
    const pasted = input.generation === "custom" ? (input.token ?? "").trim() : "";
    if (pasted && (pasted.length < 12 || pasted.length > 120)) throw new BadRequestException("API key must be 12 to 120 characters");
    const token = pasted || freshKey(input.keyType);
    const secret = (input.secret ?? "").trim();
    let altHash: string | null = null;
    if (secret && secret !== token) {
      if (secret.length < 12 || secret.length > 120) throw new BadRequestException("Secret key must be 12 to 120 characters");
      altHash = hashKey(secret);
      const clash = await this.prisma.merchantKey.findFirst({
        where: { OR: [{ secretHash: altHash }, { altHash }] },
      });
      if (clash) throw new BadRequestException("That key is already in use");
    }
    try {
      const row = await this.prisma.merchantKey.create({
        data: {
          ownerId,
          label: input.label.trim(),
          prefix: token.slice(0, 16),
          secretHash: hashKey(token),
          altHash,
          keyType: input.keyType,
          abilities,
          webhookUrl,
          expiresAt,
          active: input.active,
        },
      });
      return { id: row.id, label: row.label, prefix: row.prefix, keyType: row.keyType, token };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new BadRequestException("That key is already in use");
      }
      throw error;
    }
  }

  async updateKey(
    ownerId: string,
    id: string,
    input: {
      label?: string;
      keyType?: "checkout" | "sms";
      abilities?: string[];
      webhookUrl?: string;
      expiresAt?: string;
      active?: boolean;
      token?: string;
      secret?: string;
      generate?: boolean;
    },
  ) {
    const existing = await this.prisma.merchantKey.findFirst({ where: { id, ownerId } });
    if (!existing) throw new NotFoundException("Key not found");
    const data: {
      label?: string;
      keyType?: string;
      abilities?: string[];
      webhookUrl?: string;
      expiresAt?: Date | null;
      active?: boolean;
      prefix?: string;
      secretHash?: string;
      altHash?: string | null;
    } = {};
    if (input.label !== undefined) {
      const label = input.label.trim();
      if (label.length < 2 || label.length > 80) throw new BadRequestException("Key name must be 2 to 80 characters");
      data.label = label;
    }
    if (input.keyType !== undefined) data.keyType = input.keyType;
    if (input.abilities !== undefined) {
      const abilities = [...new Set(input.abilities.filter((item) => keyAbilities.includes(item)))];
      if (abilities.length === 0) throw new BadRequestException("Choose at least one ability");
      data.abilities = abilities;
    }
    if (input.webhookUrl !== undefined) {
      const webhookUrl = input.webhookUrl.trim();
      if (webhookUrl) {
        try {
          const url = new URL(webhookUrl);
          if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
        } catch {
          throw new BadRequestException("Webhook URL must start with http:// or https://");
        }
      }
      data.webhookUrl = webhookUrl;
    }
    if (input.expiresAt !== undefined) {
      if (!input.expiresAt) data.expiresAt = null;
      else {
        const expiresAt = new Date(`${input.expiresAt.slice(0, 10)}T23:59:59`);
        if (Number.isNaN(expiresAt.getTime())) throw new BadRequestException("Expiry date is not valid");
        data.expiresAt = expiresAt;
      }
    }
    if (input.active !== undefined) data.active = input.active;
    const keyType = input.keyType ?? existing.keyType;
    let issued = (input.token ?? "").trim();
    if (!issued && input.generate) issued = freshKey(keyType);
    if (issued) {
      if (issued.length < 12 || issued.length > 120) throw new BadRequestException("API key must be 12 to 120 characters");
      data.prefix = issued.slice(0, 16);
      data.secretHash = hashKey(issued);
    }
    if (input.secret !== undefined) {
      const secret = input.secret.trim();
      if (!secret || (issued && secret === issued)) data.altHash = null;
      else {
        if (secret.length < 12 || secret.length > 120) throw new BadRequestException("Secret key must be 12 to 120 characters");
        data.altHash = hashKey(secret);
      }
    }
    if (Object.keys(data).length === 0) throw new BadRequestException("Nothing to update");
    if (data.altHash) {
      const clash = await this.prisma.merchantKey.findFirst({
        where: { NOT: { id }, OR: [{ secretHash: data.altHash }, { altHash: data.altHash }] },
      });
      if (clash) throw new BadRequestException("That key is already in use");
    }
    if (data.secretHash) {
      const clash = await this.prisma.merchantKey.findFirst({
        where: { NOT: { id }, altHash: data.secretHash },
      });
      if (clash) throw new BadRequestException("That key is already in use");
    }
    try {
      const updated = await this.prisma.merchantKey.updateMany({ where: { id, ownerId }, data });
      if (updated.count === 0) throw new NotFoundException("Key not found");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new BadRequestException("That key is already in use");
      }
      throw error;
    }
    return { ok: true as const, token: input.generate && issued ? issued : undefined };
  }

  async removeKey(ownerId: string, id: string) {
    const removed = await this.prisma.merchantKey.deleteMany({ where: { id, ownerId } });
    if (removed.count === 0) throw new NotFoundException("Key not found");
    return { ok: true };
  }

  listHandsets(ownerId: string) {
    return this.prisma.handset.findMany({
      where: { ownerId },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, uid: true, label: true, model: true, battery: true, simSlot: true, lastSeenAt: true },
    });
  }

  async saveHandset(ownerId: string, id: string, input: { label: string; simSlot?: number }) {
    const label = input.label.trim();
    if (label.length < 2 || label.length > 80) throw new BadRequestException("Device name must be 2 to 80 characters");
    if (input.simSlot !== undefined && input.simSlot !== 0 && input.simSlot !== 1) throw new BadRequestException("Choose SIM 1 or SIM 2");
    const updated = await this.prisma.handset.updateMany({
      where: { id, ownerId },
      data: { label, ...(input.simSlot === 0 || input.simSlot === 1 ? { simSlot: input.simSlot } : {}) },
    });
    if (updated.count === 0) throw new NotFoundException("Device not found");
    if (input.simSlot === 0 || input.simSlot === 1) {
      await this.prisma.outboundSms.updateMany({
        where: { handsetId: id, status: "queued" },
        data: { simSlot: input.simSlot },
      });
    }
    return { ok: true };
  }

  async removeHandset(ownerId: string, id: string) {
    const removed = await this.prisma.handset.deleteMany({ where: { id, ownerId } });
    if (removed.count === 0) throw new NotFoundException("Device not found");
    return { ok: true };
  }

  listCustomers(ownerId: string) {
    return this.prisma.customer.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" } });
  }

  createCustomer(ownerId: string, input: { name: string; email?: string; phone?: string }) {
    return this.prisma.customer.create({
      data: {
        ownerId,
        name: input.name.trim(),
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
      },
    });
  }

  async removeCustomer(ownerId: string, id: string) {
    const removed = await this.prisma.customer.deleteMany({ where: { id, ownerId } });
    if (removed.count === 0) throw new NotFoundException("Customer not found");
    return { ok: true };
  }

  async smsLogs(ownerId: string) {
    const rows = await this.prisma.inboxNotice.findMany({
      where: { handset: { ownerId } },
      include: { handset: true, checkout: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      sender: row.sender,
      body: row.body,
      handset: row.handset.label,
      checkout: row.checkout?.publicId ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async settings(ownerId: string) {
    const row = await this.prisma.brandSetting.findUnique({ where: { ownerId } });
    return {
      brandName: row?.brandName ?? "UniqBD Pay",
      supportEmail: row?.supportEmail ?? "",
      currency: row?.currency ?? "BDT",
      checkoutNote: row?.checkoutNote ?? "",
      prefs: cleanPrefs(row?.prefs),
    };
  }

  async saveSettings(
    ownerId: string,
    input: { brandName: string; supportEmail?: string; currency?: string; checkoutNote?: string; prefs?: Record<string, string> },
  ) {
    const current = await this.prisma.brandSetting.findUnique({ where: { ownerId } });
    const data = {
      brandName: input.brandName.trim(),
      supportEmail: input.supportEmail?.trim() ?? "",
      currency: (input.currency ?? "BDT").trim().toUpperCase(),
      checkoutNote: input.checkoutNote?.trim() ?? "",
      prefs: { ...cleanPrefs(current?.prefs), ...cleanPrefs(input.prefs) },
    };
    const row = await this.prisma.brandSetting.upsert({
      where: { ownerId },
      create: { ownerId, ...data },
      update: data,
    });
    return {
      brandName: row.brandName,
      supportEmail: row.supportEmail,
      currency: row.currency,
      checkoutNote: row.checkoutNote,
      prefs: cleanPrefs(row.prefs),
    };
  }

  async reports(ownerId: string) {
    const now = new Date();
    const yearAgo = new Date(now.getFullYear() - 1, 0, 1);
    const rows = await this.prisma.checkout.findMany({
      where: { ownerId, createdAt: { gte: yearAgo } },
      select: { status: true, payable: true, createdAt: true },
    });
    const bounds = reportBounds(now);
    return Object.fromEntries(
      Object.entries(bounds).map(([key, range]) => {
        const slice = rows.filter((row) => row.createdAt >= range.start && row.createdAt < range.end);
        const paid = slice.filter((row) => row.status === "paid");
        const amount = paid.reduce((sum, row) => sum + Number(row.payable), 0);
        return [
          key,
          {
            amount: amount.toFixed(2),
            completed: paid.length,
            total: slice.length,
            successRate: slice.length === 0 ? 0 : Math.round((paid.length / slice.length) * 100),
          },
        ];
      }),
    );
  }

  async publicSite() {
    const owner = await this.prisma.deskUser.findFirst({ where: { deskId: null }, orderBy: { createdAt: "asc" } });
    if (!owner) return this.blankSite();
    return this.siteView(owner.id);
  }

  async publicPay(id: string) {
    const row = await this.prisma.checkout.findUnique({ where: { publicId: id }, include: { method: true } });
    if (!row) throw new NotFoundException("Checkout not found");
    const expired = row.expiresAt.getTime() < Date.now() && (row.status === "open" || row.status === "waiting");
    if (expired && row.status !== "expired") {
      await this.prisma.checkout.update({ where: { id: row.id }, data: { status: "expired" } });
      row.status = "expired";
    }
    if (row.status === "waiting" && row.method && row.method.verifyBy !== "unique_amount" && !row.method.shiftAmount) {
      const priced = priceAmount(Number(row.amount), row.method);
      if (Math.abs(priced - Number(row.payable)) > 0.001) {
        const saved = await this.prisma.checkout.update({ where: { id: row.id }, data: { payable: priced }, include: { method: true } });
        return this.checkoutCard(saved, true);
      }
    }
    return this.checkoutCard(row, row.status === "open" || row.status === "waiting");
  }

  async chooseMethod(id: string, methodId: string) {
    const row = await this.prisma.checkout.findUnique({ where: { publicId: id } });
    if (!row) throw new NotFoundException("Checkout not found");
    if (row.status === "paid") return this.publicPay(id);
    if (row.status !== "open" && row.status !== "waiting") {
      throw new BadRequestException("This checkout can no longer be changed");
    }
    if (row.expiresAt.getTime() < Date.now()) throw new BadRequestException("This checkout has expired");
    const method = await this.ownMethod(row.ownerId, methodId);
    if (!method.active) throw new BadRequestException("That method is turned off");
    const amount = Number(row.amount);
    const max = Number(method.maxAmount);
    if (amount < Number(method.minAmount) || (max > 0 && amount > max)) {
      throw new BadRequestException("Amount is outside the limit for this method");
    }
    const priced = priceAmount(amount, method);
    const accounts = accountList(method.accountNumber);
    const payTo = accounts.length === 0 ? "" : accounts[method.accountCursor % accounts.length];
    const minutes = Math.max(5, method.payWindow > 0 ? method.payWindow : 15);
    const shifted = method.verifyBy === "unique_amount" || method.shiftAmount;
    await this.prisma.$transaction(async (tx) => {
      if (shifted) await this.lockKey(tx, `slot:${method.id}`);
      const payable = shifted ? await this.allocatePayable(row.id, method, priced) : priced;
      if (accounts.length > 1) {
        await tx.walletMethod.update({
          where: { id: method.id },
          data: { accountCursor: method.accountCursor + 1 },
        });
      }
      await tx.checkout.update({
        where: { id: row.id },
        data: {
          methodId: method.id,
          payable,
          payTo,
          providerRef: null,
          status: "waiting",
          expiresAt: new Date(Date.now() + minutes * 60 * 1000),
        },
      });
    });
    return this.publicPay(id);
  }

  async submitProof(id: string, input: { providerRef?: string; payerAccount?: string; receipt?: string }) {
    const row = await this.prisma.checkout.findUnique({ where: { publicId: id }, include: { method: true } });
    if (!row) throw new NotFoundException("Checkout not found");
    if (row.status !== "waiting" && row.status !== "pending") throw new BadRequestException("Choose a payment method first");
    if (row.expiresAt.getTime() < Date.now() && row.status !== "pending") {
      throw new BadRequestException("This checkout has expired");
    }
    const verifyBy = row.method?.verifyBy ?? "transaction_id";
    const providerRef = (input.providerRef ?? "").trim().toUpperCase();
    const payerAccount = (input.payerAccount ?? "").trim();
    const receipt = input.receipt?.startsWith("data:image/") ? input.receipt : "";
    if (input.receipt && !receipt) throw new BadRequestException("Receipt must be an image");
    if (providerRef && !trxRefOk(providerRef)) {
      throw new BadRequestException("Enter the transaction ID from the payment message");
    }
    if (verifyBy === "transaction_id" && !providerRef && !row.providerRef) {
      throw new BadRequestException("Enter the transaction ID from the payment message");
    }
    if (verifyBy === "sender_number" && !providerRef && !senderNumberOk(payerAccount || row.payerAccount || "")) {
      throw new BadRequestException("Sender number must start with 01 and be exactly 11 digits (e.g. 01XXXXXXXXX).");
    }
    if (receipt && !row.method?.acceptProof) {
      throw new BadRequestException("This method does not accept a receipt");
    }
    if (providerRef) {
      return this.claimByReference(row, providerRef, payerAccount);
    }
    await this.prisma.checkout.update({
      where: { id: row.id },
      data: {
        payerAccount: payerAccount || row.payerAccount,
        receipt: receipt || undefined,
      },
    });
    const notices = await this.prisma.inboxNotice.findMany({
      where: { handset: { ownerId: row.ownerId }, checkoutId: null },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    for (const notice of notices) {
      const matched = await this.matchOwner(row.ownerId, notice.body, notice.id, notice.sender);
      if (matched) break;
    }
    const fresh = await this.publicPay(id);
    const linked = await this.prisma.inboxNotice.findFirst({ where: { checkoutId: row.id } });
    if (fresh.status === "paid" || linked) return fresh;
    if (receipt && row.method?.acceptProof) {
      await this.prisma.checkout.update({ where: { id: row.id }, data: { status: "pending" } });
      return this.publicPay(id);
    }
    if (verifyBy !== "transaction_id") return fresh;
    throw new BadRequestException("That payment was not found");
  }

  private async claimByReference(
    row: {
      id: string;
      publicId: string;
      ownerId: string;
      amount: unknown;
      payable: unknown;
      billId: string | null;
      method: { label: string; verifyBy: string; underTolerance: unknown; overTolerance: unknown; holdAbove: unknown; holdUnmatched: boolean } | null;
    },
    providerRef: string,
    payerAccount: string,
  ) {
    await this.reserveReference(row.ownerId, row.id, providerRef);
    const notices = await this.prisma.inboxNotice.findMany({
      where: { handset: { ownerId: row.ownerId }, checkoutId: null },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    const under = Number(row.method?.underTolerance ?? 0);
    const over = Number(row.method?.overTolerance ?? 0);
    const expected = Number(row.payable);
    const base = Number(row.amount);
    const verifyBy = row.method?.verifyBy ?? "transaction_id";
    const floor = verifyBy === "unique_amount" && expected > base + 0.001 ? Math.max(0, base - under) : expected - under;
    const cap = verifyBy === "unique_amount" ? expected + (over > 0 ? over : 0) : over > 0 ? expected + over : Number.POSITIVE_INFINITY;
    const hits = notices.filter((notice) =>
      isPaymentSender(notice.sender)
      && !isOtpMessage(notice.body)
      && !looksLikeDebit(notice.body)
      && (verifyBy !== "unique_amount" || isCreditMessage(notice.body))
      && bodyHasRef(notice.body, providerRef)
      && readTrxId(notice.body) === providerRef
      && senderFitsMethod(notice.sender, notice.body, row.method?.label ?? ""),
    );
    const fit = hits.find((notice) => {
      const paid = parsePaidAmount(notice.body);
      if (paid === null) return false;
      return paid + 0.001 >= floor && paid <= cap + 0.001;
    });
    if (!fit) {
      if (hits.length > 0) {
        throw new BadRequestException("Payment amount mismatch. The amount recorded for this Transaction ID does not match the required amount.");
      }
      if (row.method?.holdUnmatched) {
        await this.reserveReference(row.ownerId, row.id, providerRef, { status: "pending", payerAccount });
        return this.publicPay(row.publicId);
      }
      throw new BadRequestException("Transaction ID not found in recorded SMS. Please ensure the payment has been completed and try again.");
    }
    const held = Number(row.method?.holdAbove ?? 0) > 0 && expected + 0.001 >= Number(row.method?.holdAbove ?? 0);
    const paidNow = await this.prisma.$transaction(async (tx) => {
      await this.lockKey(tx, `${row.ownerId}:${providerRef}`);
      const used = await tx.checkout.findFirst({
        where: { ownerId: row.ownerId, providerRef, id: { not: row.id }, status: { in: ["waiting", "pending", "paid"] } },
        select: { id: true },
      });
      if (used) throw new BadRequestException("This Transaction ID is already used on another order.");
      const claimed = await tx.inboxNotice.updateMany({
        where: { id: fit.id, checkoutId: null },
        data: { checkoutId: row.id },
      });
      if (claimed.count !== 1) return false;
      const saved = await tx.checkout.updateMany({
        where: { id: row.id, status: { in: ["waiting", "pending"] } },
        data: { status: held ? "pending" : "paid", providerRef, ...(payerAccount ? { payerAccount } : {}) },
      });
      if (saved.count !== 1) {
        await tx.inboxNotice.update({ where: { id: fit.id }, data: { checkoutId: null } });
        return false;
      }
      if (!held && row.billId) await tx.bill.update({ where: { id: row.billId }, data: { status: "paid" } });
      return !held;
    });
    if (paidNow) {
      const fresh = await this.prisma.checkout.findUnique({ where: { id: row.id } });
      if (fresh) this.notifyGateway({ ...fresh, status: "paid" });
    }
    return this.publicPay(row.publicId);
  }

  async pulse(userId: string, input: { uid: string; label?: string; model?: string; battery?: number }) {
    const existing = await this.prisma.handset.findUnique({ where: { uid: input.uid } });
    if (existing) {
      if (existing.ownerId !== userId) throw new ForbiddenException("This device is already registered");
      const handset = await this.prisma.handset.update({
        where: { id: existing.id },
        data: { model: input.model, battery: input.battery, lastSeenAt: new Date() },
      });
      return { id: handset.id, label: handset.label, simSlot: handset.simSlot, lastSeenAt: handset.lastSeenAt };
    }
    try {
      const handset = await this.prisma.handset.create({
        data: {
          ownerId: userId,
          uid: input.uid,
          label: input.label?.trim() || "Android handset",
          model: input.model,
          battery: input.battery,
          lastSeenAt: new Date(),
        },
      });
      return { id: handset.id, label: handset.label, simSlot: handset.simSlot, lastSeenAt: handset.lastSeenAt };
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
      const raced = await this.prisma.handset.findUnique({ where: { uid: input.uid } });
      if (!raced || raced.ownerId !== userId) throw new ForbiddenException("This device is already registered");
      const handset = await this.prisma.handset.update({
        where: { id: raced.id },
        data: { model: input.model, battery: input.battery, lastSeenAt: new Date() },
      });
      return { id: handset.id, label: handset.label, simSlot: handset.simSlot, lastSeenAt: handset.lastSeenAt };
    }
  }

  private async expireOutbound(where: { handsetId: string } | { handset: { ownerId: string } }) {
    const missed = new Date(Date.now() - 10 * 60 * 1000);
    const unconfirmed = new Date(Date.now() - 90 * 1000);
    await this.prisma.outboundSms.updateMany({
      where: { ...where, status: "queued", createdAt: { lt: missed } },
      data: { status: "failed", error: "The phone did not pick up this message. Open the AuGetway app and queue it again." },
    });
    await this.prisma.outboundSms.updateMany({
      where: { ...where, status: "sending", updatedAt: { lt: unconfirmed } },
      data: { status: "failed", error: "The phone did not confirm the send" },
    });
  }

  async queueSms(ownerId: string, input: { handsetId: string; to: string; body: string }) {
    const to = bdMobile(input.to);
    if (!to) throw new BadRequestException("Use a Bangladesh mobile number, like 01XXXXXXXXX");
    const body = input.body.trim();
    if (body.length < 1 || body.length > 320) throw new BadRequestException("Message must be 1 to 320 characters");
    const handset = await this.prisma.handset.findFirst({ where: { id: input.handsetId, ownerId } });
    if (!handset) throw new NotFoundException("Device not found");
    await this.expireOutbound({ handsetId: handset.id });
    const waiting = await this.prisma.outboundSms.count({ where: { handsetId: handset.id, status: { in: ["queued", "sending"] } } });
    if (waiting >= 1) throw new BadRequestException("This phone is already sending a message. Wait until it finishes.");
    const job = await this.prisma.outboundSms.create({
      data: { handsetId: handset.id, toNumber: to, body, simSlot: handset.simSlot === 1 ? 1 : 0 },
    });
    return { id: job.id, status: job.status, simSlot: job.simSlot };
  }

  async listOutbound(ownerId: string) {
    await this.expireOutbound({ handset: { ownerId } });
    const rows = await this.prisma.outboundSms.findMany({
      where: { handset: { ownerId } },
      include: { handset: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      handsetId: row.handsetId,
      handset: row.handset.label,
      to: row.toNumber,
      body: row.body,
      simSlot: row.simSlot,
      status: row.status,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async pollJobs(userId: string, uid: string) {
    const handset = await this.ownedHandset(userId, uid);
    await this.expireOutbound({ handsetId: handset.id });
    const waiting = await this.prisma.outboundSms.findMany({
      where: { handsetId: handset.id, status: "queued" },
      orderBy: { createdAt: "asc" },
      take: 1,
    });
    const jobs = [];
    for (const job of waiting) {
      const claimed = await this.prisma.outboundSms.updateMany({
        where: { id: job.id, status: "queued" },
        data: { status: "sending" },
      });
      if (claimed.count === 1) {
        jobs.push({ id: job.id, to: job.toNumber, body: job.body, simSlot: job.simSlot });
      }
    }
    return { simSlot: handset.simSlot === 1 ? 1 : 0, jobs };
  }

  async finishJob(userId: string, id: string, input: { uid: string; ok: boolean; error?: string }) {
    const handset = await this.ownedHandset(userId, input.uid);
    const current = await this.prisma.outboundSms.findFirst({ where: { id, handsetId: handset.id } });
    if (!current) throw new NotFoundException("Message not found");
    if (current.status === "sent") return { ok: true };
    const updated = await this.prisma.outboundSms.updateMany({
      where: { id, handsetId: handset.id, status: "sending" },
      data: input.ok ? { status: "sent", error: "" } : { status: "failed", error: (input.error || "Could not send").slice(0, 180) },
    });
    if (updated.count === 0) throw new NotFoundException("Message not found");
    return { ok: true };
  }

  private async ownedHandset(userId: string, uid: string) {
    const handset = await this.prisma.handset.findUnique({ where: { uid } });
    if (!handset || handset.ownerId !== userId) throw new NotFoundException("Register this handset first");
    return handset;
  }

  async notice(userId: string, input: { uid: string; body: string; sender?: string; receivedKey?: string }) {
    const handset = await this.prisma.handset.findUnique({ where: { uid: input.uid } });
    if (!handset || handset.ownerId !== userId) {
      throw new NotFoundException("Register this handset first");
    }
    const sender = input.sender?.trim() ?? "";
    const body = input.body.trim();
    if (!acceptInboundSms(sender, body)) {
      throw new BadRequestException("Only a wallet or bank payment message can be saved");
    }
    const receivedKey = input.receivedKey?.trim().slice(0, 80) || null;
    try {
      const saved = await this.prisma.inboxNotice.create({
        data: {
          handsetId: handset.id,
          body,
          sender,
          receivedKey,
        },
      });
      const matched = await this.matchOwner(userId, input.body, saved.id, input.sender ?? "");
      return { id: saved.id, matched };
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2002") || !receivedKey) throw error;
      const existing = await this.prisma.inboxNotice.findFirst({ where: { handsetId: handset.id, receivedKey } });
      return { id: existing?.id ?? "", matched: existing?.checkoutId ?? null, duplicate: true };
    }
  }

  async merchantCreate(token: string, input: { reference: string; amount: number; currency?: string; successUrl?: string; cancelUrl?: string }) {
    const key = await this.keyFromToken(token);
    this.requireAbility(key, "payment:checkout");
    const checkout = await this.createCheckout(key.ownerId, input);
    return { publicId: checkout.publicId, status: checkout.status, payable: checkout.payable };
  }

  async merchantGet(token: string, id: string) {
    const key = await this.keyFromToken(token);
    this.requireAbility(key, "payment:verify");
    const row = await this.prisma.checkout.findFirst({ where: { ownerId: key.ownerId, publicId: id }, include: { method: true } });
    if (!row) throw new NotFoundException("Checkout not found");
    return this.checkoutCard(row, false);
  }

  private async ensureOwner() {
    const email = (process.env.ADMIN_EMAIL ?? "admin@pay.uniqbd.com").toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    const existing = await this.prisma.deskUser.findUnique({ where: { email } });
    if (existing) return existing;
    if (!password) return null;
    return this.prisma.deskUser.create({
      data: {
        name: "UniqBD Desk",
        email,
        passwordHash: await bcrypt.hash(password, 12),
        receiptDefaulted: true,
      },
    });
  }

  private async applyReceiptDefault() {
    const owners = await this.prisma.deskUser.findMany({ where: { receiptDefaulted: false }, select: { id: true } });
    for (const owner of owners) {
      await this.prisma.walletMethod.updateMany({ where: { ownerId: owner.id }, data: { acceptProof: false } });
      await this.prisma.deskUser.update({ where: { id: owner.id }, data: { receiptDefaulted: true } });
    }
  }

  private async ensureCatalog(ownerId: string) {
    const seeded = await this.prisma.walletMethod.count({ where: { ownerId, sortOrder: { gt: 0 } } });
    if (seeded > 0) return;
    const catalog = [
      ["bKash Merchant", "Bkash Personal", true, 25000],
      ["Nagad Personal", "Nagad Personal", true, 25000],
      ["Rocket Personal", "Rocket Personal", true, 25000],
      ["Upay Personal", "Upay Personal", false, 25000],
      ["BanglaQR", "BanglaQR", false, 50000],
      ["bKash (EPS)", "bKash (EPS)", false, 50000],
      ["bKash API (Checkout)", "bKash API (Checkout)", false, 50000],
      ["Brac Bank", "Brac Bank", false, 500000],
      ["City Bank", "City Bank", false, 500000],
      ["Eastern Bank", "Eastern Bank", false, 500000],
      ["Islami Bank", "Islami Bank", false, 500000],
      ["Dutch-Bangla Bank", "Dutch-Bangla Bank", false, 500000],
      ["Dhaka Bank", "Dhaka Bank", false, 500000],
    ] as const;
    for (const [index, item] of catalog.entries()) {
      await this.prisma.walletMethod.create({
        data: {
          ownerId,
          label: item[0],
          code: item[1],
          accountNumber: "",
          minAmount: 1,
          maxAmount: item[3],
          active: item[2],
          sortOrder: index + 1,
        },
      });
    }
  }

  private methodView(
    row: {
      id: string;
      label: string;
      internalLabel: string;
      code: string;
      accountNumber: string;
      instructions: string;
      shiftAmount: boolean;
      active: boolean;
      sortOrder: number;
      minAmount: MoneyRow;
      maxAmount: MoneyRow;
      fixedCharge: MoneyRow;
      percentageCharge: MoneyRow;
      fixedDiscount: MoneyRow;
      percentageDiscount: MoneyRow;
      qrImage: string;
      verifyBy: string;
      payWindow: number;
      uniqueSlots: number;
      uniqueKind: string;
      acceptProof: boolean;
      holdUnmatched: boolean;
      holdAbove: MoneyRow;
      underTolerance: MoneyRow;
      overTolerance: MoneyRow;
    },
    withImage: boolean,
  ) {
    return {
      id: row.id,
      label: row.label,
      internalLabel: row.internalLabel,
      code: row.code || row.label,
      accountNumber: row.accountNumber,
      instructions: row.instructions,
      shiftAmount: row.shiftAmount,
      active: row.active,
      sortOrder: row.sortOrder,
      minAmount: money(row.minAmount),
      maxAmount: money(row.maxAmount),
      fixedCharge: money(row.fixedCharge),
      percentageCharge: money(row.percentageCharge),
      fixedDiscount: money(row.fixedDiscount),
      percentageDiscount: money(row.percentageDiscount),
      hasQr: Boolean(row.qrImage),
      qrImage: withImage ? row.qrImage : "",
      verifyBy: row.verifyBy,
      payWindow: row.payWindow,
      uniqueSlots: row.uniqueSlots,
      uniqueKind: row.uniqueKind,
      acceptProof: row.acceptProof,
      holdUnmatched: row.holdUnmatched,
      holdAbove: money(row.holdAbove),
      underTolerance: money(row.underTolerance),
      overTolerance: money(row.overTolerance),
    };
  }

  private assertLimits(minAmount: number, maxAmount: number) {
    if (maxAmount > 0 && maxAmount < minAmount) {
      throw new BadRequestException("Maximum must be at least the minimum");
    }
  }

  private async requireOwner(actorId: string, deskId: string) {
    if (actorId !== deskId) throw new ForbiddenException("Only the main admin can open accounts");
    const user = await this.prisma.deskUser.findUnique({ where: { id: actorId } });
    if (!user || user.deskId) throw new ForbiddenException("Only the main admin can open accounts");
  }

  private session(user: { id: string; email: string; name: string; deskId: string | null }) {
    const accessToken = this.jwt.sign({ sub: user.deskId ?? user.id, email: user.email, actor: user.id });
    return {
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.deskId ? "admin" : "owner" },
    };
  }

  private async ownMethod(ownerId: string, id: string) {
    const method = await this.prisma.walletMethod.findFirst({ where: { id, ownerId } });
    if (!method) throw new NotFoundException("Payment method not found");
    return method;
  }

  private async allocatePayable(
    checkoutId: string,
    method: { id: string; verifyBy: string; uniqueKind: string; uniqueSlots: number; shiftAmount: boolean },
    amount: number,
  ) {
    const pending = await this.prisma.checkout.findMany({
      where: {
        methodId: method.id,
        id: { not: checkoutId },
        status: { in: ["open", "waiting", "pending"] },
        expiresAt: { gt: new Date() },
      },
      select: { payable: true },
    });
    const taken = new Set(pending.map((row) => money(row.payable)));
    const slots = method.verifyBy === "unique_amount" ? Math.max(1, method.uniqueSlots) : 400;
    const kind = method.verifyBy === "unique_amount" ? method.uniqueKind : "decimal";
    const base = kind === "integer" ? Math.ceil(amount - 1e-9) : amount;
    const stepSize = kind === "integer" ? 1 : 0.01;
    const room = kind === "integer" || method.verifyBy === "unique_amount" ? slots : 400;
    for (let step = 0; step <= room; step += 1) {
      const candidate = (base + step * stepSize).toFixed(2);
      if (!taken.has(candidate)) return Number(candidate);
    }
    if (method.verifyBy === "unique_amount") {
      throw new BadRequestException("Every amount slot is in use. Try again in a few minutes.");
    }
    return Number((base + randomInt(1, 400) * stepSize).toFixed(2));
  }

  private async matchOwner(ownerId: string, body: string, noticeId?: string, sender = "") {
    if (!isPaymentSender(sender) || isOtpMessage(body) || looksLikeDebit(body)) return null;
    const paidAmount = parsePaidAmount(body);
    const smsRef = readTrxId(body);
    const open = { status: { in: ["waiting", "pending"] }, expiresAt: { gt: new Date() } };
    const waiting = await this.prisma.checkout.findMany({
      where: smsRef
        ? { ownerId, OR: [open, { status: "pending", providerRef: smsRef }] }
        : { ownerId, ...open },
      include: { method: true },
    });
    const claimed = new Set(
      (
        await this.prisma.checkout.findMany({
          where: { ownerId, status: "paid", providerRef: { not: null } },
          select: { providerRef: true },
        })
      )
        .map((row) => (row.providerRef ?? "").toUpperCase())
        .filter(Boolean),
    );
    if (smsRef && claimed.has(smsRef)) return null;
    const named = smsRef
      ? waiting.find((row) => (row.providerRef ?? "").toUpperCase() === smsRef && senderFitsMethod(sender, body, row.method?.label ?? ""))
      : undefined;
    if (named) {
      const payable = Number(named.payable);
      const base = Number(named.amount);
      const under = Number(named.method?.underTolerance ?? 0);
      const over = Number(named.method?.overTolerance ?? 0);
      const verifyBy = named.method?.verifyBy ?? "transaction_id";
      if (verifyBy === "unique_amount" && !isCreditMessage(body)) return null;
      const floor = verifyBy === "unique_amount" && payable > base + 0.001 ? Math.max(0, base - under) : payable - under;
      const cap = verifyBy === "unique_amount" ? payable + (over > 0 ? over : 0) : over > 0 ? payable + over : Number.POSITIVE_INFINITY;
      const ok = paidAmount !== null && paidAmount + 0.001 >= floor && paidAmount <= cap + 0.001;
      if (!ok) return null;
    }
    const fits = named ? [named] : waiting.filter((row) => {
      const method = row.method;
      const payable = Number(row.payable);
      const under = method ? Number(method.underTolerance) : 0;
      const over = method ? Number(method.overTolerance) : 0;
      const verifyBy = method?.verifyBy ?? "transaction_id";
      if (!senderFitsMethod(sender, body, method?.label ?? "")) return false;
      const stored = (row.providerRef ?? "").toUpperCase();
      if (stored && smsRef && stored !== smsRef) return false;
      if (verifyBy === "sender_number") {
        return senderInNotice(row.payerAccount ?? "", body) && paidAmount !== null && amountFits(paidAmount, payable, under, over);
      }
      if (verifyBy === "unique_amount") {
        if (!smsRef || !isCreditMessage(body) || (stored && stored !== smsRef)) return false;
        return paidAmount !== null && Math.abs(paidAmount - payable) < 0.001;
      }
      if (!stored || !bodyHasRef(body, stored) || claimed.has(stored)) return false;
      return paidAmount !== null && amountFits(paidAmount, payable, under, over);
    });
    const ranked = fits.sort((left, right) => {
      if (paidAmount === null) return 0;
      return Math.abs(paidAmount - Number(left.payable)) - Math.abs(paidAmount - Number(right.payable));
    });
    const target = ranked[0];
    if (!target) return null;
    if (!named && ranked[1] && paidAmount !== null) {
      const first = Math.abs(paidAmount - Number(ranked[0].payable));
      const second = Math.abs(paidAmount - Number(ranked[1].payable));
      if (Math.abs(first - second) < 0.001) return null;
    }
    const holdAbove = target.method ? Number(target.method.holdAbove) : 0;
    const held = holdAbove > 0 && Number(target.payable) + 0.001 >= holdAbove;
    const savedRef = smsRef && !(target.providerRef ?? "") ? smsRef : "";
    const outcome = await this.prisma.$transaction(async (tx) => {
      if (smsRef) await this.lockKey(tx, `${ownerId}:${smsRef}`);
      if (smsRef) {
        const used = await tx.checkout.findFirst({
          where: { ownerId, providerRef: smsRef, id: { not: target.id }, status: { in: ["waiting", "pending", "paid"] } },
          select: { id: true },
        });
        if (used) return "miss" as const;
      }
      if (noticeId) {
        const claimedNotice = await tx.inboxNotice.updateMany({
          where: { id: noticeId, checkoutId: null },
          data: { checkoutId: target.id },
        });
        if (claimedNotice.count !== 1) return "miss" as const;
      }
      const saved = await tx.checkout.updateMany({
        where: {
          id: target.id,
          status: { in: ["waiting", "pending"] },
          ...(savedRef ? { OR: [{ providerRef: null }, { providerRef: "" }] } : {}),
        },
        data: { status: held ? "pending" : "paid", ...(savedRef ? { providerRef: savedRef } : {}) },
      });
      if (saved.count !== 1) {
        if (noticeId) await tx.inboxNotice.updateMany({ where: { id: noticeId, checkoutId: target.id }, data: { checkoutId: null } });
        return "miss" as const;
      }
      if (!held && target.billId) await tx.bill.update({ where: { id: target.billId }, data: { status: "paid" } });
      return held ? "held" as const : "paid" as const;
    });
    if (outcome === "miss") return null;
    if (outcome === "paid") this.notifyGateway({ ...target, status: "paid" });
    return target.publicId;
  }

  private async lockKey(tx: { $executeRaw: PrismaService["$executeRaw"] }, key: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(CAST(${key} AS text)))`;
  }

  private async reserveReference(ownerId: string, checkoutId: string, providerRef: string, save?: { status: "pending"; payerAccount: string }) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockKey(tx, `${ownerId}:${providerRef}`);
      const used = await tx.checkout.findFirst({
        where: { ownerId, providerRef, id: { not: checkoutId }, status: { in: ["waiting", "pending", "paid"] } },
        select: { id: true },
      });
      if (used) throw new BadRequestException("This Transaction ID is already used on another order.");
      if (!save) return;
      const saved = await tx.checkout.updateMany({
        where: { id: checkoutId, status: { in: ["waiting", "pending"] } },
        data: { status: save.status, providerRef, ...(save.payerAccount ? { payerAccount: save.payerAccount } : {}) },
      });
      if (saved.count !== 1) throw new BadRequestException("This checkout can no longer be changed");
    });
  }

  private async keyFromToken(token: string) {
    const hash = hashKey(token);
    const key = await this.prisma.merchantKey.findUnique({ where: { secretHash: hash } })
      ?? await this.prisma.merchantKey.findFirst({ where: { altHash: hash } });
    if (!key || !key.active) throw new UnauthorizedException("Merchant key is not valid");
    if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("Merchant key has expired");
    }
    return key;
  }

  private requireAbility(key: { abilities: unknown }, ability: string) {
    const list = Array.isArray(key.abilities) ? key.abilities : [];
    if (!list.includes(ability)) throw new UnauthorizedException("This key does not allow that action");
  }

  private blankSite(): SiteCard {
    return {
      brandName: "UniqBD Pay",
      supportEmail: "",
      supportPhone: "",
      currency: "BDT",
      currencySymbol: "",
      checkoutNote: "",
      brandLogo: "",
      brandFavicon: "",
      themeAccent: "",
      checkoutTheme: "",
      faqTitle: "",
      faqContent: "",
      metaTitle: "",
      metaDescription: "",
    };
  }

  private async siteView(ownerId: string): Promise<SiteCard> {
    const row = await this.settings(ownerId);
    const theme = row.prefs.checkoutTheme;
    return {
      brandName: row.brandName || "UniqBD Pay",
      supportEmail: row.supportEmail,
      supportPhone: row.prefs.supportPhone ?? "",
      currency: row.currency || "BDT",
      currencySymbol: row.prefs.currencySymbol ?? "",
      checkoutNote: row.checkoutNote,
      brandLogo: row.prefs.brandLogo ?? "",
      brandFavicon: row.prefs.brandFavicon ?? "",
      themeAccent: accentColor(row.prefs.themeAccent),
      checkoutTheme: theme === "clean_light" || theme === "modern_dark" ? theme : "",
      faqTitle: row.prefs.faqTitle ?? "",
      faqContent: row.prefs.faqContent ?? "",
      metaTitle: row.prefs.metaTitle ?? "",
      metaDescription: row.prefs.metaDescription ?? "",
    };
  }

  private async checkoutCard(
    row: {
      publicId: string;
      reference: string;
      amount: MoneyRow;
      payable: MoneyRow;
      currency: string;
      status: string;
      payerAccount: string | null;
      providerRef: string | null;
      payTo: string;
      receipt: string;
      expiresAt: Date;
      createdAt: Date;
      successUrl: string | null;
      cancelUrl?: string | null;
      ownerId: string;
      method: {
        id: string;
        label: string;
        accountNumber: string;
        instructions: string;
        qrImage: string;
        verifyBy: string;
        acceptProof: boolean;
      } | null;
    },
    includeMethods: boolean,
    includeReceipt = false,
    site?: SiteCard,
  ) {
    const methods = includeMethods
      ? await this.prisma.walletMethod.findMany({
          where: { ownerId: row.ownerId, active: true },
          select: { id: true, label: true, accountNumber: true },
          orderBy: { label: "asc" },
        })
      : undefined;
    return {
      publicId: row.publicId,
      reference: row.reference,
      amount: money(row.amount),
      payable: money(row.payable),
      currency: row.currency,
      status: row.status,
      payerAccount: row.payerAccount,
      providerRef: row.providerRef,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      hasReceipt: Boolean(row.receipt),
      receipt: includeReceipt ? row.receipt : "",
      successUrl: row.successUrl,
      cancelUrl: row.cancelUrl ?? null,
      method: row.method
        ? {
            id: row.method.id,
            label: row.method.label,
            accountNumber: shownAccount(row.payTo, row.method.accountNumber),
            instructions: row.method.instructions,
            qrImage: row.method.qrImage,
            verifyBy: row.method.verifyBy,
            acceptProof: row.method.acceptProof,
          }
        : null,
      methods,
      site: site ?? (await this.siteView(row.ownerId)),
    };
  }
}
