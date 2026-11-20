import { Injectable, Logger } from "@nestjs/common";
import type { MailMessage, MailPort, MailSendResult } from "./mail.port";

/**
 * Development-only mail adapter.
 * Does not send network email. Exposes preview payload to the auth service
 * so local flows can complete without a real provider.
 * Never logs recipient address, codes, or tokens.
 */
@Injectable()
export class DevMailAdapter implements MailPort {
  private readonly logger = new Logger(DevMailAdapter.name);

  async isReady() {
    return {
      ready: true,
      provider: "dev",
      message: "Development mail adapter active (no external delivery).",
    };
  }

  async send(message: MailMessage): Promise<MailSendResult> {
    this.logger.log(
      `Queued ${message.kind} mail for userId=${message.userId} (dev adapter)`,
    );
    return {
      delivered: true,
      provider: "dev",
      devPreview: {
        actionUrl: message.actionUrl,
        code: message.code,
      },
    };
  }
}
