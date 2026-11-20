import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { FulfillmentService } from "../modules/orders/fulfillment.service";
import { OrdersService } from "../modules/orders/orders.service";
import {
  ORDERS_QUEUE,
  OrderJob,
  type ExpireReservationJobData,
  type FulfillOrderJobData,
} from "./queue.constants";

@Processor(ORDERS_QUEUE)
export class OrdersProcessor extends WorkerHost {
  private readonly logger = new Logger(OrdersProcessor.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly fulfillment: FulfillmentService,
  ) {
    super();
  }

  async process(
    job: Job<ExpireReservationJobData | FulfillOrderJobData>,
  ): Promise<{ ok: true }> {
    if (job.name === OrderJob.ExpireReservation) {
      const data = job.data as ExpireReservationJobData;
      await this.orders.expireReservation(data.orderId);
      return { ok: true };
    }

    if (job.name === OrderJob.FulfillOrder) {
      const data = job.data as FulfillOrderJobData;
      await this.fulfillment.deliverApiStock(data.orderId);
      return { ok: true };
    }

    this.logger.warn(`Ignoring unknown orders job: ${job.name}`);
    return { ok: true };
  }
}
