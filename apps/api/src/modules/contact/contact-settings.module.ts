import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ContactSettingsController } from "./contact-settings.controller";
import { ContactSettingsService } from "./contact-settings.service";

@Module({
  imports: [AuthModule],
  controllers: [ContactSettingsController],
  providers: [ContactSettingsService],
})
export class ContactSettingsModule {}
