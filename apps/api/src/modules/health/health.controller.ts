import { Controller, Get, HttpException, HttpStatus } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { HealthService } from "./health.service";

@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  root() {
    return this.health.live();
  }

  @Get("live")
  live() {
    return this.health.live();
  }

  @Get("ready")
  async ready() {
    const report = await this.health.ready();
    if (report.status === "down") {
      throw new HttpException(report, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }

  @Get("deploy-info")
  deployInfo() {
    return this.health.deployInfo();
  }
}
