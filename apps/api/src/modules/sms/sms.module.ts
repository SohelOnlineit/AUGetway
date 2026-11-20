import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SmsController } from "./sms.controller";
import { SmsGatewayService } from "./sms.service";

@Module({
  imports: [AuthModule],
  controllers: [SmsController],
  providers: [SmsGatewayService],
  exports: [SmsGatewayService],
})
export class SmsModule {}
