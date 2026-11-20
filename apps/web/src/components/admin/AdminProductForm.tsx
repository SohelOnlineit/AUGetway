"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import type {
  AdminBrand,
  AdminCategory,
  AdminProductDetail,
  AdminProductSeo,
  AdminProductStatus,
  AdminProductType,
  AdminProductVariationMeta,
} from "@amarpin/types";
import { CustomerInputBoxes } from "@/components/admin/CustomerInputBoxes";
import { ProductVariations, type PackageRow, type VariationState } from "@/components/admin/ProductVariations";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { SeoFields } from "@/components/admin/SeoFields";
import { adminFetch } from "@/lib/admin/api";
import { productPublicPath } from "@/lib/catalog/paths";

const TYPES: Array<{ value: AdminProductType; label: string }> = [
  { value: "LICENSE", label: "License" },
  { value: "ACCOUNT", label: "Account" },
  { value: "GIFTCARD", label: "Gift card" },
  { value: "TOPUP", label: "Top-up" },
  { value: "SUBSCRIPTION", label: "Subscription" },
];

const STATUSES: Array<{ value: AdminProductStatus; label: string }> = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
];

type ShopId = "amarpin" | "uniqbd";
type CopyDraft = { shortDescription: string; description: string };
type ImageDraft = { url: string; alt: string; storefront: ShopId };
type SeoDraft = {
  seoTitle: string;
  seoDescription: string;
  seoImageUrl: string;
  keywords: string;
  canonicalPath: string;
  noindex: boolean;
  nofollow: boolean;
};

const EMPTY_SEO: SeoDraft = {
  seoTitle: "",
  seoDescription: "",
  seoImageUrl: "",
  keywords: "",
  canonicalPath: "",
  noindex: false,
  nofollow: false,
};

function seoDrafts(initial?: AdminProductDetail): Record<ShopId, SeoDraft> {
  const drafts: Record<ShopId, SeoDraft> = {
    amarpin: { ...EMPTY_SEO },
    uniqbd: { ...EMPTY_SEO },
  };
  const rows = initial?.seoProfiles?.length
    ? initial.seoProfiles
    : initial
      ? [
          {
            storefront: "amarpin" as const,
            seoTitle: initial.seoTitle,
            seoDescription: initial.seoDescription,
            seoImageUrl: initial.seoImageUrl,
            keywords: null,
            canonicalPath: null,
            noindex: initial.noindex,
            nofollow: false,
            shortDescription: initial.shortDescription,
            description: initial.description,
          } satisfies AdminProductSeo,
        ]
      : [];
  for (const row of rows) {
    const shop: ShopId = row.storefront === "uniqbd" ? "uniqbd" : "amarpin";
    drafts[shop] = {
      seoTitle: row.seoTitle ?? "",
      seoDescription: row.seoDescription ?? "",
      seoImageUrl: row.seoImageUrl ?? "",
      keywords: row.keywords ?? "",
      canonicalPath: row.canonicalPath ?? "",
      noindex: row.noindex,
      nofollow: row.nofollow,
    };
  }
  return drafts;
}

function copyDrafts(initial?: AdminProductDetail): Record<ShopId, CopyDraft> {
  const drafts: Record<ShopId, CopyDraft> = {
    amarpin: {
      shortDescription: initial?.shortDescription ?? "",
      description: initial?.description ?? "",
    },
    uniqbd: { shortDescription: "", description: "" },
  };
  for (const row of initial?.seoProfiles ?? []) {
    const shop: ShopId = row.storefront === "uniqbd" ? "uniqbd" : "amarpin";
    drafts[shop] = {
      shortDescription: row.shortDescription ?? (shop === "amarpin" ? drafts.amarpin.shortDescription : ""),
      description: row.description ?? (shop === "amarpin" ? drafts.amarpin.description : ""),
    };
  }
  return drafts;
}

