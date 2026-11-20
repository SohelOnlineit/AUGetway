import { Injectable } from "@nestjs/common";
import type { MailMessage, MailPort, MailSendResult } from "./mail.port";

/**
 * Production-safe placeholder when no SMTP/provider is configured.
 * Auth flows that require email will surface a clear unavailable error.
 */
@Injectable()
export class NoopMailAdapter implements MailPort {
  async isReady() {
    return {
      ready: false,
      provider: "noop",
      message:
        "Email provider is not configured. Set MAIL_PROVIDER=dev for local use or configure a real provider later.",
    };
  }

  async send(_message: MailMessage): Promise<MailSendResult> {
    return { delivered: false, provider: "noop" };
  }
}
