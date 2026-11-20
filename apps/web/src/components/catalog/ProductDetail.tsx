"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PublicProductDetail, PublicProductPackage, PublicProductReview } from "@amarpin/types";
import { ProductReviews } from "@/components/catalog/ProductReviews";
import { RichHtml } from "@/components/content/RichHtml";
import { trackStorefrontEvent } from "@/lib/analytics/client";
import { productPublicPath } from "@/lib/catalog/paths";
import { sameRegion } from "@/lib/catalog/regions";
import { publishCartCount } from "@/lib/cart-count";

function amount(minor: number) {
  const major = minor / 100;
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}

function Price({ minor, currency }: { minor: number; currency: string }) {
  if (currency !== "BDT") return <>{`${amount(minor)} ${currency}`}</>;
  return (
    <>
      {amount(minor)}
      <span className="home-card-taka">৳</span>
    </>
  );
}

export function ProductDetail({
  product,
  reviews,
  preferredRegion,
  keepEmptyPackages = false,
  cartError = null,
}: {
  product: PublicProductDetail;
  reviews: PublicProductReview[];
  preferredRegion?: string;
  keepEmptyPackages?: boolean;
  cartError?: string | null;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState<"description" | "reviews" | "shipping">("description");
  const [pending, setPending] = useState<"cart" | "buy" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tip, setTip] = useState<"wish" | "facebook" | "link" | null>(null);
  const tipTimer = useRef<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const choices = packageChoices(product, keepEmptyPackages);
  const regions = choices.length === 0 && keepEmptyPackages ? [] : regionChoices(product, choices);
  const [region, setRegion] = useState(() => initialRegion(product, regions, preferredRegion));
  const visible = choices.filter((item) => packageInRegion(item, region));
  const [packageId, setPackageId] = useState(visible[0]?.valueId ?? choices[0]?.valueId ?? "");
  const selected = visible.find((item) => item.valueId === packageId) ?? visible[0] ?? null;
  const total = (selected?.priceMinor ?? product.priceMinor) * quantity;

  useEffect(() => {
    return () => {
      if (tipTimer.current) window.clearTimeout(tipTimer.current);
    };
  }, []);

  function showTip(id: "wish" | "facebook" | "link") {
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    setTip(id);
    if (tipTimer.current) window.clearTimeout(tipTimer.current);
    tipTimer.current = window.setTimeout(() => setTip(null), 1800);
  }

  useEffect(() => {
    setPackageId((current) => {
      const next = choices.filter((item) => packageInRegion(item, region));
      return next.some((item) => item.valueId === current) ? current : (next[0]?.valueId ?? "");
    });
  }, [region, choices]);

  async function add(next: "cart" | "buy") {
    const missing = (product.customerInputs ?? []).find(
      (field) => field.required && !(answers[field.id] ?? "").trim(),
    );
    if (missing) {
      setError(`Fill in “${missing.label}” before continuing.`);
      return;
    }
    setPending(next);
    setError(null);
    try {
      const response = await fetch("/api/cart", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          quantity,
          ...(selected?.valueId ? { packageValueId: selected.valueId } : {}),
          ...((product.customerInputs ?? []).length
            ? {
                customerInputs: (product.customerInputs ?? []).map((field) => ({
                  id: field.id,
                  value: answers[field.id] ?? "",
                })),
              }
            : {}),
        }),
      });
      if (response.status === 401 || response.status === 403) {
        router.push(`/login?next=${encodeURIComponent(productPublicPath(product.slug))}`);
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const message = Array.isArray(payload?.message)
          ? payload.message.join(", ")
          : payload?.message;
        throw new Error(message || "Could not add to cart");
      }
      const cart = (await response.json().catch(() => null)) as { itemCount?: number } | null;
      if (typeof cart?.itemCount === "number") publishCartCount(cart.itemCount);
      trackStorefrontEvent({
        name: "add_to_cart",
        entityType: "product",
        entityId: product.id,
      });
      router.push(next === "buy" ? "/checkout" : "/cart");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add to cart");
    } finally {
      setPending(null);
    }
  }

  async function saveWishlist() {
    const response = await fetch("/api/account/wishlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: product.id }),
    });
    if (response.status === 401) {
      router.push(`/login?next=${encodeURIComponent(productPublicPath(product.slug))}`);
      return;
    }
    if (response.ok) setSaved(true);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
  }

  function openLiveChat() {
    document.querySelector<HTMLButtonElement>(".live-chat-fab")?.click();
  }

  function shareFacebook() {
    const url = encodeURIComponent(window.location.href);
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      "_blank",
      "noopener,noreferrer,width=600,height=400",
    );
  }

  const imageUrl =
    product.regionImages?.find((image) => sameRegion(image.region, region))?.imageUrl ||
    product.primaryImage?.url ||
    "/placeholders/product.svg";
  const galleryAlt =
    product.images.find((image) => image.url === imageUrl)?.alt?.trim() ||
    (product.primaryImage?.url === imageUrl ? product.primaryImage.alt?.trim() : "") ||
    product.title;

  return (
    <>
      <article className="pdp">
        <div className="pdp-gallery">
          <section className="pdp-panel pdp-media-card">
            <div className="pdp-name">
              <span className="pdp-name-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" />
              </span>
              <h1>{product.title}</h1>
            </div>
            <div className="pdp-media-main">
            <div className="pdp-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={galleryAlt} />
            </div>
            <div className="pdp-icon-row">
              <button
                type="button"
                className={["pdp-icon-wish", saved ? "is-on" : "", tip === "wish" ? "is-tip" : ""].filter(Boolean).join(" ")}
                aria-label="Save to wishlist"
                onClick={() => {
                  showTip("wish");
                  void saveWishlist();
                }}
              >
                <HeartIcon filled={saved} />
                <span className="pdp-icon-tip" aria-hidden>
                  {saved ? "Saved" : "Wishlist"}
                </span>
              </button>
              <button
                type="button"
                className="pdp-icon-chat"
                aria-label="Chat"
                onClick={openLiveChat}
              >
                <ChatIcon />
                <span className="pdp-icon-tip" aria-hidden>
                  Chat
                </span>
              </button>
              <button
                type="button"
                className={tip === "facebook" ? "is-tip" : undefined}
                aria-label="Share on Facebook"
                onClick={() => {
                  showTip("facebook");
                  shareFacebook();
                }}
              >
                <FacebookIcon />
                <span className="pdp-icon-tip" aria-hidden>
                  Facebook
                </span>
              </button>
              <button
                type="button"
                className={[copied ? "is-on" : "", tip === "link" ? "is-tip" : ""].filter(Boolean).join(" ") || undefined}
                aria-label="Copy product link"
                onClick={() => {
                  showTip("link");
                  void copyLink();
                }}
              >
                <LinkIcon />
                <span className="pdp-icon-tip" aria-hidden>
                  {copied ? "Copied" : "Copy link"}
                </span>
              </button>
            </div>
            {copied ? <p className="pdp-copy-note">Link copied</p> : null}
            </div>
          </section>
          <section className="pdp-panel pdp-short">
            <div className="pdp-short-head">
              <span className="pdp-short-mark" aria-hidden>
                <LinesIcon />
              </span>
              <h2>
                <span className="pdp-short-label">Short description</span>
                <span className="pdp-short-title">{product.title}</span>
              </h2>
            </div>
            {product.shortDescription ? (
              <RichHtml className="pdp-short-body" html={product.shortDescription} />
            ) : (
              <p className="pdp-short-body">Digital product delivered after payment.</p>
            )}
          </section>
        </div>

        <form
          className="pdp-buy"
          method="post"
          action="/api/cart"
          onSubmit={(event) => {
            event.preventDefault();
            const submitter = (event.nativeEvent as SubmitEvent).submitter;
            const intent =
              submitter instanceof HTMLButtonElement && submitter.value === "buy" ? "buy" : "cart";
            void add(intent);
          }}
        >
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="quantity" value={quantity} />
          <input type="hidden" name="returnPath" value={productPublicPath(product.slug)} />
          <section className="pdp-panel">
            <div className="pdp-panel-head">
              <div className="pdp-region-title">
                <span className="pdp-region-mark" aria-hidden>
                  <BoxIcon />
                </span>
                <h2>
                  <span className="pdp-region-label">Select Package Region</span>
                  <span className="pdp-region-label-mobile">Select Your Package Region</span>
                </h2>
              </div>
              {regions.length > 0 ? (
                <RegionPicker regions={regions} value={region} onChange={setRegion} />
              ) : null}
            </div>
            {visible.length === 0 ? (
              <p className="pdp-package-empty">No packages available for {region}.</p>
            ) : (
              <div className="pdp-packages">
                {visible.map((item) => (
                  <label
                    key={item.valueId || "product"}
                    className={item.valueId === selected?.valueId ? "pdp-package is-selected" : "pdp-package"}
                  >
                    <span className="pdp-package-thumb">
                      {item.imageUrl ||
                      product.regionImages?.find((image) => sameRegion(image.region, region))?.imageUrl ||
                      product.primaryImage?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={
                            item.imageUrl ||
                            product.regionImages?.find((image) => sameRegion(image.region, region))?.imageUrl ||
                            product.primaryImage?.url ||
                            ""
                          }
                          alt=""
                        />
                      ) : null}
                    </span>
                    <span className="pdp-package-copy">
                      <strong>{item.name}</strong>
                      <small className={item.inStock ? undefined : "is-out"}>{stockLabel(item)}</small>
                    </span>
                    <span className="pdp-package-price">
                      <Price minor={item.priceMinor} currency={product.currency} />
                      <input
                        type="radio"
                        name="packageValueId"
                        value={item.valueId}
                        checked={item.valueId === selected?.valueId}
                        aria-label={item.name}
                        onChange={() => setPackageId(item.valueId)}
                      />
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="pdp-panel pdp-qty">
            <h2>Quantity</h2>
            <div>
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              >
                −
              </button>
              <span>{quantity}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => setQuantity((value) => Math.min(20, value + 1))}
              >
                +
              </button>
            </div>
          </section>

          {(product.customerInputs ?? []).length ? (
            <section className="pdp-panel pdp-customer-inputs">
              <h2>Your information</h2>
              {(product.customerInputs ?? []).map((field) => (
                <label key={field.id}>
                  <span>
                    {field.label}
                    {field.required ? <em>*</em> : null}
                  </span>
                  <input
                    name={`customerInput:${field.id}`}
                    value={answers[field.id] ?? ""}
                    placeholder={field.placeholder}
                    required={field.required}
                    onChange={(event) =>
                      setAnswers((current) => ({ ...current, [field.id]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </section>
          ) : null}

          <section className="pdp-panel">
            <h2>Order summary</h2>
            <dl className="pdp-summary">
              <div>
                <dt>Package</dt>
                <dd>{selected?.name ?? product.title}</dd>
              </div>
              <div>
                <dt>Region</dt>
                <dd>{region}</dd>
              </div>
              <div>
                <dt>Subtotal</dt>
                <dd>
                  <Price minor={total} currency={product.currency} />
                </dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>
                  <Price minor={total} currency={product.currency} />
                </dd>
              </div>
            </dl>
          </section>

          {error || cartError ? <p className="form-error">{error || cartError}</p> : null}
          <div className="pdp-cta">
            <button
              type="submit"
              name="intent"
              value="buy"
              className="pdp-buy-btn"
              disabled={pending !== null || !selected?.inStock}
            >
              <span className="pdp-cta-mark" aria-hidden>
                <BoltIcon />
              </span>
              <span className="pdp-cta-label">
                {pending === "buy" ? "Please wait…" : "Buy now"}
                {pending === "buy" ? null : <ArrowIcon />}
              </span>
            </button>
            <button
              type="submit"
              name="intent"
              value="cart"
              className="pdp-cart-btn"
              disabled={pending !== null || !selected?.inStock}
            >
              <span className="pdp-cta-mark" aria-hidden>
                <CartIcon />
              </span>
              <span>{pending === "cart" ? "Adding…" : "Add to cart"}</span>
            </button>
          </div>
        </form>
      </article>

      <section className="pdp-tabs">
        <div className="pdp-tablist" role="tablist">
          {(
            [
              ["description", "Product description"],
              ["reviews", "Reviews"],
              ["shipping", "Shipping & delivery"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "is-active" : undefined}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "description" ? (
          <div className="pdp-tab-panel">
            <h2>About {product.title}</h2>
            {product.description || product.shortDescription ? (
              <RichHtml
                className="pdp-description"
                html={product.description || product.shortDescription || ""}
              />
            ) : (
              <p>Details will appear here.</p>
            )}
          </div>
        ) : null}
        {tab === "reviews" ? (
          <ProductReviews productId={product.id} reviews={reviews} />
        ) : null}
        {tab === "shipping" ? (
          <div className="pdp-tab-panel">
            <h2>Shipping & delivery</h2>
            <p>
              This is a digital product. After payment it is delivered to your
              account. There is no physical shipment.
            </p>
          </div>
        ) : null}
      </section>
    </>
  );
}

function packageChoices(product: PublicProductDetail, keepEmptyPackages: boolean): PublicProductPackage[] {
  if (product.packages?.length) return product.packages;
  if (keepEmptyPackages) return [];
  return [
    {
      valueId: "",
      name: product.title,
      priceMinor: product.priceMinor,
      region: "GLOBAL",
      regions: ["GLOBAL"],
      imageUrl: product.primaryImage?.url ?? null,
      inStock: true,
      availableCount: 0,
      instant: false,
    },
  ];
}

function regionChoices(product: PublicProductDetail, packages: PublicProductPackage[]) {
  const values: string[] = [];
  const add = (region: string) => {
    const trimmed = region.trim();
    if (!trimmed || values.some((item) => sameRegion(item, trimmed))) return;
    values.push(trimmed);
  };
  const listed = product.regions ?? [];
  if (listed.length) {
    for (const region of listed) add(region);
    return values;
  }
  for (const pkg of packages) {
    const tags = pkg.regions?.length ? pkg.regions : pkg.region ? [pkg.region] : [];
    for (const region of tags) add(region);
  }
  return values.length ? values : ["GLOBAL"];
}

function initialRegion(product: PublicProductDetail, regions: string[], requested?: string) {
  const chosen = requested?.trim();
  if (chosen && regions.some((region) => sameRegion(region, chosen))) {
    return regions.find((region) => sameRegion(region, chosen)) ?? regions[0] ?? "GLOBAL";
  }
  const preferred = product.defaultRegion?.trim();
  if (preferred && regions.some((region) => sameRegion(region, preferred))) {
    return regions.find((region) => sameRegion(region, preferred)) ?? regions[0] ?? "GLOBAL";
  }
  return regions[0] ?? "GLOBAL";
}

function packageInRegion(pkg: PublicProductPackage, region: string) {
  const tags = pkg.regions?.length ? pkg.regions : pkg.region ? [pkg.region] : [];
  if (!tags.length) return true;
  return tags.some((tag) => sameRegion(tag, region));
}

function stockLabel(pkg: PublicProductPackage) {
  if (!pkg.inStock) return "Out of stock";
  const qty = pkg.availableCount ?? 0;
  const stock = qty > 0 && qty <= 100 ? `Only ${qty} left` : "In stock";
  return pkg.instant ? `Instant delivery · ${stock}` : stock;
}

function RegionPicker({
  regions,
  value,
  onChange,
}: {
  regions: string[];
  value: string;
  onChange: (region: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div className="pdp-region" ref={rootRef}>
      <button
        type="button"
        className={open ? "is-open" : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select package region"
        onClick={() => setOpen((current) => !current)}
      >
        <RegionMark region={value} />
        <span>{value}</span>
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <ul role="listbox">
          {regions.map((region) => (
            <li key={region}>
              <button
                type="button"
                role="option"
                aria-selected={sameRegion(region, value)}
                className={sameRegion(region, value) ? "is-on" : undefined}
                onClick={() => {
                  onChange(region);
                  setOpen(false);
                }}
              >
                <RegionMark region={region} />
                <span>{region}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RegionMark({ region }: { region: string }) {
  const src = regionFlagSrc(region);
  if (!src) {
    return (
      <span className="pdp-region-globe" aria-hidden>
        <GlobeIcon />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="pdp-region-flag" src={src} alt="" width={20} height={15} />
  );
}

function regionFlagSrc(region: string) {
  const normalized = region.trim().toUpperCase();
  const paren = normalized.match(/\(([A-Z]{2})\)/)?.[1];
  const raw = paren ?? (/^[A-Z]{2}$/.test(normalized) ? normalized : "");
  const code = raw === "UK" ? "GB" : raw;
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M13.2 2.8 5.4 13.2h5.2L9.2 21.2 18.6 9.6h-5.3l-.1-6.8Z" fill="currentColor" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6.2 6.5h14.2l-1.5 8.1a1.6 1.6 0 0 1-1.6 1.3H8.6a1.6 1.6 0 0 1-1.6-1.3L5.6 4.2H3.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.2" cy="19.4" r="1.35" fill="currentColor" />
      <circle cx="16.4" cy="19.4" r="1.35" fill="currentColor" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M5 12h12.5M13.2 7.2 18.2 12l-5 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 19.2s-6.2-3.8-6.2-8.1A3.5 3.5 0 0 1 12 8.4a3.5 3.5 0 0 1 6.2 2.7c0 4.3-6.2 8.1-6.2 8.1Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M7 16.4 5.2 19c-.3.4 0 .9.5.9H12a6.1 6.1 0 1 0-5-2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M14.2 20v-6.1h2.1l.3-2.3h-2.4V10c0-.7.2-1.1 1.2-1.1h1.3V6.8c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.1-3.2 3.2v1.7H9.4v2.3h2.2V20h2.6Z"
        fill="currentColor"
      />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M10.2 13.8a3.6 3.6 0 0 0 5.1.2l2.2-2.2a3.6 3.6 0 0 0-5.1-5.1l-1.3 1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M13.8 10.2a3.6 3.6 0 0 0-5.1-.2l-2.2 2.2a3.6 3.6 0 0 0 5.1 5.1l1.2-1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LinesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M5 7h14M5 12h14M5 17h9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3.2 20 7.2v9.6L12 20.8 4 16.8V7.2L12 3.2Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 12V21M12 12 4.2 7.6M12 12l7.8-4.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M4 12h16M12 4c2.2 2.4 3.3 5.1 3.3 8s-1.1 5.6-3.3 8c-2.2-2.4-3.3-5.1-3.3-8s1.1-5.6 3.3-8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={open ? "is-open" : undefined}>
      <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
