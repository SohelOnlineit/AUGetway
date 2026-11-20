import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * Sandbox simulation request — NOT a trusted client “I paid” flag.
 * Outcome only selects mock success/failure in non-production.
 */
export class SandboxConfirmDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  paymentIntentId!: string;

  @IsOptional()
  @IsIn(["success", "failure"])
  outcome?: "success" | "failure";
}
