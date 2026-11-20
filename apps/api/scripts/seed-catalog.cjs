#!/usr/bin/env node
/**
 * Development-only fake catalog seed.
 * Refuses to run when NODE_ENV=production.
 */
const { resolve } = require("node:path");
require("dotenv").config({ path: resolve(process.cwd(), "../../.env") });
require("dotenv").config({ path: resolve(process.cwd(), ".env") });
const { PrismaPg } = require("@prisma/adapter-pg");
let PrismaClient;
let ProductStatus;
let ProductType;
let HomepageSectionType;
try {
  ({
    PrismaClient,
    ProductStatus,
    ProductType,
    HomepageSectionType,
  } = require("../dist/generated/prisma/client"));
} catch {
  ({
    PrismaClient,
    ProductStatus,
    ProductType,
    HomepageSectionType,
  } = require("../src/generated/prisma/client"));
}

const nodeEnv = process.env.NODE_ENV ?? "development";

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  if (nodeEnv === "production") {
    throw new Error("Refusing to run catalog fake seed in production");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.productImage.deleteMany();
    await prisma.product.deleteMany();
    await prisma.homepageSection.deleteMany();
    await prisma.homepageSlide.deleteMany();
    await prisma.navigationItem.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.category.deleteMany();
    await prisma.siteContentSettings.deleteMany({ where: { key: "default" } });

    const games = await prisma.category.create({
      data: {
        name: "Games",
        slug: "games",
        description: "Game top-ups and digital items",
        sortOrder: 1,
        isActive: true,
        seoTitle: "Games — AuGetway",
        seoDescription: "Browse game top-ups and digital goods.",
      },
    });
    const giftCards = await prisma.category.create({
      data: {
        name: "Gift Cards",
        slug: "gift-cards",
        description: "Popular gift cards",
        sortOrder: 2,
        isActive: true,
        seoTitle: "Gift Cards — AuGetway",
        seoDescription: "Published gift card catalog.",
      },
    });
    const draftOnly = await prisma.category.create({
      data: {
        name: "Hidden Draft Category",
        slug: "hidden-draft-category",
        isActive: false,
        sortOrder: 99,
      },
    });

    const uniqBrand = await prisma.brand.create({
      data: {
        name: "UniQ Digital",
        slug: "uniq-digital",
        description: "House brand for demo products",
        isActive: true,
        sortOrder: 1,
        logoUrl: "/placeholders/brand.svg",
      },
    });
    await prisma.brand.create({
      data: {
        name: "Inactive Brand",
        slug: "inactive-brand",
        isActive: false,
        sortOrder: 99,
      },
    });

    const products = [
      {
        title: "Mobile Legends 86 Diamonds",
        type: ProductType.TOPUP,
        categoryId: games.id,
        brandId: uniqBrand.id,
        priceMinor: 9900,
        compareAtMinor: 12000,
        featured: true,
        status: ProductStatus.ACTIVE,
        shortDescription: "Instant diamond top-up demo product.",
      },
      {
        title: "Free Fire 100 Diamonds",
        type: ProductType.TOPUP,
        categoryId: games.id,
        brandId: uniqBrand.id,
        priceMinor: 8500,
        featured: true,
        status: ProductStatus.ACTIVE,
        shortDescription: "Popular Free Fire pack.",
      },
      {
        title: "Steam Wallet 10 USD",
        type: ProductType.GIFTCARD,
        categoryId: giftCards.id,
        brandId: uniqBrand.id,
        priceMinor: 125000,
        featured: false,
        status: ProductStatus.ACTIVE,
        shortDescription: "Steam wallet code (demo).",
      },
      {
        title: "Google Play 500 BDT",
        type: ProductType.GIFTCARD,
        categoryId: giftCards.id,
        brandId: uniqBrand.id,
        priceMinor: 52000,
        featured: true,
        status: ProductStatus.ACTIVE,
        shortDescription: "Google Play redeem code demo.",
      },
      {
        title: "Draft Product (must stay private)",
        type: ProductType.LICENSE,
        categoryId: draftOnly.id,
        brandId: uniqBrand.id,
        priceMinor: 1000,
        featured: true,
        status: ProductStatus.DRAFT,
        shortDescription: "Should never appear on public APIs.",
      },
    ];

    for (const [index, item] of products.entries()) {
      const slug = slugify(item.title);
      const product = await prisma.product.create({
        data: {
          title: item.title,
          slug,
          titleNormalized: item.title.toLowerCase(),
          shortDescription: item.shortDescription,
          description: `${item.shortDescription}\n\nThis is development-only demo catalog content.`,
          type: item.type,
          status: item.status,
          categoryId: item.categoryId,
          brandId: item.brandId,
          priceMinor: item.priceMinor,
          compareAtMinor: item.compareAtMinor ?? null,
          currency: "BDT",
          featured: item.featured,
          sortOrder: index + 1,
          seoTitle: `${item.title} | AuGetway`,
          seoDescription: item.shortDescription,
          publishedAt:
            item.status === ProductStatus.ACTIVE ? new Date() : null,
          sku: `DEMO-${index + 1}`,
        },
      });
      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: "/placeholders/product.svg",
          alt: item.title,
          sortOrder: 0,
        },
      });
    }

    await prisma.homepageSlide.createMany({
      data: [
        {
          title: "Top up your favorite games",
          subtitle: "Development demo homepage slide",
          imageUrl: "/placeholders/hero.svg",
          linkUrl: "/category/games",
          sortOrder: 1,
          isActive: true,
        },
        {
          title: "Gift cards delivered instantly",
          subtitle: "Browse published gift cards",
          imageUrl: "/placeholders/hero-alt.svg",
          linkUrl: "/category/gift-cards",
          sortOrder: 2,
          isActive: true,
        },
      ],
    });

    await prisma.homepageSection.createMany({
      data: [
        {
          title: "Featured picks",
          type: HomepageSectionType.FEATURED_PRODUCTS,
          productLimit: 8,
          sortOrder: 1,
          isActive: true,
        },
        {
          title: "Games",
          type: HomepageSectionType.CATEGORY_PRODUCTS,
          categoryId: games.id,
          productLimit: 8,
          sortOrder: 2,
          isActive: true,
        },
        {
          title: "Latest",
          type: HomepageSectionType.LATEST_PRODUCTS,
          productLimit: 8,
          sortOrder: 3,
          isActive: true,
        },
      ],
    });

    await prisma.navigationItem.createMany({
      data: [
        { label: "Home", href: "/", sortOrder: 1, isActive: true },
        { label: "Products", href: "/products", sortOrder: 2, isActive: true },
        { label: "Games", href: "/category/games", sortOrder: 3, isActive: true },
        {
          label: "Gift Cards",
          href: "/category/gift-cards",
          sortOrder: 4,
          isActive: true,
        },
        { label: "Search", href: "/search", sortOrder: 5, isActive: true },
      ],
    });

    await prisma.siteContentSettings.create({
      data: {
        key: "default",
        siteName: "AuGetway",
        tagline: "Digital goods marketplace (rebuild demo)",
        defaultSeoTitle: "AuGetway — Digital goods",
        defaultSeoDescription:
          "Browse published game top-ups, gift cards, and more.",
        canonicalBaseUrl: process.env.APP_PUBLIC_URL || "http://localhost:3000",
      },
    });

    console.log("Catalog fake seed completed (development only).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
