import { Controller, Delete, Get, Param, Post, Req, Res, ServiceUnavailableException, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { pipeline } from "node:stream/promises";
import { BackupService } from "./backup.service";
import { DeskGuard, type DeskSession } from "./desk.guard";
import { requireMainAdmin } from "./main-admin";

type DeskRequest = Request & { desk: DeskSession };


@Controller("desk/backups")
@UseGuards(DeskGuard)
export class BackupController {
  constructor(private readonly backups: BackupService) {}

  @Get()
  status(@Req() request: DeskRequest) {
    requireMainAdmin(request, "backups");
    return this.backups.status();
  }

  @Get("files")
  async files(@Req() request: DeskRequest) {
    requireMainAdmin(request, "backups");
    return { files: await this.backups.listFiles() };
  }

  @Post("database")
  saveDatabase(@Req() request: DeskRequest) {
    requireMainAdmin(request, "backups");
    return this.backups.saveDatabase();
  }

  @Get("files/:name")
  async download(@Req() request: DeskRequest, @Param("name") name: string, @Res() response: Response) {
    requireMainAdmin(request, "backups");
    const file = await this.backups.openFile(name);
    response.setHeader("content-type", "application/sql; charset=utf-8");
    response.setHeader("content-disposition", `attachment; filename="${name}"`);
    response.setHeader("content-length", String(file.bytes));
    response.setHeader("cache-control", "no-store");
    try {
      await pipeline(file.stream, response);
    } catch {
      if (!response.headersSent) throw new ServiceUnavailableException("Download failed");
      response.end();
    }
  }

  @Delete("files/:name")
  async remove(@Req() request: DeskRequest, @Param("name") name: string) {
    requireMainAdmin(request, "backups");
    await this.backups.deleteFile(name);
    return { ok: true };
  }
}
