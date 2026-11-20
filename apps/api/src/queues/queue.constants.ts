/** Background queues. */
export const SYSTEM_QUEUE = "system";

export enum SystemJob {
  Ping = "ping",
}

export interface SystemPingJobData {
  requestedAt: string;
}

export const ORDERS_QUEUE = "orders";

export enum OrderJob {
  ExpireReservation = "expire-reservation",
  FulfillOrder = "fulfill-order",
}

export interface ExpireReservationJobData {
  orderId: string;
}

export interface FulfillOrderJobData {
  orderId: string;
}

export const PAYMENTS_QUEUE = "payments";

export enum PaymentJob {
  VerifyIntent = "verify-intent",
  ReconcileFulfillment = "reconcile-fulfillment",
}

export interface VerifyIntentJobData {
  paymentIntentId: string;
}

export interface ReconcileFulfillmentJobData {
  orderId: string;
}
