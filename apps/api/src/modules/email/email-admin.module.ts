import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailAdminController } from "./email-admin.controller";

@Module({
  imports: [AuthModule],
  controllers: [EmailAdminController],
})
export class EmailAdminModule {}
