import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PublicCart, PublicCartItem } from "@amarpin/types";
import {
  InventoryStatus,
  Prisma,
  ProductStatus,
} from "../../generated/prisma/client";
import {
  collectCustomerAnswers,
  pickPrimaryImageUrl,
  readCustomerInputs,
  readPublicPackages,
  readStoredCustomerAnswers,
  shopCopy,
} from "../catalog/catalog.mapper";
import { resolveStorefrontId } from "../catalog/storefronts";
import { PrismaService } from "../../prisma/prisma.service";
import type { UpsertCartItemDto } from "./dto/upsert-cart-item.dto";

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateCart(userId: string) {
    return this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async getCart(userId: string, storefront?: string): Promise<PublicCart> {
    const cart = await this.getOrCreateCart(userId);
    return this.toPublicCart(cart.id, storefront);
  }

  async upsertItem(userId: string, dto: UpsertCartItemDto, storefront?: string): Promise<PublicCart> {
    const cart = await this.getOrCreateCart(userId);
    const product = await this.requireSellableProduct(dto.productId);
    const selected = this.resolvePackage(product.variationMeta, dto.packageValueId);
    const available = await this.availableFor(product.id, selected);
    if (dto.quantity > available) {
      throw new BadRequestException(
        `Only ${available} unit(s) available for this product`,
      );
    }
    // Snapshot the buyer's customer-input answers onto this cart line.
    const collected = collectCustomerAnswers(product.variationMeta, dto.customerInputs);
    if (collected.missingLabel) {
      throw new BadRequestException(
        `Fill in “${collected.missingLabel}” before continuing.`,
      );
    }
    const customerInputs: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined =
      collected.keepExisting
        ? undefined
        : collected.answers.length
          ? (collected.answers as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull;

    await this.prisma.cartItem.upsert({
      where: {
        cartId_productId: { cartId: cart.id, productId: product.id },
      },
      create: {
        cartId: cart.id,
        productId: product.id,
        packageValueId: selected?.valueId ?? null,
        quantity: dto.quantity,
        customerInputs: customerInputs ?? Prisma.DbNull,
      },
      update: {
        quantity: dto.quantity,
        packageValueId: selected?.valueId ?? null,
        ...(customerInputs === undefined ? {} : { customerInputs }),
      },
    });

    return this.toPublicCart(cart.id, storefront);
  }

  async updateItem(
    userId: string,
    itemId: string,
    quantity: number,
    storefront?: string,
  ): Promise<PublicCart> {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
    });
    if (!item) throw new NotFoundException("Cart item not found");

    const product = await this.requireSellableProduct(item.productId);
    const selected = this.resolvePackage(product.variationMeta, item.packageValueId);
    const available = await this.availableFor(product.id, selected);
    if (quantity > available) {
      throw new BadRequestException(
        `Only ${available} unit(s) available for this product`,
      );
    }

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity },
    });
    return this.toPublicCart(cart.id, storefront);
  }

  async removeItem(userId: string, itemId: string, storefront?: string): Promise<PublicCart> {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
    });
    if (!item) throw new NotFoundException("Cart item not found");
    await this.prisma.cartItem.delete({ where: { id: item.id } });
    return this.toPublicCart(cart.id, storefront);
  }

  async clearCart(userId: string): Promise<void> {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) return;
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }

  async requireSellableProduct(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        status: ProductStatus.ACTIVE,
        category: { isActive: true },
      },
      include: {
        images: { orderBy: [{ storefront: "asc" }, { sortOrder: "asc" }], take: 1 },
      },
    });
    if (!product) {
      throw new BadRequestException("Product is not available for purchase");
    }
    return product;
  }

  countAvailable(productId: string, packageValueId?: string | null): Promise<number> {
    return this.prisma.inventoryItem.count({
      where: {
        productId,
        status: InventoryStatus.AVAILABLE,
        ...(packageValueId ? { packageValueId } : {}),
      },
    });
  }

  resolvePackage(variationMeta: unknown, packageValueId?: string | null) {
    const packages = readPublicPackages(variationMeta);
    const requested = packageValueId?.trim() || "";
    if (requested) {
      const match = packages.find((pkg) => pkg.valueId === requested);
      if (!match) throw new BadRequestException("That package is not on this product");
      return match;
    }
    return packages[0] ?? null;
  }

  availableFor(
    productId: string,
    selected: ReturnType<CartService["resolvePackage"]>,
  ) {
    if (selected?.stockType === "manual") return Promise.resolve(selected.manualStock);
    return this.countAvailable(productId, selected?.valueId ?? null);
  }

  assertCustomerAnswers(
    variationMeta: unknown,
    answers: Array<{ label: string; value: string }>,
    title: string,
  ) {
    for (const field of readCustomerInputs(variationMeta)) {
      if (!field.required) continue;
      const found = answers.some(
        (answer) => answer.label === field.label && answer.value.trim().length > 0,
      );
      if (!found) {
        throw new BadRequestException(
          `Fill in “${field.label}” on “${title}” before checkout.`,
        );
      }
    }
  }

  unitPriceFor(product: { priceMinor: number; variationMeta: unknown }, packageValueId?: string | null) {
    if (!packageValueId) return product.priceMinor;
    const selected = this.resolvePackage(product.variationMeta, packageValueId);
    return selected?.priceMinor ?? product.priceMinor;
  }

  private async toPublicCart(cartId: string, storefront?: string): Promise<PublicCart> {
    const cart = await this.prisma.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: { orderBy: { sortOrder: "asc" } },
                seoProfiles: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const items: PublicCartItem[] = [];
    let subtotalMinor = 0;
    let currency = "BDT";

    for (const item of cart.items) {
      const selected = item.packageValueId
        ? this.resolvePackage(item.product.variationMeta, item.packageValueId)
        : null;
      const available = await this.availableFor(item.productId, selected);
      const unitPriceMinor = selected?.priceMinor ?? item.product.priceMinor;
      const lineTotalMinor = unitPriceMinor * item.quantity;
      subtotalMinor += lineTotalMinor;
      currency = item.product.currency;
      const details = cartLineDetails(item.product, selected, storefront);
      items.push({
        id: item.id,
        productId: item.productId,
        title: item.product.title,
        slug: item.product.slug,
        quantity: item.quantity,
        unitPriceMinor,
        lineTotalMinor,
        currency: item.product.currency,
        availableQuantity: available,
        primaryImageUrl: pickPrimaryImageUrl(item.product.images, resolveStorefrontId(storefront)),
        shortDescription: details.shortDescription,
        packageValueId: selected?.valueId ?? null,
        packageName: details.packageName,
        region: details.region,
        customerInputs: readStoredCustomerAnswers(item.customerInputs),
      });
    }

    return {
      id: cart.id,
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotalMinor,
      currency,
    };
  }
}

