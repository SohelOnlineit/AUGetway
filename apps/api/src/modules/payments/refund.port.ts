import type { PaymentProvider } from "../../generated/prisma/client";

export const REFUND_PORT = Symbol("REFUND_PORT");

export type ProviderRefundOutcome = "pending" | "succeeded" | "failed";

export interface ProviderRefundResult {
  status: ProviderRefundOutcome;
  providerEventId: string;
  failureReason?: string;
}

/**
 * Provider-agnostic refund adapter.
 * Live gateways implement later. Without a real provider, adapters must not
 * claim automatic success — admin records external results explicitly.
 */
export interface RefundPort {
  readonly provider: PaymentProvider;

  /**
   * Attempt provider-side refund. Default/sandbox returns `pending` unless
   * an explicit development simulation was recorded.
   */
  initiateRefund(input: {
    externalRef: string;
    amountMinor: number;
    currency: string;
    refundId: string;
  }): Promise<ProviderRefundResult>;

  /**
   * Development-only simulation of an external refund callback.
   * Production implementations must throw / be unavailable.
   */
  simulateRefundResult?(
    externalRef: string,
    outcome: "success" | "failure",
  ): Promise<ProviderRefundResult>;
}
