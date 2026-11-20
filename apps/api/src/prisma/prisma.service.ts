import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>("database.url");
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log("Prisma connected");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Prisma connection failed: ${message}`);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async ping(): Promise<boolean> {
    await this.$queryRaw`SELECT 1`;
    return true;
  }
}