function cartLineDetails(
  product: {
    priceMinor: number;
    shortDescription: string | null;
    description: string | null;
    variationMeta: unknown;
    seoProfiles: Array<{
      storefront: string;
      shortDescription: string | null;
      description: string | null;
    }>;
  },
  selected: ReturnType<CartService["resolvePackage"]>,
  storefront?: string,
): { shortDescription: string | null; packageName: string | null; region: string | null } {
  const meta =
    product.variationMeta && typeof product.variationMeta === "object" && !Array.isArray(product.variationMeta)
      ? (product.variationMeta as Record<string, unknown>)
      : null;
  const packages = readPublicPackages(product.variationMeta);
  const matched =
    selected ??
    packages.find((row) => row.priceMinor === product.priceMinor) ??
    (packages.length === 1 ? packages[0] : null);
  const defaultRegion = typeof meta?.defaultRegion === "string" ? meta.defaultRegion.trim() : "";
  const productRegions = Array.isArray(meta?.regions)
    ? meta.regions.filter((region): region is string => typeof region === "string" && region.trim().length > 0)
    : [];
  const text = shopCopy(product, resolveStorefrontId(storefront)).shortDescription
    ?.replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    shortDescription: text || null,
    packageName: matched?.name ?? null,
    region: matched?.region || defaultRegion || productRegions[0]?.trim() || null,
  };
}
