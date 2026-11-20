"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { PublicProductSummary, PublicRegionImage } from "@amarpin/types";
import { productPublicPath } from "@/lib/catalog/paths";
import { regionFlagSrc } from "@/lib/catalog/regions";

export function needsRegionPicker(product: PublicProductSummary) {
  return (product.regionImages?.length ?? 0) > 1 && (product.packageCount ?? 0) > 1;
}

export function ProductLink({
  product,
  className,
  children,
}: {
  product: PublicProductSummary;
  className: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const href = productPublicPath(product.slug);
  if (!needsRegionPicker(product)) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open ? (
        <RegionDialog
          title={product.title}
          slug={product.slug}
          images={product.regionImages}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function RegionDialog({
  title,
  slug,
  images,
  onClose,
}: {
  title: string;
  slug: string;
  images: PublicRegionImage[];
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="region-picker" role="presentation" onClick={onClose}>
      <div
        className="region-picker-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="region-picker-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="region-picker-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path
                d="M7 7l10 10M17 7 7 17"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="region-picker-grid">
          {images.map((image) => (
            <button
              key={image.region}
              type="button"
              className="region-picker-option"
              onClick={() => {
                router.push(`${productPublicPath(slug)}?region=${encodeURIComponent(image.region)}`);
              }}
            >
              <span className="catalog-tile-art">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.imageUrl} alt="" />
              </span>
              <span className="region-picker-name">
                <RegionFlag region={image.region} />
                {image.region}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RegionFlag({ region }: { region: string }) {
  const src = regionFlagSrc(region);
  if (!src) {
    return (
      <span className="region-picker-globe" aria-hidden>
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M4 12h16M12 4c2.2 2.4 3.3 5.1 3.3 8s-1.1 5.6-3.3 8c-2.2-2.4-3.3-5.1-3.3-8s1.1-5.6 3.3-8Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
        </svg>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="region-picker-flag" src={src} alt="" width={22} height={16} />
  );
}
