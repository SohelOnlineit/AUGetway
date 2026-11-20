import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import sharp from "sharp";
import type { AdminUploadResult } from "@amarpin/types";
import { PrismaService } from "../../prisma/prisma.service";
import { resolveStorefrontId, STOREFRONTS } from "../catalog/storefronts";

const MAX_BYTES = 10 * 1024 * 1024;
const RASTER_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp",
  "image/tiff",
  "image/tif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);
const SVG_MIME = new Set(["image/svg+xml", "image/svg"]);

type ImageKind = "jpeg" | "png" | "webp" | "svg";

@Injectable()
export class UploadsService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private rootDir() {
    const configured =
      this.config.get<string>("app.uploadsDir") ?? "../../uploads";
    return resolve(process.cwd(), configured);
  }

  private publicCmsDir() {
    return join(this.rootDir(), "public", "cms");
  }

  private chatImageDir() {
    return join(this.rootDir(), "sms", "image");
  }

  private privateDir() {
    return join(this.rootDir(), "private");
  }

  async ensureDirs() {
    await mkdir(this.publicCmsDir(), { recursive: true });
    await mkdir(this.chatImageDir(), { recursive: true });
    await mkdir(this.privateDir(), { recursive: true });
  }

  /**
   * Image-only upload: magic-byte allowlist, size limit, sanitize rewrite,
   * random filename. Never copies legacy chat/KYC paths.
   */
  async savePublicCmsImage(
    buffer: Buffer,
    declaredMime?: string,
  ): Promise<AdminUploadResult> {
    if (!buffer?.length) {
      throw new BadRequestException("Empty upload");
    }
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException("Image exceeds 10MB limit");
    }

    if (this.isSvg(buffer)) {
      this.assertDeclaredMime(declaredMime, SVG_MIME, "SVG");
      return this.writePublic(this.sanitizeSvg(buffer), "svg");
    }

    this.assertDeclaredMime(declaredMime, RASTER_MIME, "image");
    const webp = await this.toWebp(buffer);
    return this.writePublic(webp, "webp");
  }

  /**
   * Chat photos are stored as a medium WebP: longest edge 1280px, no upscale.
   */
  async saveChatPhoto(buffer: Buffer, declaredMime?: string): Promise<AdminUploadResult> {
    if (!buffer?.length) {
      throw new BadRequestException("Empty upload");
    }
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException("Image exceeds 10MB limit");
    }
    if (this.isSvg(buffer)) {
      throw new BadRequestException("Photo must be a JPEG, PNG, WebP, or GIF");
    }
    this.assertDeclaredMime(declaredMime, RASTER_MIME, "image");
    const webp = await this.toWebp(buffer, 1280);
    return this.writeChatPhoto(webp);
  }

  /** Profile photos are a 100×100 WebP, cropped to fill the square. */
  async saveAvatar(buffer: Buffer, declaredMime?: string): Promise<AdminUploadResult> {
    if (!buffer?.length) {
      throw new BadRequestException("Empty upload");
    }
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException("Image exceeds 10MB limit");
    }
    if (this.isSvg(buffer)) {
      throw new BadRequestException("Photo must be a JPEG, PNG, WebP, or GIF");
    }
    this.assertDeclaredMime(declaredMime, RASTER_MIME, "image");
    const webp = await this.toSquareWebp(buffer, 100);
    return this.writePublic(webp, "webp");
  }

  private async writeChatPhoto(bytes: Buffer): Promise<AdminUploadResult> {
    const filename = `${randomBytes(16).toString("hex")}.webp`;
    await this.ensureDirs();
    await writeFile(join(this.chatImageDir(), filename), bytes);
    return {
      path: `/api/content/media/${filename}`,
      contentType: "image/webp",
      bytes: bytes.length,
    };
  }

  private async writePublic(bytes: Buffer, ext: "webp" | "svg"): Promise<AdminUploadResult> {
    const filename = `${randomBytes(16).toString("hex")}.${ext}`;
    await this.ensureDirs();
    await writeFile(join(this.publicCmsDir(), filename), bytes);
    return {
      path: `/api/content/media/${filename}`,
      contentType: ext === "svg" ? "image/svg+xml" : "image/webp",
      bytes: bytes.length,
    };
  }

  /** Delete one chat photo from uploads/sms/image, or a legacy copy in public CMS. */
  async deleteChatPhoto(publicPath: string): Promise<boolean> {
    const filename = publicPath.replace(/\\/g, "/").split("/").pop() ?? "";
    let safe: string;
    try {
      safe = this.assertPublicFilename(filename);
    } catch {
      return false;
    }
    for (const dir of [this.chatImageDir(), this.publicCmsDir()]) {
      const absolute = join(dir, safe);
      if (!existsSync(absolute)) continue;
      await unlink(absolute);
      return true;
    }
    return false;
  }
  async deletePublicMedia(publicPath: string): Promise<boolean> {
    const filename = publicPath.replace(/\\/g, "/").split("/").pop() ?? "";
    let safe: string;
    try {
      safe = this.assertPublicFilename(filename);
    } catch {
      return false;
    }
    const absolute = join(this.publicCmsDir(), safe);
    if (!existsSync(absolute)) return false;
    await unlink(absolute);
    return true;
  }

  /** Square PNG for browsers and Google. The uploaded file can be a large WebP. */
  async faviconPng(storefront: string | undefined, px: number): Promise<Buffer | null> {
    const size = px === 180 ? 180 : 48;
    const id = resolveStorefrontId(storefront);
    const row = await this.prisma.siteContentSettings.findUnique({
      where: { key: STOREFRONTS[id].key },
      select: { adminFaviconPath: true },
    });
    const name = row?.adminFaviconPath?.replace(/\\/g, "/").split("/").pop() ?? "";
    if (!/^[a-f0-9]{32}\.(jpg|jpeg|png|webp)$/i.test(name)) return null;
    const absolute = [this.publicCmsDir(), this.chatImageDir()]
      .map((dir) => join(dir, name))
      .find((file) => existsSync(file));
    if (!absolute) return null;
    return sharp(absolute).resize(size, size, { fit: "cover" }).png({ compressionLevel: 9 }).toBuffer();
  }

  async openPublicCmsFile(filename: string): Promise<{
    stream: ReturnType<typeof createReadStream>;
    contentType: string;
  }> {
    const safe = this.assertPublicFilename(filename);
    const absolute =
      [this.chatImageDir(), this.publicCmsDir()]
        .map((dir) => join(dir, safe))
        .find((file) => existsSync(file)) ?? join(this.publicCmsDir(), safe);
    if (!existsSync(absolute)) {
      throw new NotFoundException("Media not found");
    }
    const kind = this.kindFromExt(extname(safe));
    return {
      stream: createReadStream(absolute),
      contentType: this.contentType(kind),
    };
  }

  /** Reject path traversal and private-dir access. */
  assertPublicFilename(filename: string): string {
    const base = filename.replace(/\\/g, "/").split("/").pop() ?? "";
    if (!/^[a-f0-9]{32}\.(jpg|jpeg|png|webp|svg)$/i.test(base)) {
      throw new BadRequestException("Invalid media filename");
    }
    const root = resolve(this.publicCmsDir());
    const resolved = resolve(root, base);
    if (resolved !== join(root, base) && !resolved.startsWith(root + sep)) {
      throw new BadRequestException("Invalid media path");
    }
    if (!resolved.startsWith(root)) {
      throw new BadRequestException("Invalid media path");
    }
    return base;
  }

  fingerprint(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  }

  private detectKind(buffer: Buffer): ImageKind | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "jpeg";
    }
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return "png";
    }
    if (
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
      return "webp";
    }
    return null;
  }

  private assertDeclaredMime(mime: string | undefined, allowed: Set<string>, label: string) {
    if (!mime) return;
    const normalized = mime.toLowerCase().split(";")[0]?.trim() ?? "";
    if (!allowed.has(normalized)) {
      throw new BadRequestException(`MIME type does not match ${label} contents`);
    }
  }

  private isSvg(buffer: Buffer): boolean {
    if (this.detectKind(buffer)) return false;
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "").trimStart();
    return /^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text);
  }

  private sanitizeSvg(buffer: Buffer): Buffer {
    const text = buffer.toString("utf8");
    if (text.includes("\0") || /<!DOCTYPE|<!ENTITY/i.test(text)) {
      throw new BadRequestException("Invalid SVG");
    }
    const cleaned = text
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
      .replace(/<(?:iframe|embed|object|link|meta|handler|set|animate)\b[^>]*\/>/gi, "")
      .replace(/<(?:iframe|embed|object|link|meta|handler|set|animate)\b[\s\S]*?<\/(?:iframe|embed|object|link|meta|handler|set|animate)>/gi, "")
      // "/" and quotes also separate attributes in HTML parsing (<svg/onload=...>).
      .replace(/[\s/"']on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, " ")      .replace(/\s(?:href|xlink:href)\s*=\s*("(?!\s*#)[^"]*"|'(?!\s*#)[^']*')/gi, "")
      .replace(/javascript\s*:/gi, "");
    if (!/<svg[\s>]/i.test(cleaned)) {
      throw new BadRequestException("Invalid SVG");
    }
    const out = Buffer.from(cleaned, "utf8");
    if (out.length > MAX_BYTES) {
      throw new BadRequestException("Image exceeds 10MB limit");
    }
    return out;
  }

  private async toSquareWebp(buffer: Buffer, size: number): Promise<Buffer> {
    try {
      const webp = await sharp(buffer, {
        failOn: "error",
        animated: false,
        limitInputPixels: 80_000_000,
        pages: 1,
      })
        .rotate()
        .resize(size, size, { fit: "cover", position: "centre" })
        .webp({ quality: 82, effort: 4 })
        .toBuffer();
      if (
        webp.length < 12 ||
        webp.toString("ascii", 0, 4) !== "RIFF" ||
        webp.toString("ascii", 8, 12) !== "WEBP"
      ) {
        throw new Error("not webp");
      }
      return webp;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("Only JPEG, PNG, WebP, GIF, AVIF, BMP, or TIFF photos are allowed");
    }
  }

  private async toWebp(buffer: Buffer, maxEdge?: number): Promise<Buffer> {
    try {
      let pipeline = sharp(buffer, {
        failOn: "error",
        animated: false,
        limitInputPixels: 80_000_000,
        pages: 1,
      }).rotate();
      if (maxEdge) {
        pipeline = pipeline.resize({
          width: maxEdge,
          height: maxEdge,
          fit: "inside",
          withoutEnlargement: true,
        });
      }
      const webp = await pipeline.webp({ quality: maxEdge ? 80 : 82, effort: 4 }).toBuffer();
      if (
        webp.length < 12 ||
        webp.toString("ascii", 0, 4) !== "RIFF" ||
        webp.toString("ascii", 8, 12) !== "WEBP"
      ) {
        throw new Error("not webp");
      }
      if (webp.length > MAX_BYTES) {
        throw new BadRequestException("Image exceeds 10MB limit");
      }
      return webp;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        "Only JPEG, PNG, WebP, GIF, AVIF, BMP, TIFF, or SVG images are allowed",
      );
    }
  }

  private contentType(kind: ImageKind): string {
    if (kind === "jpeg") return "image/jpeg";
    if (kind === "png") return "image/png";
    if (kind === "svg") return "image/svg+xml";
    return "image/webp";
  }

  private kindFromExt(ext: string): ImageKind {
    const e = ext.toLowerCase();
    if (e === ".png") return "png";
    if (e === ".webp") return "webp";
    if (e === ".svg") return "svg";
    return "jpeg";
  }
}
