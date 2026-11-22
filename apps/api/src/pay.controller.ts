import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { DeskGuard, type DeskSession } from "./desk.guard";
import {
  BillDto,
  BillUpdateDto,
  BulkIdsDto,
  CheckoutDto,
  ChooseMethodDto,
  CustomerDto,
  HandsetDto,
  BalanceCheckDto,
  BalanceDecisionDto,
  BalanceWriteDto,
  JobResultDto,
  JobsQueryDto,
  KeyDto,
  KeyUpdateDto,
  LinkDto,
  LinkUpdateDto,
  AccountDto,
  AdminDto,
  ApproveDto,
  EditCheckoutDto,
  LoginDto,
  MethodDto,
  OfficialGatewayDto,
  NoticeBatchDto,
  NoticeDto,
  ProofDto,
  PulseDto,
  PublicSmsDto,
  QueueSmsDto,
  SettingsDto,
  StartBillDto,
  StartLinkDto,
  UddoktaCheckoutDto,
  UddoktaVerifyDto,
} from "./dto";
import { PayService } from "./pay.service";
import { PaymentSecurityService } from "./payment-security.service";
import { isMainAdmin } from "./main-admin";
import { clientAddress, RateLimit } from "./rate-limit";
import { TurnstileService } from "./turnstile.service";

type DeskRequest = Request & { desk: DeskSession };

// Limits are per visitor address. Many phone customers can share one address, so the public ones are generous.
// The checkout page asks for its status every 2 seconds, which is why the read limit is high.

@Controller()
export class PayController {
  constructor(
    private readonly pay: PayService,
    private readonly security: PaymentSecurityService,
    private readonly turnstile: TurnstileService,
  ) {}

  @Get("health")
  health() {
    return { ok: true, service: "uniqpay" };
  }

  @Post("auth/login")
  @RateLimit("login", 30, 900)
  async login(@Body() body: LoginDto, @Req() request: Request) {
    // The phone app cannot show the Cloudflare widget, so only its own client name skips the check.
    // Wrong-password attempts are still limited per address, per email and per pair for everyone.
    if (body.client !== "handset") await this.turnstile.assert(body.turnstileToken);
    return this.pay.login(body.email, body.password, body.client, clientAddress(request), body.code);
  }

  @Get("auth/me")
  @UseGuards(DeskGuard)
  me(@Req() request: DeskRequest) {
    return this.pay.me(request.desk.actor || request.desk.sub);
  }

  @Patch("auth/account")
  @UseGuards(DeskGuard)
  account(@Req() request: DeskRequest, @Body() body: AccountDto) {
    return this.pay.updateAccount(request.desk.actor || request.desk.sub, body, clientAddress(request));
  }

  @Get("desk/admins")
  @UseGuards(DeskGuard)
  admins(@Req() request: DeskRequest) {
    return this.pay.listAdmins(request.desk.actor || request.desk.sub, request.desk.sub);
  }

  @Post("desk/admins")
  @UseGuards(DeskGuard)
  addAdmin(@Req() request: DeskRequest, @Body() body: AdminDto) {
    return this.pay.createAdmin(request.desk.actor || request.desk.sub, request.desk.sub, body);
  }

  @Delete("desk/admins/:id")
  @UseGuards(DeskGuard)
  removeAdmin(@Req() request: DeskRequest, @Param("id") id: string) {
    return this.pay.removeAdmin(request.desk.actor || request.desk.sub, request.desk.sub, id);
  }

  @Get("desk/summary")
  @UseGuards(DeskGuard)
  summary(@Req() request: DeskRequest) {
    return this.pay.summary(request.desk.sub);
  }

  @Get("desk/methods")
  @UseGuards(DeskGuard)
  methods(@Req() request: DeskRequest) {
    return this.pay.listMethods(request.desk.sub);
  }

  @Get("desk/methods/:id")
  @UseGuards(DeskGuard)
  method(@Req() request: DeskRequest, @Param("id") id: string) {
    return this.pay.getMethod(request.desk.sub, id);
  }

