import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";
import { PaymentProvider } from "../../generated/prisma/client";
import { SandboxPaymentProvider } from "./sandbox-payment.provider";
import type {
  ProviderRefundResult,
  RefundPort,
} from "./refund.port";

@Injectable()
export class SandboxRefundProvider implements RefundPort {
  readonly provider = PaymentProvider.SANDBOX;
  private readonly logger = new Logger(SandboxRefundProvider.name);
  private readonly simulated = new Map<string, ProviderRefundResult>();

  constructor(private readonly config: ConfigService) {}

  async initiateRefund(input: {
    externalRef: string;
    amountMinor: number;
    currency: string;
    refundId: string;
  }): Promise<ProviderRefundResult> {
    this.assertSandboxAllowed("initiateRefund");
    const simulated = this.simulated.get(input.externalRef);
    if (simulated) return simulated;
    // No live gateway — never auto-succeed. Admin must record external result.
    return {
      status: "pending",
      providerEventId: `sandbox_refund_pending_${input.refundId}`,
    };
  }

  async simulateRefundResult(
    externalRef: string,
    outcome: "success" | "failure",
  ): Promise<ProviderRefundResult> {
    this.assertSandboxAllowed("simulateRefundResult");
    const providerEventId = `sandbox_refund_${createHmac("sha256", "sandbox-refund")
      .update(`${externalRef}:${outcome}`)
      .digest("hex")
      .slice(0, 24)}`;
    const result: ProviderRefundResult =
      outcome === "success"
        ? { status: "succeeded", providerEventId }
        : {
            status: "failed",
            providerEventId,
            failureReason: "Sandbox simulated refund failure",
          };
    this.simulated.set(externalRef, result);
    this.logger.log(
      `Sandbox refund simulation recorded ref=${externalRef} outcome=${outcome}`,
    );
    return result;
  }

  private assertSandboxAllowed(action: string): void {
    if (SandboxPaymentProvider.isSandboxRuntimeAllowed(this.config)) return;
    this.logger.error(`Sandbox refund blocked for action=${action}`);
    throw new ServiceUnavailableException(
      "Sandbox refund provider is disabled in this environment",
    );
  }
}
