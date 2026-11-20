import { Module } from "@nestjs/common";
import { RoleProfilesService } from "./role-profiles.service";

@Module({
  providers: [RoleProfilesService],
  exports: [RoleProfilesService],
})
export class RoleProfilesModule {}