export function AdminProductForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: AdminProductDetail;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [brands, setBrands] = useState<AdminBrand[]>([]);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [sku, setSku] = useState(initial?.sku ?? "");
  const slugTouched = useRef(mode === "edit");
  const skuTouched = useRef(mode === "edit");
  const [status, setStatus] = useState<AdminProductStatus>(initial?.status ?? "DRAFT");
  const [type, setType] = useState<AdminProductType>(initial?.type ?? "LICENSE");
  const [categoryId, setCategoryId] = useState(initial?.category.id ?? "");
  const [brandId, setBrandId] = useState(initial?.brand?.id ?? "");
  const [price, setPrice] = useState(minorToInput(initial?.priceMinor ?? 10000));
  const [featured, setFeatured] = useState(initial?.featured ?? false);
  const [copyShop, setCopyShop] = useState<ShopId>("amarpin");
  const [copyByShop, setCopyByShop] = useState(() => copyDrafts(initial));
  const [seoShop, setSeoShop] = useState<ShopId>("amarpin");
  const [seoByShop, setSeoByShop] = useState(() => seoDrafts(initial));
  const [images, setImages] = useState<ImageDraft[]>(
    initial?.images.map((image) => ({
      url: image.url,
      alt: image.alt ?? "",
      storefront: image.storefront === "uniqbd" ? "uniqbd" : "amarpin",
    })) ?? [],
  );
  const [variations, setVariations] = useState<VariationState>(() => variationStateFrom(initial));
  const variationsRef = useRef(variations);
  const pendingPackageRef = useRef<PackageRow | null>(null);
  const [variationSaving, setVariationSaving] = useState(false);
  const [shortOpen, setShortOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [imagesOpen, setImagesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const saveQueue = useRef(Promise.resolve());
  const fieldsRef = useRef({
    title,
    slug,
    sku,
    status,
    type,
    categoryId,
    brandId,
    price,
    featured,
    copyByShop,
    images,
    seoByShop,
  });
  fieldsRef.current = {
    title,
    slug,
    sku,
    status,
    type,
    categoryId,
    brandId,
    price,
    featured,
    copyByShop,
    images,
    seoByShop,
  };

  function productBody(state: VariationState) {
    const fields = fieldsRef.current;
    const withTitleNames = state.packages.map((row) => ({
      ...row,
      name: row.name.trim() || fields.title.trim(),
    }));
    const meta = toVariationMeta({ ...state, packages: withTitleNames });
    if (!meta && withTitleNames.length > 0) {
      return { error: "Check each package name, value ID, and price." };
    }
    const listPriceMinor = Math.round(Number(fields.price) * 100);
    if (!Number.isFinite(listPriceMinor) || listPriceMinor < 0) return { error: "Enter a valid price." };
    if (!fields.categoryId) return { error: "Select a category for this product." };
    const priceMinor = meta ? meta.packages[0]!.priceMinor : listPriceMinor;
    return {
      body: {
        title: fields.title,
        slug: fields.slug || undefined,
        sku: fields.sku || undefined,
        status: fields.status,
        type: fields.type,
        categoryId: fields.categoryId,
        brandId: fields.brandId || null,
        priceMinor,
        compareAtMinor: initial?.compareAtMinor ?? null,
        currency: initial?.currency ?? "BDT",
        featured: fields.featured,
        sortOrder: initial?.sortOrder ?? 0,
        shortDescription: fields.copyByShop.amarpin.shortDescription || undefined,
        description: fields.copyByShop.amarpin.description || undefined,
        seoTitle: fields.seoByShop.amarpin.seoTitle || null,
        seoDescription: fields.seoByShop.amarpin.seoDescription || null,
        seoImageUrl: fields.seoByShop.amarpin.seoImageUrl || null,
        noindex: fields.seoByShop.amarpin.noindex,
        seoProfiles: (["amarpin", "uniqbd"] as const).map((storefront) => ({
          storefront,
          seoTitle: fields.seoByShop[storefront].seoTitle || null,
          seoDescription: fields.seoByShop[storefront].seoDescription || null,
          seoImageUrl: fields.seoByShop[storefront].seoImageUrl || null,
          keywords: fields.seoByShop[storefront].keywords || null,
          canonicalPath: fields.seoByShop[storefront].canonicalPath || null,
          noindex: fields.seoByShop[storefront].noindex,
          nofollow: fields.seoByShop[storefront].nofollow,
          shortDescription: fields.copyByShop[storefront].shortDescription || null,
          description: fields.copyByShop[storefront].description || null,
        })),
        variationMeta: meta,
        images: (() => {
          const nextSort = { amarpin: 0, uniqbd: 0 };
          return fields.images
            .filter((image) => image.url.trim())
            .map((image) => ({
              url: image.url.trim(),
              alt: image.alt.trim() || undefined,
              sortOrder: nextSort[image.storefront]++,
              storefront: image.storefront,
            }));
        })(),
      },
    };
  }

  function queueVariationSave(next: VariationState) {
    if (mode !== "edit" || !initial) return;
    saveQueue.current = saveQueue.current.then(async () => {
      const built = productBody(next);
      if ("error" in built && built.error) {
        setError(built.error);
        return;
      }
      if (!("body" in built)) return;
      setVariationSaving(true);
      setError(null);
      const result = await adminFetch<AdminProductDetail>(`/products/${initial.id}`, {
        method: "PUT",
        body: JSON.stringify(built.body),
      });
      setVariationSaving(false);
      if (!result.ok) setError(result.message);
    });
  }

  function updateVariations(updater: (current: VariationState) => VariationState) {
    const next = updater(variationsRef.current);
    variationsRef.current = next;
    setVariations(next);
    if (next.packages[0]) setPrice(next.packages[0].price);
    queueVariationSave(next);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cats, brandRows] = await Promise.all([
        adminFetch<AdminCategory[]>("/categories"),
        adminFetch<AdminBrand[]>("/brands"),
      ]);
      if (cancelled) return;
      if (cats.ok) {
        setCategories(cats.data);
        setCategoryId((current) => current || cats.data[0]?.id || "");
      } else {
        setCategoriesError(cats.message);
      }
      if (brandRows.ok) setBrands(brandRows.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function uploadEditorImage(file: File) {
    const url = await sendImage(file);
    if (!url) return null;
    return url;
  }

  function setSeoImage(storefront: ShopId, url: string) {
    setSeoByShop((current) => ({
      ...current,
      [storefront]: { ...current[storefront], seoImageUrl: url },
    }));
  }

  async function uploadImage(file: File, storefront: ShopId, useForSeo: boolean) {
    const url = await sendImage(file);
    if (!url) return;
    setImages((current) => [...current, { url, alt: title.trim().slice(0, 200), storefront }]);
    if (useForSeo) setSeoImage(storefront, url);
    setImagesOpen(true);
  }

  async function sendImage(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setError("Image exceeds the 10 MB limit.");
      return null;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parts: string[] = [];
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      parts.push(String.fromCharCode(...bytes.subarray(index, index + chunk)));
    }
    const result = await adminFetch<{ path: string }>("/uploads/images", {
      method: "POST",
      body: JSON.stringify({
      dataBase64: btoa(parts.join("")),
      contentType: file.name.toLowerCase().endsWith(".svg") ? "image/svg+xml" : file.type || "image/png",
    }),
    });
    if (!result.ok) {
      setError(result.message);
      return null;
    }
    setError(null);
    return result.data.path;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const pending = pendingPackageRef.current;
    const saved = variationsRef.current;
    const state = pending
      ? {
          ...saved,
          packages: saved.packages.some((row) => row.id === pending.id)
            ? saved.packages.map((row) => (row.id === pending.id ? pending : row))
            : [...saved.packages, pending],
        }
      : saved;
    const built = productBody(state);
    if (!("body" in built)) {
      setPending(false);
      setError(built.error);
      return;
    }
    const body = built.body;
    const result =
      mode === "create"
        ? await adminFetch<AdminProductDetail>("/products", {
            method: "POST",
            body: JSON.stringify(body),
          })
        : await adminFetch<AdminProductDetail>(`/products/${initial!.id}`, {
            method: "PUT",
            body: JSON.stringify(body),
          });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (mode === "create") {
      router.push(`/admin/products/${result.data.id}`);
      return;
    }
    setNotice("Product saved.");
    router.refresh();
  }

  function onTitleChange(value: string) {
    setTitle(value);
    if (mode !== "create") return;
    if (!slugTouched.current) setSlug(slugifyTitle(value));
    if (!skuTouched.current) setSku(skuFromTitle(value));
  }

  const viewSlug = slug.trim();
  const stock = initial?.stockAvailable ?? 0;
  const statusLabel = STATUSES.find((item) => item.value === status)?.label ?? status;
  const typeLabel = TYPES.find((item) => item.value === type)?.label ?? type;
  const heroImage =
    images.find((image) => image.url.trim())?.url ||
    Object.values(variations.regionImages).find((url) => url.trim()) ||
    "";

  return (
    <form className="product-editor" onSubmit={(event) => void onSubmit(event)}>
      <header className="product-editor-hero">
        <div className="product-editor-crumb-row">
          <nav className="product-editor-crumb" aria-label="Breadcrumb">
            <Link href="/admin/products">Products</Link>
            <span aria-hidden="true">/</span>
            <Link href="/admin/inventory">Stock</Link>
            <span aria-hidden="true">/</span>
            <span>{mode === "create" ? "New" : "Edit"}</span>
          </nav>
          <Link href="/admin/products" className="catalog-ghost product-editor-back">
            Back
          </Link>
        </div>
        <div className="product-editor-hero-copy">
          <div className="product-editor-hero-title">
            {heroImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="product-editor-hero-thumb" src={heroImage} alt="" />
            ) : null}
            <div>
              <h1>{title.trim() || (mode === "create" ? "New product" : "Untitled product")}</h1>
              <p className="product-editor-meta">
                <span className={`product-editor-status is-${status.toLowerCase()}`}>{statusLabel}</span>
                <span>{typeLabel}</span>
                {viewSlug ? <span>/{viewSlug}</span> : null}
              </p>
            </div>
          </div>
        </div>
        <div className="product-editor-hero-actions">
          {error ? <p className="form-error">{error}</p> : null}
          {notice && !error ? <p className="product-editor-saved">{notice}</p> : null}
          <div className="product-editor-actions">
            {mode === "edit" && viewSlug ? (
              <Link
                href={productPublicPath(viewSlug)}
                className="catalog-ghost"
                target="_blank"
                rel="noopener noreferrer"
              >
                View product
              </Link>
            ) : (
              <span className="catalog-ghost is-disabled" aria-disabled="true">
                View product
              </span>
            )}
            <button className="primary-btn" type="submit" disabled={pending}>
              {pending ? "Saving…" : mode === "create" ? "Create product" : "Save product"}
            </button>
          </div>
        </div>
      </header>
      <div className="product-editor-main">
        <EditorCard
          icon={<LinesIcon />}
          title="Basic info"
          subtitle="Product name, URL slug, and internal SKU."
        >
          <p className="product-editor-kicker">Product identity</p>
          <label>
            Title *
            <input value={title} onChange={(event) => onTitleChange(event.target.value)} required />
          </label>
          <div className="product-editor-split">
            <label>
              Slug
              <input
                value={slug}
                placeholder="auto from title"
                onChange={(event) => {
                  slugTouched.current = true;
                  setSlug(event.target.value);
                }}
              />
            </label>
            <label>
              SKU
              <input
                value={sku}
                placeholder="auto from title"
                onChange={(event) => {
                  skuTouched.current = true;
                  setSku(event.target.value);
                }}
              />
            </label>
          </div>
        </EditorCard>

        <EditorCard
          icon={<LinesIcon />}
          title="Short description"
          subtitle=""
          extra={<ShopTabs shop={copyShop} label="Short description site" onChange={setCopyShop} />}
          open={shortOpen}
          onToggle={() => setShortOpen((open) => !open)}
        >
          <p className="product-editor-kicker">Summary text</p>
          <RichTextEditor
            key={`${copyShop}-short`}
            className="write-box-summary"
            value={copyByShop[copyShop].shortDescription}
            maxLength={4000}
            minHeight="8rem"
            onChange={(shortDescription) =>
              setCopyByShop((current) => ({
                ...current,
                [copyShop]: { ...current[copyShop], shortDescription },
              }))
            }
            onImageUpload={uploadEditorImage}
          />
          {copyShop === "uniqbd" ? (
            <p className="product-editor-note">Leave blank to use the amarpin.com summary.</p>
          ) : null}
        </EditorCard>

        <EditorCard
          icon={<FileIcon />}
          title="Product Description"
          subtitle=""
          extra={<ShopTabs shop={copyShop} label="Product description site" onChange={setCopyShop} />}
          open={descriptionOpen}
          onToggle={() => setDescriptionOpen((open) => !open)}
        >
          <p className="product-editor-kicker">Full description</p>
          <RichTextEditor
            key={`${copyShop}-full`}
            className="write-box-summary"
            value={copyByShop[copyShop].description}
            minHeight="8rem"
            unlimited
            onChange={(description) =>
              setCopyByShop((current) => ({
                ...current,
                [copyShop]: { ...current[copyShop], description },
              }))
            }
            onImageUpload={uploadEditorImage}
          />
          {copyShop === "uniqbd" ? (
            <p className="product-editor-note">Leave blank to use the amarpin.com description.</p>
          ) : null}
        </EditorCard>

        <EditorCard
          icon={<ImageIcon />}
          title="Product images"
          subtitle="Same product name. AuGetway and UniQbd can use different photos."
          open={imagesOpen}
          onToggle={() => setImagesOpen((open) => !open)}
        >
          <ShopImages
            shop="amarpin"
            label="AuGetway.com"
            images={images}
            title={title}
            seoImageUrl={seoByShop.amarpin.seoImageUrl}
            setImages={setImages}
            onUpload={(file, useForSeo) => void uploadImage(file, "amarpin", useForSeo)}
            onSeoImage={(url) => setSeoImage("amarpin", url)}
          />
          <ShopImages
            shop="uniqbd"
            label="Uniqbd.com"
            images={images}
            title={title}
            seoImageUrl={seoByShop.uniqbd.seoImageUrl}
            setImages={setImages}
            onUpload={(file, useForSeo) => void uploadImage(file, "uniqbd", useForSeo)}
            onSeoImage={(url) => setSeoImage("uniqbd", url)}
          />
        </EditorCard>

        <EditorCard
          icon={<ListIcon />}
          title="Variations"
          subtitle={
            mode === "edit"
              ? ""
              : "Set regions and add packages — saved when you create the product."
          }
        >
          <ProductVariations
            pendingPackageRef={pendingPackageRef}
            value={variations}
            onChange={updateVariations}
            saving={variationSaving || pending}
            inventoryCount={stock}
            inventoryHref="/admin/inventory"
            defaultImageUrl={images[0]?.url ?? ""}
            onUploadImage={sendImage}
          />
        </EditorCard>

        <EditorCard
          icon={<FormIcon />}
          title="Customer input boxes"
          subtitle="Add boxes the customer fills while ordering this product (e.g. game email, password). The answers appear on the product page."
        >
          <CustomerInputBoxes
            boxes={variations.customerInputs}
            onChange={(customerInputs) => updateVariations((current) => ({ ...current, customerInputs }))}
          />
        </EditorCard>
      </div>

      <aside className="product-editor-side">
        <EditorCard
          icon={<PublishIcon />}
          title="Publish"
          subtitle="Control storefront visibility and stock state."
        >
          <p className="product-editor-kicker">Visibility</p>
          <label>
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as AdminProductStatus)}
            >
              {STATUSES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="product-editor-feature">
            <input
              type="checkbox"
              checked={featured}
              onChange={(event) => setFeatured(event.target.checked)}
            />
            <span>
              <strong>Featured product</strong>
              <small>Show on the homepage when this product is featured.</small>
            </span>
          </label>
        </EditorCard>

        <EditorCard
          icon={<TagIcon />}
          title="Catalog"
          subtitle="Product type, category, and brand."
        >
          <p className="product-editor-kicker">Classification</p>
          <label>
            Type
            <select
              value={type}
              onChange={(event) => setType(event.target.value as AdminProductType)}
            >
              {TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category *
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              required
            >
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          {categoriesError ? <p className="form-error">{categoriesError}</p> : null}
          {!categoriesError && categories.length === 0 ? (
            <p className="product-editor-note">
              No categories yet.{" "}
              <Link href="/admin/categories">Create a category first</Link>.
            </p>
          ) : null}
          <p className="product-editor-note">
            The product appears on the selected category page and in Shop.
          </p>
          <label>
            Brand
            <select value={brandId} onChange={(event) => setBrandId(event.target.value)}>
              <option value="">None</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
        </EditorCard>

        <EditorCard
          icon={<FileIcon />}
          title="SEO"
          subtitle=""
          extra={<ShopTabs shop={seoShop} label="SEO site" onChange={setSeoShop} />}
        >
          <SeoFields
            key={seoShop}
            compact
            title={seoByShop[seoShop].seoTitle}
            description={seoByShop[seoShop].seoDescription}
            keywords={seoByShop[seoShop].keywords}
            imageUrl={seoByShop[seoShop].seoImageUrl}
            canonicalPath={seoByShop[seoShop].canonicalPath}
            noindex={seoByShop[seoShop].noindex}
            nofollow={seoByShop[seoShop].nofollow}
            onChange={(next) => {
              setSeoByShop((current) => ({
                ...current,
                [seoShop]: {
                  seoTitle: next.title,
                  seoDescription: next.description,
                  keywords: next.keywords ?? "",
                  seoImageUrl: next.imageUrl,
                  canonicalPath: next.canonicalPath ?? "",
                  noindex: next.noindex,
                  nofollow: next.nofollow ?? false,
                },
              }));
            }}
          />
          <p className="product-editor-note">
            Leave a field blank to use the product title, summary, and photo.
            {seoShop === "uniqbd" ? " A blank uniqbd.com listing falls back to amarpin.com." : ""}
          </p>
        </EditorCard>
      </aside>
    </form>
  );
}