  @Post("desk/methods")
  @UseGuards(DeskGuard)
  addMethod(@Req() request: DeskRequest, @Body() body: MethodDto) {
    return this.pay.createMethod(request.desk.sub, body);
  }

  @Patch("desk/methods/:id")
  @UseGuards(DeskGuard)
  editMethod(@Req() request: DeskRequest, @Param("id") id: string, @Body() body: MethodDto) {
    return this.pay.updateMethod(request.desk.sub, id, body);
  }

  @Post("desk/methods/bulk-delete")
  @UseGuards(DeskGuard)
  removeMethods(@Req() request: DeskRequest, @Body() body: BulkIdsDto) {
    return this.pay.removeMethods(request.desk.sub, body.ids);
  }

  @Post("desk/methods/reorder")
  @UseGuards(DeskGuard)
  reorderMethods(@Req() request: DeskRequest, @Body() body: BulkIdsDto) {
    return this.pay.reorderMethods(request.desk.sub, body.ids);
  }

  @Get("desk/official-gateways")
  @UseGuards(DeskGuard)
  officialGateways(@Req() request: DeskRequest) {
    return this.pay.listOfficialGateways(request.desk.sub);
  }

  @Post("desk/official-gateways")
  @UseGuards(DeskGuard)
  addOfficialGateway(@Req() request: DeskRequest, @Body() body: OfficialGatewayDto) {
    return this.pay.createOfficialGateway(request.desk.sub, body);
  }

  @Patch("desk/official-gateways/:id")
  @UseGuards(DeskGuard)
  editOfficialGateway(@Req() request: DeskRequest, @Param("id") id: string, @Body() body: OfficialGatewayDto) {
    return this.pay.updateOfficialGateway(request.desk.sub, id, body);
  }

  @Delete("desk/official-gateways/:id")
  @UseGuards(DeskGuard)
  removeOfficialGateway(@Req() request: DeskRequest, @Param("id") id: string) {
    return this.pay.removeOfficialGateway(request.desk.sub, id);
  }

  @Get("desk/checkouts")
  @UseGuards(DeskGuard)
  checkouts(@Req() request: DeskRequest) {
    return this.pay.listCheckouts(request.desk.sub);
  }

  @Get("desk/checkouts/:id/receipt")
  @UseGuards(DeskGuard)
  receipt(@Req() request: DeskRequest, @Param("id") id: string) {
    return this.pay.receiptFor(request.desk.sub, id);
  }

  @Post("desk/checkouts")
  @UseGuards(DeskGuard)
  addCheckout(@Req() request: DeskRequest, @Body() body: CheckoutDto) {
    return this.pay.createCheckout(request.desk.sub, body);
  }

  @Post("desk/checkouts/:id/confirm")
  @UseGuards(DeskGuard)
  confirm(@Req() request: DeskRequest, @Param("id") id: string, @Body() body: ApproveDto) {
    return this.pay.setStatus(request.desk.sub, id, "paid", body?.providerRef);
  }

  @Patch("desk/checkouts/:id")
  @UseGuards(DeskGuard)
  editCheckout(@Req() request: DeskRequest, @Param("id") id: string, @Body() body: EditCheckoutDto) {
    return this.pay.editCheckout(request.desk.sub, id, body);
  }

  @Delete("desk/checkouts/:id")
  @UseGuards(DeskGuard)
  removeCheckout(@Req() request: DeskRequest, @Param("id") id: string) {
    return this.pay.removeCheckouts(request.desk.sub, [id], isMainAdmin(request));
  }

  @Post("desk/checkouts/bulk-delete")
  @UseGuards(DeskGuard)
  removeCheckouts(@Req() request: DeskRequest, @Body() body: BulkIdsDto) {
    return this.pay.removeCheckouts(request.desk.sub, body.ids, isMainAdmin(request));
  }

  @Post("desk/checkouts/delete-all")
  @UseGuards(DeskGuard)
  removeAllCheckouts(@Req() request: DeskRequest) {
    return this.pay.removeAllCheckouts(request.desk.sub, isMainAdmin(request));
  }

