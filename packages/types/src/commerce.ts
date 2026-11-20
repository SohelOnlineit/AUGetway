export type OrderStatusPublic =
  | "PENDING_PAYMENT"
  | "PAID"
  | "FULFILLED"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "CANCELLED";

export type FulfillmentStatusPublic =
  | "NOT_STARTED"
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED";

export type PaymentIntentStatusPublic =
  | "REQUIRES_CONFIRMATION"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

export type PaymentProviderPublic = "SANDBOX" | "UDDOKTAPAY";

export type SandboxSimulateOutcome = "success" | "failure";

/** Label/value snapshot of a product "Your information" answer. */
export interface PublicCustomerAnswer {
  label: string;
  value: string;
}

export interface PublicCartItem {
  id: string;
  productId: string;
  title: string;
  slug: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  currency: string;
  availableQuantity: number;
  primaryImageUrl: string | null;
  shortDescription: string | null;
  packageValueId: string | null;
  packageName: string | null;
  region: string | null;
  customerInputs: PublicCustomerAnswer[];
}

export interface PublicCart {
  id: string;
  items: PublicCartItem[];
  itemCount: number;
  subtotalMinor: number;
  currency: string;
}

export interface PublicOrderItem {
  id: string;
  productId: string;
  titleSnapshot: string;
  slugSnapshot: string;
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
  customerInputs: PublicCustomerAnswer[];
}

/** Plaintext codes — only present for owner + paid/fulfilled deliveries. */
export interface PublicOrderDelivery {
  id: string;
  orderItemId: string;
  productId: string;
  titleSnapshot: string;
  packageName: string | null;
  region: string | null;
  code: string;
  deliveredAt: string;
}

export interface PublicRefundSummary {
  refundedMinor: number;
  pendingMinor: number;
  refundableMinor: number;
  fullyRefunded: boolean;
}

export interface PublicOrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatusPublic;
  fulfillmentStatus: FulfillmentStatusPublic;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  couponCode: string | null;
  totalMinor: number;
  refundedMinor: number;
  reservationExpiresAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  itemCount: number;
  /** WALLET or DIRECT (gateway). */
  originChannel: string;
  /** First product title, for the orders list. */
  headline: string;
}

export interface PublicOrderDetail extends PublicOrderSummary {
  items: PublicOrderItem[];
  /** Empty unless order is paid/fulfilled and deliveries exist. */
  deliveries: PublicOrderDelivery[];
  refundSummary: PublicRefundSummary;
  refunds: PublicRefundListItem[];
  /** bKash, Nagad, Rocket, Wallet, or Gateway. */
  paymentMethod: string | null;
  /** Mobile-wallet transaction id, when the gateway sent one. */
  transactionId: string | null;
}

export type RefundStatusPublic =
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export type RefundDestinationPublic = "ORIGINAL_PROVIDER" | "WALLET";

export interface PublicRefundListItem {
  id: string;
  orderId: string;
  orderNumber: string;
  amountMinor: number;
  currency: string;
  status: RefundStatusPublic;
  destination: RefundDestinationPublic;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicRefundDetail extends PublicRefundListItem {
  paymentIntentId: string | null;
  providerRef: string | null;
  history: Array<{
    id: string;
    fromStatus: RefundStatusPublic | null;
    toStatus: RefundStatusPublic;
    reason: string | null;
    createdAt: string;
  }>;
}

export interface PublicPaymentIntent {
  id: string;
  orderId: string;
  orderNumber: string;
  provider: PaymentProviderPublic;
  status: PaymentIntentStatusPublic;
  amountMinor: number;
  currency: string;
  expiresAt: string;
  sandboxMode: boolean;
  checkoutPath: string;
  /** Live gateway redirect. Null for sandbox. */
  checkoutUrl: string | null;
  createdAt: string;
}