function slugifyTitle(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function skuFromTitle(input: string) {
  return slugifyTitle(input).toUpperCase().slice(0, 64);
}

function ShopTabs({
  shop,
  label,
  onChange,
}: {
  shop: ShopId;
  label: string;
  onChange: (shop: ShopId) => void;
}) {
  return (
    <div className="product-seo-shops" role="tablist" aria-label={label}>
      {([
        ["amarpin", "amarpin.com"],
        ["uniqbd", "uniqbd.com"],
      ] as const).map(([id, name]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={shop === id}
          className={shop === id ? "is-on" : undefined}
          onClick={() => onChange(id)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

function EditorCard({
  icon,
  title,
  subtitle,
  extra,
  open = true,
  onToggle,
  children,
}: {
  icon?: ReactNode;
  title: string;
  subtitle: string;
  extra?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="product-editor-card">
      <header>
        {icon ? <span className="product-editor-icon">{icon}</span> : null}
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {extra}
        {onToggle ? (
          <button
            type="button"
            className="product-editor-collapse"
            aria-expanded={open}
            onClick={onToggle}
          >
            <Chevron open={open} />
          </button>
        ) : null}
      </header>
      {open ? <div className="product-editor-body">{children}</div> : null}
    </section>
  );
}

function minorToInput(minor: number) {
  const amount = minor / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function customerInputDrafts(initial?: AdminProductDetail) {
  return (initial?.variationMeta?.customerInputs ?? []).map((item, index) => ({
    id: `input-${index}`,
    label: item.label,
    placeholder: item.placeholder,
    required: item.required,
  }));
}

function variationStateFrom(initial?: AdminProductDetail): VariationState {
  const meta = initial?.variationMeta;
  const customerInputs = customerInputDrafts(initial);
  if (meta?.packages.length) {
    return {
      regions: [...(meta.regions ?? [])],
      defaultRegion: meta.defaultRegion,
      showPackageImages: meta.showPackageImages,
      regionImages: Object.fromEntries((meta.regionImages ?? []).map((image) => [image.region, image.imageUrl])),
      packages: meta.packages.map((pkg, index) => ({
        id: `pkg-${index}-${pkg.valueId}`,
        name: pkg.name,
        valueId: pkg.valueId,
        price: minorToInput(pkg.priceMinor),
        stockType: pkg.stockType,
        imageUrl: pkg.imageUrl ?? "",
        manualStock: String(pkg.manualStock ?? 0),
        regions: pkg.regions?.length
          ? pkg.regions
          : meta.defaultRegion
            ? [meta.defaultRegion]
            : meta.regions?.[0]
              ? [meta.regions[0]]
              : [],
      })),
      customerInputs,
    };
  }
  return {
    regions: [],
    defaultRegion: "",
    showPackageImages: false,
    regionImages: {},
    customerInputs,
    packages: [],
  };
}

function toVariationMeta(state: VariationState): AdminProductVariationMeta | null {
  if (!state.packages.length) return null;
  const packages = [];
  for (const row of state.packages) {
    const name = row.name.trim();
    const valueId = row.valueId.trim();
    const priceMinor = Math.round(Number(row.price) * 100);
    if (!name || !valueId || !Number.isInteger(priceMinor) || priceMinor < 0) return null;
    packages.push({
      name,
      valueId,
      priceMinor,
      stockType: row.stockType,
      imageUrl: row.imageUrl.trim() || null,
      manualStock: Math.min(1_000_000_000_000, Math.max(0, Math.round(Number(row.manualStock) || 0))),
      regions: row.regions,
    });
  }
  return {
    regions: state.regions,
    defaultRegion: state.defaultRegion,
    showPackageImages: state.showPackageImages,
    regionImages: state.regions.flatMap((region) => {
      const imageUrl = (state.regionImages[region] ?? "").trim();
      return imageUrl ? [{ region, imageUrl }] : [];
    }),
    packages,
    customerInputs: state.customerInputs
      .map((box) => ({
        label: box.label.trim(),
        placeholder: box.placeholder.trim(),
        required: box.required,
      }))
      .filter((box) => box.label)
      .slice(0, 12),
  };
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={open ? "is-open" : undefined}>
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function FormIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="3.5" width="16" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 8.5h8M8 12h8M8 15.5h5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function LinesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M14 3.8V9h5.2M8 13h8M8 17h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ShopImages({
  shop,
  label,
  images,
  title,
  seoImageUrl,
  setImages,
  onUpload,
  onSeoImage,
}: {
  shop: ShopId;
  label: string;
  images: ImageDraft[];
  title: string;
  seoImageUrl: string;
  setImages: Dispatch<SetStateAction<ImageDraft[]>>;
  onUpload: (file: File, useForSeo: boolean) => void;
  onSeoImage: (url: string) => void;
}) {
  const [useForSeo, setUseForSeo] = useState(false);
  const rows = images
    .map((image, index) => ({ image, index }))
    .filter((row) => row.image.storefront === shop);
  return (
    <div className="product-editor-images">
      <p className="product-editor-kicker">{label}</p>
      {rows.length === 0 ? (
        <p className="product-editor-images-empty">
          No {label} photos yet. If UniQbd has none, the AuGetway photo is shown there.
        </p>
      ) : null}
      {rows.map(({ image, index }, position) => {
        const isSeo = seoImageUrl.trim() !== "" && seoImageUrl.trim() === image.url.trim();
        const altLength = image.alt.trim().length;
        return (
          <article key={`${shop}-${image.url}-${index}`} className="product-editor-image">
            <div className="product-editor-image-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" />
              {position === 0 ? <span className="product-editor-image-main">Main</span> : null}
            </div>
            <div className="product-editor-image-seo">
              <div className="product-editor-image-seo-head">
                <span>SEO</span>
                <span
                  className={
                    "product-editor-image-count" +
                    (altLength === 0 ? " is-empty" : altLength > 125 ? " is-long" : "")
                  }
                >
                  {altLength} characters
                </span>
              </div>
              <label>
                Alt text
                <input
                  maxLength={200}
                  value={image.alt}
                  placeholder="Describe this photo"
                  onChange={(event) =>
                    setImages((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, alt: event.target.value.slice(0, 200) } : item,
                      ),
                    )
                  }
                />
              </label>
              <p className="product-editor-image-hint">
                Describe this photo for search. About 80–120 characters is comfortable.
              </p>
              <div className="product-editor-image-actions">
                <button
                  type="button"
                  className={isSeo ? "catalog-ghost is-on" : "catalog-ghost"}
                  onClick={() => onSeoImage(isSeo ? "" : image.url)}
                >
                  {isSeo ? "Using for SEO" : "Use for SEO"}
                </button>
                <button
                  type="button"
                  className="catalog-ghost"
                  onClick={() =>
                    setImages((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, alt: title.trim().slice(0, 200) } : item,
                      ),
                    )
                  }
                >
                  Use product name
                </button>
                <button
                  type="button"
                  className="catalog-action catalog-action--delete"
                  onClick={() => {
                    if (isSeo) onSeoImage("");
                    setImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </article>
        );
      })}
      <div className="product-editor-image-add">
        <label className="product-editor-feature">
          <input
            type="checkbox"
            checked={useForSeo}
            onChange={(event) => setUseForSeo(event.target.checked)}
          />
          <span>
            <strong>Use for SEO</strong>
            <small>The next photo becomes the social image for {label}.</small>
          </span>
        </label>
        <label>
          Image URL
          <input
            placeholder="/images/product.png"
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              const input = event.currentTarget;
              const url = input.value.trim();
              if (!url) return;
              setImages((current) => [...current, { url, alt: title.trim().slice(0, 200), storefront: shop }]);
              if (useForSeo) onSeoImage(url);
              input.value = "";
            }}
          />
        </label>
        <label className="product-editor-upload">
          Upload image
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/tiff,image/svg+xml"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUpload(file, useForSeo);
            }}
          />
        </label>
      </div>
    </div>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m7 15 3.2-3.2 2.2 2.2L16 10l3 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M8 7h12M8 12h12M8 17h12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function PublishIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 16V4M8 8l4-4 4 4M5 20h14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 12.5V5.8A1.8 1.8 0 0 1 5.8 4h6.7L20 11.5 12.5 19 4 12.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="8.2" cy="8.2" r="1" fill="currentColor" />
    </svg>
  );
}
