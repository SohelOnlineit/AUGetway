import type { AdminPage } from "./admin";
import type {
  PaymentIntentStatusPublic,
  PaymentProviderPublic,
  PublicRefundDetail,
  PublicRefundListItem,
  RefundDestinationPublic,
  RefundStatusPublic,
} from "./commerce";

export type {
  PublicRefundDetail,
  PublicRefundListItem,
  RefundDestinationPublic,
  RefundStatusPublic,
};

export type AdminRefundAction =
  | "APPROVE"
  | "REJECT"
  | "MARK_PROCESSING"
  | "RECORD_RESULT";

export interface AdminPaymentListItem {
  id: string;
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  provider: PaymentProviderPublic;
  status: PaymentIntentStatusPublic;
  amountMinor: number;
  currency: string;
  externalRef: string | null;
  paymentMethod: string | null;
  transactionId: string | null;
  refundedMinor: number;
  pendingRefundMinor: number;
  succeededAt: string | null;
  createdAt: string;
}

export interface AdminPaymentDetail extends AdminPaymentListItem {
  events: Array<{
    id: string;
    kind: string;
    providerEventId: string;
    createdAt: string;
  }>;
  refunds: PublicRefundListItem[];
}

export interface AdminRefundListItem extends PublicRefundListItem {
  customerEmail: string;
  customerId: string;
  paymentIntentId: string | null;
  providerRef: string | null;
  allowedActions: AdminRefundAction[];
}

export interface AdminRefundDetail extends AdminRefundListItem {
  history: PublicRefundDetail["history"];
  payment: {
    id: string;
    provider: PaymentProviderPublic;
    status: PaymentIntentStatusPublic;
    externalRef: string | null;
    amountMinor: number;
  } | null;
}

export type AdminPaymentPage = AdminPage<AdminPaymentListItem>;
export type AdminRefundPage = AdminPage<AdminRefundListItem>;
