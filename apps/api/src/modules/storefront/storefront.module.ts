import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";
import { GuestShopperService } from "./guest-shopper.service";
import { RoleProfilesModule } from "./role-profiles.module";
import { ShopperGuard } from "./shopper.guard";
import { StorefrontController } from "./storefront.controller";

@Module({
  imports: [AuthModule, UsersModule, RoleProfilesModule],
  controllers: [StorefrontController],
  providers: [GuestShopperService, ShopperGuard],
  exports: [RoleProfilesModule, GuestShopperService, ShopperGuard, AuthModule, UsersModule],
})
export class StorefrontModule {}
