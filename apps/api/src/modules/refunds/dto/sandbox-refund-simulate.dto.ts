import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

export class SandboxRefundSimulateDto {
  @IsIn(["success", "failure"])
  outcome!: "success" | "failure";

  @IsString()
  @MinLength(8)
  @MaxLength(1000)
  reason!: string;
}