  @Post("desk/checkouts/:id/fail")
  @UseGuards(DeskGuard)
  fail(@Req() request: DeskRequest, @Param("id") id: string) {
    return this.pay.setStatus(request.desk.sub, id, "failed");
  }

  @Get("desk/bills")
  @UseGuards(DeskGuard)
  bills(@Req() request: DeskRequest) {
    return this.pay.listBills(request.desk.sub);
  }

  @Post("desk/bills")
  @UseGuards(DeskGuard)
  addBill(@Req() request: DeskRequest, @Body() body: BillDto) {
    return this.pay.createBill(request.desk.sub, body);
  }

  @Patch("desk/bills/:number")
  @UseGuards(DeskGuard)
  editBill(@Req() request: DeskRequest, @Param("number") number: string, @Body() body: BillUpdateDto) {
    return this.pay.editBill(request.desk.sub, number, body);
  }

  @Post("desk/bills/bulk-delete")
  @UseGuards(DeskGuard)
  removeBills(@Req() request: DeskRequest, @Body() body: BulkIdsDto) {
    return this.pay.removeBills(request.desk.sub, body.ids);
  }

  @Get("desk/links")
  @UseGuards(DeskGuard)
  links(@Req() request: DeskRequest) {
    return this.pay.listLinks(request.desk.sub);
  }

  @Post("desk/links")
  @UseGuards(DeskGuard)
  addLink(@Req() request: DeskRequest, @Body() body: LinkDto) {
    return this.pay.createLink(request.desk.sub, body);
  }

  @Patch("desk/links/:slug")
  @UseGuards(DeskGuard)
  editLink(@Req() request: DeskRequest, @Param("slug") slug: string, @Body() body: LinkUpdateDto) {
    return this.pay.editLink(request.desk.sub, slug, body);
  }

  @Post("desk/links/bulk-delete")
  @UseGuards(DeskGuard)
  removeLinks(@Req() request: DeskRequest, @Body() body: BulkIdsDto) {
    return this.pay.removeLinks(request.desk.sub, body.ids);
  }

  @Get("desk/keys")
  @UseGuards(DeskGuard)
  keys(@Req() request: DeskRequest) {
    return this.pay.listKeys(request.desk.sub);
  }

  @Post("desk/keys")
  @UseGuards(DeskGuard)
  addKey(@Req() request: DeskRequest, @Body() body: KeyDto) {
    return this.pay.createKey(request.desk.sub, body);
  }

  @Patch("desk/keys/:id")
  @UseGuards(DeskGuard)
  setKey(@Req() request: DeskRequest, @Param("id") id: string, @Body() body: KeyUpdateDto) {
    return this.pay.updateKey(request.desk.sub, id, body);
  }

  @Delete("desk/keys/:id")
  @UseGuards(DeskGuard)
  removeKey(@Req() request: DeskRequest, @Param("id") id: string) {
    return this.pay.removeKey(request.desk.sub, id);
  }

  @Get("desk/handsets")
  @UseGuards(DeskGuard)
  handsets(@Req() request: DeskRequest) {
    return this.pay.listHandsets(request.desk.sub);
  }

  @Patch("desk/handsets/:id")
  @UseGuards(DeskGuard)
  saveHandset(@Req() request: DeskRequest, @Param("id") id: string, @Body() body: HandsetDto) {
    return this.pay.saveHandset(request.desk.sub, id, body);
  }

  @Delete("desk/handsets/:id")
  @UseGuards(DeskGuard)
  removeHandset(@Req() request: DeskRequest, @Param("id") id: string) {
    return this.pay.removeHandset(request.desk.sub, id);
  }

  @Get("desk/customers")
  @UseGuards(DeskGuard)
  customers(@Req() request: DeskRequest) {
    return this.pay.listCustomers(request.desk.sub);
  }

  @Post("desk/customers")
  @UseGuards(DeskGuard)
  addCustomer(@Req() request: DeskRequest, @Body() body: CustomerDto) {
    return this.pay.createCustomer(request.desk.sub, body);
  }

  @Delete("desk/customers/:id")
  @UseGuards(DeskGuard)
  removeCustomer(@Req() request: DeskRequest, @Param("id") id: string) {
    return this.pay.removeCustomer(request.desk.sub, id);
  }

