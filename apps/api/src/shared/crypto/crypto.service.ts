import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import * as bcrypt from "bcryptjs";

const scrypt = promisify(scryptCallback) as unknown as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/** UniQbd stored `saltHex:derivedHex` from Node scrypt (64-byte key). */
const LEGACY_SCRYPT_HASH = /^[0-9a-f]{32}:[0-9a-f]{128}$/i;

@Injectable()
export class CryptoService {
  private readonly bcryptRounds = 12;

  constructor(private readonly config: ConfigService) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.bcryptRounds);
  }

  /** Old UniQbd accounts keep scrypt hashes until the next successful sign-in. */
  isLegacyPasswordHash(passwordHash: string): boolean {
    return LEGACY_SCRYPT_HASH.test(passwordHash);
  }

  async verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    if (passwordHash.startsWith("$2")) {
      return bcrypt.compare(password, passwordHash);
    }
    if (!this.isLegacyPasswordHash(passwordHash)) return false;
    const [salt, key] = passwordHash.split(":");
    if (!salt || !key) return false;
    const derived = await scrypt(password, salt, 64);
    const keyBuffer = Buffer.from(key, "hex");
    if (keyBuffer.length !== derived.length) return false;
    return timingSafeEqual(keyBuffer, derived);
  }

  hashToken(rawToken: string): string {
    return createHash("sha256").update(rawToken, "utf8").digest("hex");
  }

  /** One-time opaque token (URL-safe). */
  generateOpaqueToken(bytes = 32): string {
    return randomBytes(bytes).toString("base64url");
  }

  /** Short numeric code for email verification / reset UX. */
  generateNumericCode(digits = 6): string {
    const max = 10 ** digits;
    const value = randomBytes(4).readUInt32BE(0) % max;
    return value.toString().padStart(digits, "0");
  }

  hashIp(ip: string | undefined): string | null {
    if (!ip) return null;
    return createHash("sha256").update(ip.trim().toLowerCase(), "utf8").digest("hex");
  }

  safeEqualHex(a: string, b: string): boolean {
    const left = Buffer.from(a, "utf8");
    const right = Buffer.from(b, "utf8");
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }

  /**
   * Encrypt inventory codes at rest (AES-256-GCM).
   * Stored format: base64(iv):base64(ciphertext):base64(tag)
   */
  encryptSecret(plaintext: string): string {
    const key = this.encryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64url")}:${encrypted.toString("base64url")}:${tag.toString("base64url")}`;
  }

  /** Decrypt only for owner delivery reveal — never write plaintext to logs. */
  decryptSecret(payload: string): string {
    const [ivPart, dataPart, tagPart] = payload.split(":");
    if (!ivPart || !dataPart || !tagPart) {
      throw new Error("Invalid ciphertext payload");
    }
    const key = this.encryptionKey();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  }

  private encryptionKey(): Buffer {
    const raw = this.config.getOrThrow<string>("security.dataEncryptionKey");
    // Accept base64 or utf8 secrets; always derive a 32-byte key.
    const asBase64 = Buffer.from(raw, "base64");
    if (asBase64.length === 32) return asBase64;
    return createHash("sha256").update(raw, "utf8").digest();
  }
}
