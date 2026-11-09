import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { DeskGuard, type DeskSession } from "./desk.guard";
import {
  BillDto,
  BulkIdsDto,
  CheckoutDto,
  ChooseMethodDto,
  CustomerDto,
  HandsetDto,
  KeyDto,
  KeyUpdateDto,
  LinkDto,
  AccountDto,
  LoginDto,
  MethodDto,
  NoticeDto,
  ProofDto,
  PulseDto,
  SettingsDto,
  StartLinkDto,
  UddoktaCheckoutDto,
  UddoktaVerifyDto,
} from "./dto";
import { PayService } from "./pay.service";

type DeskRequest = Request & { desk: DeskSession };

@Controller()
export class PayController {
  constructor(private readonly pay: PayService) {}

  @Get("health")
  health() {
    return { ok: true, service: "uniqpay" };
  }

  @Post("auth/login")
  login(@Body() body: LoginDto) {
    return this.pay.login(body.email, body.password);
  }

  @Get("auth/me")
  @UseGuards(DeskGuard)
  me(@Req() request: DeskRequest) {
    return this.pay.me(request.desk.sub);
  }

  @Patch("auth/account")
  @UseGuards(DeskGuard)
  account(@Req() request: DeskRequest, @Body() body: AccountDto) {
    return this.pay.updateAccount(request.desk.sub, body);
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

  @Get("desk/checkouts")
  @UseGuards(DeskGuard)
  checkouts(@Req() request: DeskRequest) {
    return this.pay.listCheckouts(request.desk.sub);
  }

  @Post("desk/checkouts")
  @UseGuards(DeskGuard)
  addCheckout(@Req() request: DeskRequest, @Body() body: CheckoutDto) {
    return this.pay.createCheckout(request.desk.sub, body);
  }

  @Post("desk/checkouts/:id/confirm")
  @UseGuards(DeskGuard)
  confirm(@Req() request: DeskRequest, @Param("id") id: string) {
    return this.pay.setStatus(request.desk.sub, id, "paid");
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

  @Get("desk/reports")
  @UseGuards(DeskGuard)
  reports(@Req() request: DeskRequest) {
    return this.pay.reports(request.desk.sub);
  }

  @Get("desk/settings")
  @UseGuards(DeskGuard)
  settings(@Req() request: DeskRequest) {
    return this.pay.settings(request.desk.sub);
  }

  @Post("desk/settings")
  @UseGuards(DeskGuard)
  saveSettings(@Req() request: DeskRequest, @Body() body: SettingsDto) {
    return this.pay.saveSettings(request.desk.sub, body);
  }

  @Get("public/pay/:id")
  payView(@Param("id") id: string) {
    return this.pay.publicPay(id);
  }

  @Post("public/pay/:id/method")
  payMethod(@Param("id") id: string, @Body() body: ChooseMethodDto) {
    return this.pay.chooseMethod(id, body.methodId);
  }

  @Post("public/pay/:id/proof")
  payProof(@Param("id") id: string, @Body() body: ProofDto) {
    return this.pay.submitProof(id, body);
  }

  @Get("public/bills/:number")
  bill(@Param("number") number: string) {
    return this.pay.publicBill(number);
  }

  @Post("public/bills/:number/start")
  startBill(@Param("number") number: string) {
    return this.pay.startBill(number);
  }

  @Get("public/links/:slug")
  link(@Param("slug") slug: string) {
    return this.pay.publicLink(slug);
  }

  @Post("public/links/:slug/start")
  startLink(@Param("slug") slug: string, @Body() body: StartLinkDto) {
    return this.pay.startLink(slug, body.reference);
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

  @Post("checkout-v2")
  uddoktaCheckout(
    @Headers("rt-uddoktapay-api-key") gatewayKey: string | undefined,
    @Headers("x-merchant-key") merchantKey: string | undefined,
    @Body() body: UddoktaCheckoutDto,
  ) {
    return this.pay.uddoktaCheckout(gatewayKey || merchantKey || "", body);
  }

  @Post("verify-payment")
  uddoktaVerify(
    @Headers("rt-uddoktapay-api-key") gatewayKey: string | undefined,
    @Headers("x-merchant-key") merchantKey: string | undefined,
    @Body() body: UddoktaVerifyDto,
  ) {
    return this.pay.uddoktaVerify(gatewayKey || merchantKey || "", body.invoice_id);
  }

  @Post("v1/checkouts")
  merchantCreate(@Headers("x-merchant-key") token: string, @Body() body: CheckoutDto) {
    return this.pay.merchantCreate(token ?? "", body);
  }

  @Get("v1/checkouts/:id")
  merchantGet(@Headers("x-merchant-key") token: string, @Param("id") id: string) {
    return this.pay.merchantGet(token ?? "", id);
  }
}
