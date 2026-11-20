import { Module } from "@nestjs/common";
import { RoleProfilesModule } from "../storefront/role-profiles.module";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";

@Module({
  imports: [RoleProfilesModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
