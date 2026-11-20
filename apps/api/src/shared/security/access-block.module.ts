import { Global, Module } from "@nestjs/common";
import { AccessBlockService } from "./access-block.service";

@Global()
@Module({
  providers: [AccessBlockService],
  exports: [AccessBlockService],
})
export class AccessBlockModule {}