  @Get("desk/sms-logs")
  @UseGuards(DeskGuard)
  smsLogs(@Req() request: DeskRequest) {
    return this.pay.smsLogs(request.desk.sub);
  }

  @Get("desk/security-events")
  @UseGuards(DeskGuard)
  securityEvents(@Req() request: DeskRequest) {
    return this.security.list(request.desk.sub);
  }

  @Get("desk/sms")
  @UseGuards(DeskGuard)
  outbound(@Req() request: DeskRequest) {
    return this.pay.listOutbound(request.desk.sub);
  }

  @Post("desk/sms")
  @UseGuards(DeskGuard)
  queueSms(@Req() request: DeskRequest, @Body() body: QueueSmsDto) {
    return this.pay.queueSms(request.desk.sub, body);
  }

  @Get("desk/reports")
  @UseGuards(DeskGuard)
  reports(@Req() request: DeskRequest) {
    return this.pay.reports(request.desk.sub);
  }

  @Get("desk/settings")
  @UseGuards(DeskGuard)
  settings(@Req() request: DeskRequest, @Query("light") light?: string) {
    return this.pay.settings(request.desk.sub, light === "1");
  }

  @Post("desk/settings")
  @UseGuards(DeskGuard)
  saveSettings(@Req() request: DeskRequest, @Body() body: SettingsDto) {
    return this.pay.saveSettings(request.desk.sub, body);
  }

  @Get("public/site")
  @RateLimit("public-read", 1200, 60)
  site() {
    return this.pay.publicSite();
  }

  @Get("public/brand/:kind")
  @RateLimit("public-read", 1200, 60)
  async brand(@Param("kind") kind: string, @Res() response: Response) {
    const asset = await this.pay.publicBrand(kind);
    if (!asset) {
      response.status(404).end();
      return;
    }
    response.status(200);
    response.setHeader("Content-Type", asset.mime);
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.end(asset.body);
  }

  @Get("public/pay/:id")
  @RateLimit("public-read", 1200, 60)
  payView(@Param("id") id: string) {
    return this.pay.publicPay(id);
  }

  @Post("public/pay/:id/method")
  @RateLimit("public-write", 120, 60)
  payMethod(@Param("id") id: string, @Body() body: ChooseMethodDto) {
    return this.pay.chooseMethod(id, body.methodId);
  }

  @Post("public/pay/:id/proof")
  @RateLimit("public-write", 120, 60)
  async payProof(@Param("id") id: string, @Body() body: ProofDto) {
    await this.turnstile.assert(body.turnstileToken);
    return this.pay.submitProof(id, body);
  }

  @Get("public/bills/:number")
  @RateLimit("public-read", 1200, 60)
  bill(@Param("number") number: string) {
    return this.pay.publicBill(number);
  }

  // Starting a bill or a link opens a new checkout row, so these are the tightest public limits.
  @Post("public/bills/:number/start")
  @RateLimit("public-start", 20, 60)
  async startBill(@Param("number") number: string, @Body() body: StartBillDto) {
    await this.turnstile.assert(body?.turnstileToken);
    return this.pay.startBill(number);
  }

  @Get("public/links/:slug")
  @RateLimit("public-read", 1200, 60)
  link(@Param("slug") slug: string) {
    return this.pay.publicLink(slug);
  }

  @Post("public/links/:slug/start")
  @RateLimit("public-start", 20, 60)
  async startLink(@Param("slug") slug: string, @Body() body: StartLinkDto) {
    await this.turnstile.assert(body.turnstileToken);
    return this.pay.startLink(slug, body);
  }

  @Post("handset/pulse")
  @UseGuards(DeskGuard)
  pulse(@Req() request: DeskRequest, @Body() body: PulseDto) {
    return this.pay.pulse(request.desk.sub, body);
  }

  @Post("handset/notice")
  @UseGuards(DeskGuard)
  notice(@Req() request: DeskRequest, @Body() body: NoticeDto) {
    return this.pay.notice(request.desk.sub, body);
  }

