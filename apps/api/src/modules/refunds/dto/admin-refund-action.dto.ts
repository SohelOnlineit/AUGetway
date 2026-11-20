import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class AdminRefundActionDto {
  @IsIn(["APPROVE", "REJECT", "MARK_PROCESSING", "RECORD_RESULT"])
  action!: "APPROVE" | "REJECT" | "MARK_PROCESSING" | "RECORD_RESULT";

  @IsString()
  @MinLength(8)
  @MaxLength(1000)
  reason!: string;

  /** Required for RECORD_RESULT */
  @IsOptional()
  @IsIn(["success", "failure"])
  result?: "success" | "failure";

  /**
   * Explicit refund destination. Required when approving if changing from default,
   * or when recording wallet credit path.
   */
  @IsOptional()
  @IsIn(["ORIGINAL_PROVIDER", "WALLET"])
  destination?: "ORIGINAL_PROVIDER" | "WALLET";

  @IsOptional()
  @IsString()
  @MaxLength(128)
  providerRef?: string;
}
