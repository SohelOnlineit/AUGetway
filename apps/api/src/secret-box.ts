import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const DEV_SECRET = "dev-only-secret-change-me-32-characters";

/**
 * Encrypts small secrets (mail password, bot tokens, gateway keys) before they go into the database,
 * so a copied database or backup file does not hand them over. AES-256-GCM, a fresh random IV every time,
 * and a "context" string that is checked on opening, so a sealed value cannot be moved to another field.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = Buffer.from(hkdfSync("sha256", secret, "augetway-secret-box", "augetway at-rest secrets v1", 32));
  }

  static isSealed(value: string): boolean {
    return value.startsWith(PREFIX);
  }

  /** An empty value stays empty. */
  seal(plain: string, context: string): string {
    if (!plain) return "";
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
  }

  /**
   * Plain text saved before encryption existed is returned as it is.
   * A sealed value that cannot be opened (wrong key, wrong field, damaged) gives an empty string.
   */
  open(value: string, context: string): string {
    if (!value.startsWith(PREFIX)) return value;
    try {
      const raw = Buffer.from(value.slice(PREFIX.length), "base64url");
      if (raw.length < 29) return "";
      const decipher = createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, 12));
      decipher.setAAD(Buffer.from(context, "utf8"));
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    } catch {
      return "";
    }
  }
}

let shared: SecretBox | null = null;
let sharedFrom = "";

/**
 * The key comes from DATA_KEY when set, otherwise from JWT_SECRET (already required in production).
 * Changing that value makes sealed secrets unreadable, so they would have to be typed in again.
 */
export function secretBox(): SecretBox {
  const material = process.env.DATA_KEY?.trim() || process.env.JWT_SECRET || DEV_SECRET;
  if (!shared || sharedFrom !== material) {
    shared = new SecretBox(material);
    sharedFrom = material;
  }
  return shared;
}