  @Post("handset/notices")
  @UseGuards(DeskGuard)
  noticeBatch(@Req() request: DeskRequest, @Body() body: NoticeBatchDto) {
    return this.pay.noticeBatch(request.desk.sub, body);
  }

  @Get("handset/jobs")
  @UseGuards(DeskGuard)
  jobs(@Req() request: DeskRequest, @Query() query: JobsQueryDto) {
    return this.pay.pollJobs(request.desk.sub, query.uid);
  }

  @Post("handset/jobs/:id")
  @UseGuards(DeskGuard)
  jobResult(@Req() request: DeskRequest, @Param("id") id: string, @Body() body: JobResultDto) {
    return this.pay.finishJob(request.desk.sub, id, body);
  }

  @Get("handset/balances")
  @UseGuards(DeskGuard)
  handsetBalances(@Req() request: DeskRequest, @Query() query: JobsQueryDto) {
    return this.pay.handsetBalances(request.desk.sub, query.uid);
  }

  @Post("handset/balances")
  @UseGuards(DeskGuard)
  saveHandsetBalance(@Req() request: DeskRequest, @Body() body: BalanceWriteDto) {
    return this.pay.saveHandsetBalance(request.desk.sub, body);
  }

  @Post("handset/balance-check")
  @UseGuards(DeskGuard)
  setBalanceCheck(@Req() request: DeskRequest, @Body() body: BalanceCheckDto) {
    return this.pay.setBalanceCheck(request.desk.sub, body.uid, body.on);
  }

  @Get("handset/balance-jobs")
  @UseGuards(DeskGuard)
  balanceJobs(@Req() request: DeskRequest, @Query() query: JobsQueryDto) {
    return this.pay.balanceJobs(request.desk.sub, query.uid);
  }

  @Post("handset/balance-jobs/:id")
  @UseGuards(DeskGuard)
  decideBalance(@Req() request: DeskRequest, @Param("id") id: string, @Body() body: BalanceDecisionDto) {
    return this.pay.decideBalance(request.desk.sub, id, body);
  }

  @Get("sms/status")
  @RateLimit("merchant-api", 600, 60)
  smsStatus(
    @Headers("rt-uddoktapay-api-key") gatewayKey: string | undefined,
    @Headers("x-merchant-key") merchantKey: string | undefined,
  ) {
    return this.pay.smsStatus(gatewayKey || merchantKey || "");
  }

  @Post("sms/send")
  @RateLimit("merchant-api", 600, 60)
  sendPublicSms(
    @Headers("rt-uddoktapay-api-key") gatewayKey: string | undefined,
    @Headers("x-merchant-key") merchantKey: string | undefined,
    @Body() body: PublicSmsDto,
  ) {
    return this.pay.sendPublicSms(gatewayKey || merchantKey || "", body);
  }

  @Post("checkout-v2")
  @RateLimit("merchant-api", 600, 60)
  uddoktaCheckout(
    @Headers("rt-uddoktapay-api-key") gatewayKey: string | undefined,
    @Headers("x-merchant-key") merchantKey: string | undefined,
    @Body() body: UddoktaCheckoutDto,
  ) {
    return this.pay.uddoktaCheckout(gatewayKey || merchantKey || "", body);
  }

  @Post("verify-payment")
  @RateLimit("merchant-api", 600, 60)
  uddoktaVerify(
    @Headers("rt-uddoktapay-api-key") gatewayKey: string | undefined,
    @Headers("x-merchant-key") merchantKey: string | undefined,
    @Body() body: UddoktaVerifyDto,
  ) {
    return this.pay.uddoktaVerify(gatewayKey || merchantKey || "", body.invoice_id);
  }

  @Post("v1/checkouts")
  @RateLimit("merchant-api", 600, 60)
  merchantCreate(@Headers("x-merchant-key") token: string, @Body() body: CheckoutDto) {
    return this.pay.merchantCreate(token ?? "", body);
  }

  @Get("v1/checkouts/:id")
  @RateLimit("merchant-api", 600, 60)
  merchantGet(@Headers("x-merchant-key") token: string, @Param("id") id: string) {
    return this.pay.merchantGet(token ?? "", id);
  }
}
