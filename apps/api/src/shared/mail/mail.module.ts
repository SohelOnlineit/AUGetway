import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DevMailAdapter } from "./dev-mail.adapter";
import { EmailSettingsService } from "./email-settings.service";
import { EmailTemplatesService } from "./email-templates.service";
import { MAIL_PORT } from "./mail.port";
import { NoopMailAdapter } from "./noop-mail.adapter";
import { MailService } from "./mail.service";

@Global()
@Module({
  providers: [
    DevMailAdapter,
    NoopMailAdapter,
    EmailSettingsService,
    EmailTemplatesService,
    {
      provide: MAIL_PORT,
      inject: [ConfigService, DevMailAdapter, NoopMailAdapter],
      useFactory: (
        config: ConfigService,
        dev: DevMailAdapter,
        noop: NoopMailAdapter,
      ) => {
        const provider = (config.get<string>("mail.provider") ?? "noop").toLowerCase();
        const nodeEnv = config.get<string>("app.nodeEnv") ?? "development";
        if (provider === "dev") {
          if (nodeEnv === "production") {
            return noop;
          }
          return dev;
        }
        return noop;
      },
    },
    MailService,
  ],
  exports: [MAIL_PORT, MailService, EmailSettingsService, EmailTemplatesService],
})
export class MailModule {}
