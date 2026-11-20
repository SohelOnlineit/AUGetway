import type { PaymentIntentStatus, PaymentProvider } from "../../generated/prisma/client";

export const PAYMENT_PORT = Symbol("PAYMENT_PORT");

export type SandboxOutcome = "success" | "failure";

export interface CreatePaymentIntentInput {
  orderId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  expiresAt: Date;
}

export interface CreatePaymentIntentResult {
  provider: PaymentProvider;
  externalRef: string;
  checkoutPath: string;
  status: PaymentIntentStatus;
}

export interface ProviderVerificationResult {
  status: "succeeded" | "failed" | "pending" | "expired";
  providerEventId: string;
  failureReason?: string;
}

/**
 * Provider-agnostic payment adapter.
 * Live gateways implement this later; sandbox is the only adapter now.
 */
export interface PaymentPort {
  readonly provider: PaymentProvider;

  createIntent(input: CreatePaymentIntentInput): Promise<CreatePaymentIntentResult>;

  /**
   * Development-only simulation. Production implementations must throw.
   */
  simulateConfirmation?(
    externalRef: string,
    outcome: SandboxOutcome,
  ): Promise<ProviderVerificationResult>;

  verify(externalRef: string): Promise<ProviderVerificationResult>;

  /** Stub until a live provider supports refunds. */
  refund?(externalRef: string, amountMinor: number): Promise<never>;
}
