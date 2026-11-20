import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomBytes } from "node:crypto";
import {
  PaymentIntentStatus,
  PaymentProvider,
} from "../../generated/prisma/client";
import type {
  CreatePaymentIntentInput,
  CreatePaymentIntentResult,
  PaymentPort,
  ProviderVerificationResult,
  SandboxOutcome,
} from "./payment.port";

/**
 * Development-only sandbox/mock payment provider.
 * Construction and all methods refuse to run when NODE_ENV=production
 * or when PAYMENT_SANDBOX_ENABLED is not explicitly true outside production.
 */
@Injectable()
export class SandboxPaymentProvider implements PaymentPort {
  readonly provider = PaymentProvider.SANDBOX;
  private readonly logger = new Logger(SandboxPaymentProvider.name);
  private readonly outcomes = new Map<
    string,
    ProviderVerificationResult
  >();

  constructor(private readonly config: ConfigService) {}

  static isSandboxRuntimeAllowed(config: ConfigService): boolean {
    const nodeEnv = config.get<string>("app.nodeEnv") ?? "development";
    if (nodeEnv === "production") return false;
    return config.get<boolean>("payments.sandboxEnabled") === true;
  }

  async createIntent(
    input: CreatePaymentIntentInput,
  ): Promise<CreatePaymentIntentResult> {
    this.assertSandboxAllowed("createIntent");
    const externalRef = `sandbox_${input.orderId}_${randomBytes(8).toString("hex")}`;
    this.outcomes.set(externalRef, {
      status: "pending",
      providerEventId: `pending_${externalRef}`,
    });
    return {
      provider: PaymentProvider.SANDBOX,
      externalRef,
      checkoutPath: `/checkout/pay/${input.orderId}`,
      status: PaymentIntentStatus.REQUIRES_CONFIRMATION,
    };
  }

  async simulateConfirmation(
    externalRef: string,
    outcome: SandboxOutcome,
  ): Promise<ProviderVerificationResult> {
    this.assertSandboxAllowed("simulateConfirmation");
    const providerEventId = `sandbox_evt_${createHmac("sha256", "sandbox")
      .update(`${externalRef}:${outcome}:${Date.now()}`)
      .digest("hex")
      .slice(0, 32)}`;

    const result: ProviderVerificationResult =
      outcome === "success"
        ? { status: "succeeded", providerEventId }
        : {
            status: "failed",
            providerEventId,
            failureReason: "Sandbox simulated failure",
          };

    this.outcomes.set(externalRef, result);
    this.logger.log(
      `Sandbox simulation recorded for ref=${externalRef} outcome=${outcome}`,
    );
    return result;
  }

  async verify(externalRef: string): Promise<ProviderVerificationResult> {
    this.assertSandboxAllowed("verify");
    return (
      this.outcomes.get(externalRef) ?? {
        status: "pending",
        providerEventId: `verify_pending_${externalRef}`,
      }
    );
  }

  async refund(): Promise<never> {
    throw new ServiceUnavailableException(
      "Refunds are not implemented for the sandbox provider",
    );
  }

  private assertSandboxAllowed(action: string): void {
    if (SandboxPaymentProvider.isSandboxRuntimeAllowed(this.config)) return;
    this.logger.error(`Sandbox payment blocked for action=${action}`);
    throw new ServiceUnavailableException(
      "Sandbox payment provider is disabled in this environment",
    );
  }
}
