import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { PaymentsService } from "../modules/payments/payments.service";
import {
  PAYMENTS_QUEUE,
  PaymentJob,
  type ReconcileFulfillmentJobData,
  type VerifyIntentJobData,
} from "./queue.constants";

@Processor(PAYMENTS_QUEUE)
export class PaymentsProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentsProcessor.name);

  constructor(private readonly payments: PaymentsService) {
    super();
  }

  async process(
    job: Job<VerifyIntentJobData | ReconcileFulfillmentJobData>,
  ): Promise<{ ok: true }> {
    if (job.name === PaymentJob.VerifyIntent) {
      const data = job.data as VerifyIntentJobData;
      await this.payments.verifyIntentJob(data.paymentIntentId);
      return { ok: true };
    }

    if (job.name === PaymentJob.ReconcileFulfillment) {
      const data = job.data as ReconcileFulfillmentJobData;
      await this.payments.reconcileFulfillmentJob(data.orderId);
      return { ok: true };
    }

    this.logger.warn(`Ignoring unknown payments job: ${job.name}`);
    return { ok: true };
  }
}
