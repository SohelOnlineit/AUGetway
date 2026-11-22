import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { DeskGuard, type DeskSession } from "./desk.guard";
import { DomainDto, DomainUpdateDto } from "./dto";
import { requireMainAdmin } from "./main-admin";
import { SiteDomainService } from "./site-domain.service";

type DeskRequest = Request & { desk: DeskSession };

/**
 * The website addresses and how each one looks. Only the main admin may change them: an address added here is
 * trusted for payment links and cross-site calls, so a staff account must not be able to add one.
 */
@Controller("desk/domains")
@UseGuards(DeskGuard)
export class DomainsController {
  constructor(private readonly domains: SiteDomainService) {}

  @Get()
  list(@Req() request: DeskRequest) {
    requireMainAdmin(request, "website addresses");
    return this.domains.list(request.desk.sub);
  }

  @Post()
  create(@Req() request: DeskRequest, @Body() body: DomainDto) {
    requireMainAdmin(request, "website addresses");
    return this.domains.create(request.desk.sub, body);
  }

  @Patch(":id")
  update(@Req() request: DeskRequest, @Param("id") id: string, @Body() body: DomainUpdateDto) {
    requireMainAdmin(request, "website addresses");
    return this.domains.update(request.desk.sub, id, body);
  }

  @Delete(":id")
  remove(@Req() request: DeskRequest, @Param("id") id: string) {
    requireMainAdmin(request, "website addresses");
    return this.domains.remove(request.desk.sub, id);
  }
}
