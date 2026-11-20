import type {
  PublicOrderDelivery,
  PublicOrderDetail,
  PublicOrderSummary,
  PublicRefundListItem,
  PublicRefundSummary,
  OrderStatusPublic,
  FulfillmentStatusPublic,
} from "@amarpin/types";
import type {
  Order,
  OrderDelivery,
  OrderItem,
  Refund,
} from "../../generated/prisma/client";
import { readStoredCustomerAnswers } from "../catalog/catalog.mapper";
import { RefundStatus } from "../../generated/prisma/client";

type OrderWithItems = Order & {
  items: OrderItem[];
  deliveries?: OrderDelivery[];
  refunds?: Refund[];
};

function orderHeadline(items: OrderItem[]): string {
  const title = items[0]?.titleSnapshot?.trim();
  if (!title) return "Order";
  if (items.length <= 1) return title;
  return `${title} + ${items.length - 1} more`;
}

const OPEN_REFUND_STATUSES: RefundStatus[] = [
  RefundStatus.REQUESTED,
  RefundStatus.APPROVED,
  RefundStatus.PROCESSING,
];

export function computeRefundSummary(
  order: Pick<Order, "totalMinor" | "refundedMinor">,
  refunds: Array<Pick<Refund, "amountMinor" | "status">> = [],
): PublicRefundSummary {
  const pendingMinor = refunds
    .filter((row) => OPEN_REFUND_STATUSES.includes(row.status))
    .reduce((sum, row) => sum + row.amountMinor, 0);
  const refundedMinor = order.refundedMinor;
  const refundableMinor = Math.max(
    order.totalMinor - refundedMinor - pendingMinor,
    0,
  );
  return {
    refundedMinor,
    pendingMinor,
    refundableMinor,
    // Only true once succeeded total covers order — never while pending.
    fullyRefunded: refundedMinor >= order.totalMinor && pendingMinor === 0,
  };
}

export function mapOrderSummary(order: OrderWithItems): PublicOrderSummary {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status as OrderStatusPublic,
    fulfillmentStatus: order.fulfillmentStatus as FulfillmentStatusPublic,
    currency: order.currency,
    subtotalMinor: order.subtotalMinor,
    discountMinor: order.discountMinor,
    couponCode: order.couponCode,
    totalMinor: order.totalMinor,
    refundedMinor: order.refundedMinor,
    reservationExpiresAt: order.reservationExpiresAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    originChannel: order.originChannel,
    headline: orderHeadline(order.items),
  };
}

export function mapRefundListItem(
  refund: Pick<
    Refund,
    | "id"
    | "orderId"
    | "amountMinor"
    | "currency"
    | "status"
    | "destination"
    | "reason"
    | "createdAt"
    | "updatedAt"
  >,
  orderNumber: string,
): PublicRefundListItem {
  return {
    id: refund.id,
    orderId: refund.orderId,
    orderNumber,
    amountMinor: refund.amountMinor,
    currency: refund.currency,
    status: refund.status,
    destination: refund.destination,
    reason: refund.reason,
    createdAt: refund.createdAt.toISOString(),
    updatedAt: refund.updatedAt.toISOString(),
  };
}

export function mapOrderDetail(
  order: OrderWithItems,
  deliveries: PublicOrderDelivery[] = [],
): PublicOrderDetail {
  const refunds = order.refunds ?? [];
  return {
    ...mapOrderSummary(order),
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      titleSnapshot: item.titleSnapshot,
      slugSnapshot: item.slugSnapshot,
      unitPriceMinor: item.unitPriceMinor,
      quantity: item.quantity,
      lineTotalMinor: item.lineTotalMinor,
      customerInputs: readStoredCustomerAnswers(item.customerInputs),
    })),
    deliveries,
    refundSummary: computeRefundSummary(order, refunds),
    refunds: refunds.map((refund) =>
      mapRefundListItem(refund, order.orderNumber),
    ),
    paymentMethod: null,
    transactionId: null,
  };
}
