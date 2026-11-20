import { Global, Module } from "@nestjs/common";
import { RegistrationEmailDomainsService } from "./registration-email-domains.service";

/** Global so AuthService and AdminController can inject without circular imports. */
@Global()
@Module({
  providers: [RegistrationEmailDomainsService],
  exports: [RegistrationEmailDomainsService],
})
export class RegistrationEmailDomainsModule {}
