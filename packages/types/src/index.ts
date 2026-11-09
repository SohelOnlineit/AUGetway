export const CHECKOUT_STATUSES = ["open", "waiting", "paid", "failed", "expired"] as const;

export type CheckoutStatus = (typeof CHECKOUT_STATUSES)[number];

export type Money = string;

export type MethodCard = {
  id: string;
  label: string;
  accountNumber: string;
  instructions: string;
  qrImage?: string;
  verifyBy?: string;
  acceptProof?: boolean;
};

export type CheckoutCard = {
  publicId: string;
  reference: string;
  amount: Money;
  payable: Money;
  currency: string;
  status: CheckoutStatus | string;
  payerAccount: string | null;
  providerRef: string | null;
  expiresAt: string;
  hasReceipt?: boolean;
  receipt?: string;
  successUrl?: string | null;
  cancelUrl?: string | null;
  method: MethodCard | null;
  methods?: { id: string; label: string }[];
};
