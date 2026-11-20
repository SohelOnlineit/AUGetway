import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SmsModule } from "../sms/sms.module";
import { CustomerMessagesController } from "./customer-messages.controller";
import { CustomerMessagesService } from "./customer-messages.service";

@Module({
  imports: [AuthModule, SmsModule],
  controllers: [CustomerMessagesController],
  providers: [CustomerMessagesService],
})
export class CustomerMessagesModule {}