import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

type SiteverifyResponse = { success?: boolean };

type TurnstileKeys = { siteKey: string; secret: string; enabled: boolean; active: boolean };

export type TurnstileView = { siteKey: string; secretSet: boolean; enabled: boolean };

const SETTINGS_ID = "default";
const CACHE_MS = 15_000;
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,200}$/;
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Cloudflare Turnstile for the desk login and the public payment pages.
 * The check runs only when both keys are saved AND the admin turned it on.
 * Turning it on needs a live test first, so wrong keys can never lock the admin out.
 * Emergency switch: set TURNSTILE_OFF=1 in the server .env and restart the API.
 */
@Injectable()
export class TurnstileService {
  private cache: (TurnstileKeys & { expires: number }) | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** The public site key, or "" when the check is off. */
  async siteKey(): Promise<string> {
    const keys = await this.keys();
    return keys.active ? keys.siteKey : "";
  }

  async adminView(): Promise<TurnstileView> {
    const row = await this.prisma.securitySettings.findUnique({ where: { id: SETTINGS_ID } });
    return {
      siteKey: row?.turnstileSiteKey?.trim() ?? "",
      secretSet: Boolean(row?.turnstileSecretKey?.trim()),
      enabled: row?.turnstileEnabled === true,
    };
  }

  async update(input: { siteKey?: string; secretKey?: string; enabled?: boolean; token?: string }): Promise<TurnstileView> {
    if (input.siteKey === undefined && input.secretKey === undefined && input.enabled === undefined) {
      throw new BadRequestException("Nothing to save.");
    }
    const existing = await this.prisma.securitySettings.findUnique({ where: { id: SETTINGS_ID } });
    const oldSite = existing?.turnstileSiteKey?.trim() ?? "";
    const oldSecret = existing?.turnstileSecretKey?.trim() ?? "";
    const siteKey = input.siteKey !== undefined ? input.siteKey.trim() : oldSite;
    const typedSecret = input.secretKey?.trim() ?? "";
    if (input.siteKey !== undefined && siteKey && !KEY_PATTERN.test(siteKey)) {
      throw new BadRequestException("Enter the Turnstile site key from Cloudflare.");
    }
    if (typedSecret && !KEY_PATTERN.test(typedSecret)) {
      throw new BadRequestException("Enter the Turnstile secret key from Cloudflare.");
    }
    const secret = typedSecret || oldSecret;
    const keysChanged = siteKey !== oldSite || secret !== oldSecret;
    let enabled = existing?.turnstileEnabled === true;

    if (input.enabled === true) {
      if (!siteKey || !secret) throw new BadRequestException("Save both Cloudflare keys first.");
      if (keysChanged) throw new BadRequestException("Save the keys first, then run the test and turn it on.");
      // A live test with the saved secret. If it fails, turning the check on would block every sign-in.
      if (!input.token?.trim() || !(await this.verify(secret, input.token.trim()))) {
        throw new BadRequestException("The test did not pass. Check both keys and the allowed domain in Cloudflare.");
      }
      enabled = true;
    } else if (input.enabled === false) {
      enabled = false;
    } else if (keysChanged) {
      // Different keys are untested, so the check goes off until the test passes again.
      enabled = false;
    }

    await this.prisma.securitySettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, turnstileSiteKey: siteKey, turnstileSecretKey: secret, turnstileEnabled: enabled },
      update: { turnstileSiteKey: siteKey, turnstileSecretKey: secret, turnstileEnabled: enabled },
    });
    this.cache = null;
    return this.adminView();
  }

  /** Throws unless the check is off or the visitor passed it. */
  async assert(token: string | undefined): Promise<void> {
    const keys = await this.keys();
    if (!keys.active) return;
    const response = token?.trim() ?? "";
    if (!response) throw new BadRequestException("Please complete the security check.");
    let ok: boolean;
    try {
      ok = await this.verify(keys.secret, response);
    } catch {
      throw new BadRequestException("Security check could not be verified. Try again.");
    }
    if (!ok) throw new BadRequestException("Please complete the security check.");
  }

  private async verify(secret: string, response: string): Promise<boolean> {
    const result = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response }),
      signal: AbortSignal.timeout(8_000),
    });
    const payload = (await result.json()) as SiteverifyResponse;
    return payload?.success === true;
  }

  private async keys(): Promise<TurnstileKeys> {
    if (this.cache && Date.now() < this.cache.expires) return this.cache;
    const row = await this.prisma.securitySettings.findUnique({ where: { id: SETTINGS_ID } });
    const siteKey = row?.turnstileSiteKey?.trim() ?? "";
    const secret = row?.turnstileSecretKey?.trim() ?? "";
    const enabled = row?.turnstileEnabled === true && process.env.TURNSTILE_OFF !== "1";
    this.cache = { siteKey, secret, enabled, active: enabled && Boolean(siteKey && secret), expires: Date.now() + CACHE_MS };
    return this.cache;
  }
}
