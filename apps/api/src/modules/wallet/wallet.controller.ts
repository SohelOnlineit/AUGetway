import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { WalletService } from "./wallet.service";

class ListWalletTransactionsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * Owner-only wallet reads. No credit/debit/adjustment endpoints.
 */
@Controller("wallet")
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  getWallet(@CurrentUser() user: AuthenticatedUser) {
    return this.wallet.getWalletForUser(user.id);
  }

  @Get("transactions")
  listTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWalletTransactionsQuery,
  ) {
    return this.wallet.listTransactionsForUser(user.id, query.limit ?? 50);
  }
}
