import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import {
  SYSTEM_QUEUE,
  SystemJob,
  SystemPingJobData,
} from "./queue.constants";

@Processor(SYSTEM_QUEUE)
export class SystemProcessor extends WorkerHost {
  private readonly logger = new Logger(SystemProcessor.name);

  async process(job: Job<SystemPingJobData>): Promise<{ ok: true }> {
    if (job.name !== SystemJob.Ping) {
      this.logger.warn(`Ignoring unknown system job: ${job.name}`);
      return { ok: true };
    }

    this.logger.debug(`System ping job ${job.id} at ${job.data.requestedAt}`);
    return { ok: true };
  }
}
