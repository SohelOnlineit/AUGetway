"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AdminAppearance, StorefrontBrand } from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { applyAdminFavicon } from "@/components/admin/AdminTabIcon";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";
import { resolveStorefrontFromHost, STOREFRONT_LOGOS, type StorefrontId } from "@/lib/storefront";

const MAX_BYTES = 2 * 1024 * 1024;
const BRANDS: Array<{ id: StorefrontId; domain: string }> = [
  { id: "amarpin", domain: "amarpin.com" },
  { id: "uniqbd", domain: "uniqbd.com" },
];

type LogoField = "lightLogoPath" | "darkLogoPath" | "faviconPath";

function emptyBrand(id: StorefrontId): StorefrontBrand {
  const siteName = id === "uniqbd" ? "UniQbd" : "AuGetway";
  return {
    id,
    siteName,
    logoAlt: siteName,
    lightLogoPath: null,
    darkLogoPath: null,
    faviconPath: null,
  };
}

function Mark({ kind }: { kind: "logo" | "check" }) {
  return (
    <span className={`appearance-mark appearance-mark--${kind}`} aria-hidden="true">
      {kind === "check" ? (
        <svg viewBox="0 0 24 24">
          <path d="M6 12.5l4 4L18 8" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24">
          <path d="M5 7h14v10H5zM8 14l2-2 1.5 1.5L14.5 10 18 14" />
        </svg>
      )}
    </span>
  );
}

export default function AppearancePage() {
  const router = useRouter();
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [brands, setBrands] = useState<StorefrontBrand[]>([emptyBrand("amarpin"), emptyBrand("uniqbd")]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileTarget = useRef<{ id: StorefrontId; field: LogoField } | null>(null);

  const canWrite = can(permissions, "admin:seo:write");
  const canUpload = can(permissions, "admin:content:write");

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<AdminAppearance>("/appearance");
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setBrands(orderBrands(result.data.brands));
      setReady(true);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, sessionError]);

  function patchBrand(id: StorefrontId, patch: Partial<StorefrontBrand>) {
    setBrands((current) => current.map((brand) => (brand.id === id ? { ...brand, ...patch } : brand)));
  }

  function chooseFile(id: StorefrontId, field: LogoField) {
    fileTarget.current = { id, field };
    fileInput.current?.click();
  }

  async function upload(file: File) {
    const target = fileTarget.current;
    if (!target) return;
    if (!canUpload) {
      setError("Image upload needs content write access.");
      setNotice(null);
      return;
    }
    const type = file.type.toLowerCase();
    const svg = type === "image/svg+xml" || type === "image/svg" || file.name.toLowerCase().endsWith(".svg");
    const raster = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/gif",
      "image/avif",
      "image/bmp",
      "image/tiff",
      "image/tif",
      "image/x-icon",
      "image/vnd.microsoft.icon",
    ].includes(type);
    if (!svg && !raster) {
      setError("Use an image file. SVG stays SVG. Other images are saved as WebP.");
      setNotice(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image exceeds the 2 MB limit.");
      setNotice(null);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]!);
    }
    const result = await adminFetch<{ path: string }>("/uploads/images", {
      method: "POST",
      body: JSON.stringify({
        dataBase64: btoa(binary),
        contentType: svg ? "image/svg+xml" : file.type || "image/png",
      }),
    });
    if (!result.ok) {
      setError(result.message);
      setNotice(null);
      return;
    }
    patchBrand(target.id, { [target.field]: result.data.path });
    setError(null);
    setNotice("Image uploaded. Save appearance to publish it on that site.");
  }

  async function save(next: StorefrontBrand[] = brands) {
    if (!canWrite) return;
    setPending(true);
    setNotice(null);
    const result = await adminFetch<AdminAppearance>("/appearance", {
      method: "PUT",
      body: JSON.stringify({
        brands: next.map((brand) => ({
          id: brand.id,
          siteName: brand.siteName,
          logoAlt: brand.logoAlt,
          lightLogoPath: brand.lightLogoPath,
          darkLogoPath: brand.darkLogoPath,
          faviconPath: brand.faviconPath,
        })),
      }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const saved = orderBrands(result.data.brands);
    setBrands(saved);
    const hostId = resolveStorefrontFromHost(window.location.host);
    applyAdminFavicon(saved.find((brand) => brand.id === hostId)?.faviconPath ?? null);
    setError(null);
    setNotice("Saved. Each site now uses its own logos and favicon.");
    router.refresh();
  }

  async function resetBrand(id: StorefrontId) {
    const next = brands.map((brand) => (brand.id === id ? emptyBrand(id) : brand));
    setBrands(next);
    await save(next);
  }

  return (
    <AdminShell title="Appearance & theme" permissions={permissions} bare>
      <div className="appearance-page">
        {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
        {notice ? <p className="form-success">{notice}</p> : null}
        {!ready ? <p>Loading…</p> : null}

        {ready ? (
          <>
            <section className="brand-stage">
              <header className="brand-stage-hero">
                <span className="brand-stage-icon" aria-hidden>
                  <span className="brand-stage-ring" />
                  <LayersIcon />
                </span>
                <div>
                  <p>Appearance</p>
                  <h2>Two sites, two brands</h2>
                  <p>AuGetway and UniQbd keep their own header logos and browser-tab icons. Uploading one does not change the other.</p>
                </div>
              </header>
              <div className="brand-stage-grid">
                {brands.map((brand, index) => {
                  const meta = BRANDS.find((item) => item.id === brand.id)!;
                  const builtin = STOREFRONT_LOGOS[brand.id];
                  const logo = brand.darkLogoPath || brand.lightLogoPath || builtin.dark;
                  const custom = Boolean(brand.lightLogoPath || brand.darkLogoPath);
                  return (
                    <article key={brand.id} className="brand-stage-card" style={{ animationDelay: `${index * 80}ms` }}>
                      <span className={`brand-stage-mark brand-stage-mark--${brand.id}`} aria-hidden>
                        <span className="brand-stage-ring" />
                        {brand.id === "uniqbd" ? <GlobeIcon /> : <PinIcon />}
                      </span>
                      <div className="brand-stage-copy">
                        <strong>{brand.siteName}</strong>
                        <span>{meta.domain}</span>
                      </div>
                      <div className="brand-stage-logo">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logo} alt="" />
                      </div>
                      <ul>
                        <li className={custom ? "is-brand" : "is-amber"}>
                          <i aria-hidden />
                          {custom ? "Custom logo" : "Built-in logo"}
                        </li>
                        <li className={brand.faviconPath ? "is-success" : ""}>
                          <i aria-hidden />
                          {brand.faviconPath ? "Favicon set" : "No favicon yet"}
                        </li>
                      </ul>
                    </article>
                  );
                })}
              </div>
            </section>

            {brands.map((brand) => {
              const meta = BRANDS.find((item) => item.id === brand.id)!;
              const builtin = STOREFRONT_LOGOS[brand.id];
              const lightSrc = brand.lightLogoPath || builtin.light;
              const darkSrc = brand.darkLogoPath || builtin.dark;
              return (
                <section className="appearance-card" key={brand.id}>
                  <header className="appearance-head">
                    <Mark kind="logo" />
                    <div>
                      <h2>{brand.siteName || meta.domain}</h2>
                      <p>{meta.domain} — light logo, dark logo, and the tab icon for this site and its admin.</p>
                    </div>
                  </header>

                  <div className="appearance-upload-grid">
                    <label>
                      Site name
                      <input
                        value={brand.siteName}
                        maxLength={80}
                        disabled={!canWrite}
                        onChange={(event) => patchBrand(brand.id, { siteName: event.target.value })}
                      />
                    </label>
                    <label>
                      Alt text
                      <input
                        value={brand.logoAlt}
                        maxLength={80}
                        disabled={!canWrite}
                        onChange={(event) => patchBrand(brand.id, { logoAlt: event.target.value })}
                      />
                    </label>
                  </div>

                  <div className="appearance-upload-grid">
                    <article>
                      <h3>Light mode logo</h3>
                      <p>Header and footer when this site is in light mode.</p>
                      <button
                        type="button"
                        className="appearance-upload"
                        disabled={!canUpload || pending}
                        onClick={() => chooseFile(brand.id, "lightLogoPath")}
                      >
                        Upload light logo
                      </button>
                      <button
                        type="button"
                        className="appearance-clear"
                        disabled={!canWrite || pending || !brand.lightLogoPath}
                        onClick={() => patchBrand(brand.id, { lightLogoPath: null })}
                      >
                        Use built-in
                      </button>
                      <p className="appearance-active">Active: {brand.lightLogoPath || builtin.light}</p>
                    </article>
                    <article>
                      <h3>Dark mode logo</h3>
                      <p>Header and footer when this site is in dark mode.</p>
                      <button
                        type="button"
                        className="appearance-upload"
                        disabled={!canUpload || pending}
                        onClick={() => chooseFile(brand.id, "darkLogoPath")}
                      >
                        Upload dark logo
                      </button>
                      <button
                        type="button"
                        className="appearance-clear"
                        disabled={!canWrite || pending || !brand.darkLogoPath}
                        onClick={() => patchBrand(brand.id, { darkLogoPath: null })}
                      >
                        Use built-in
                      </button>
                      <p className="appearance-active">Active: {brand.darkLogoPath || builtin.dark}</p>
                    </article>
                  </div>

                  <div className="appearance-preview-grid">
                    <figure>
                      <figcaption>Light · {meta.domain}</figcaption>
                      <div className="appearance-preview is-light">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={lightSrc} alt={brand.logoAlt || brand.siteName} />
                      </div>
                    </figure>
                    <figure>
                      <figcaption>Dark · {meta.domain}</figcaption>
                      <div className="appearance-preview is-dark">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={darkSrc} alt="" />
                      </div>
                    </figure>
                  </div>

                  <div className="appearance-favicon">
                    <div className="appearance-favicon-top">
                      <div>
                        <h3>Favicon</h3>
                        <p>Browser tab icon on {meta.domain}, including /admin opened on that domain.</p>
                      </div>
                      <button
                        type="button"
                        className="appearance-clear"
                        disabled={!canWrite || pending || !brand.faviconPath}
                        onClick={() => {
                          patchBrand(brand.id, { faviconPath: null });
                          setNotice("Favicon cleared in this form. Save appearance to apply it.");
                          setError(null);
                        }}
                      >
                        Clear
                      </button>
                    </div>
                    <button
                      type="button"
                      className="appearance-upload"
                      disabled={!canUpload || pending}
                      onClick={() => chooseFile(brand.id, "faviconPath")}
                    >
                      Upload favicon
                    </button>
                    <p className="appearance-help">Best: 32×32 PNG. JPEG, PNG, or WebP. Max 2 MB.</p>
                    <p className="appearance-active">Active: {brand.faviconPath || "none"}</p>
                    <div className="appearance-tab">
                      {brand.faviconPath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={brand.faviconPath} alt="" />
                      ) : (
                        <Mark kind="logo" />
                      )}
                      <span>{brand.siteName || meta.domain}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="appearance-reset"
                    disabled={!canWrite || pending}
                    onClick={() => void resetBrand(brand.id)}
                  >
                    Reset {brand.siteName || meta.domain} to built-in
                  </button>
                </section>
              );
            })}

            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/tiff,image/svg+xml"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }}
            />

            <div className="appearance-savebar">
              <div>
                <strong>Save both sites</strong>
                <span>Publish the logos and favicons for AuGetway and UniQbd.</span>
              </div>
              <div className="appearance-savebar-actions">
                <button type="button" className="appearance-save" disabled={!canWrite || pending} onClick={() => void save()}>
                  {pending ? "Saving…" : "Save appearance"}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}

function orderBrands(brands: StorefrontBrand[]) {
  return BRANDS.map((item) => brands.find((brand) => brand.id === item.id) ?? emptyBrand(item.id));
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 3 8l9 5 9-5-9-5Zm-9 8 9 5 9-5M3 16l9 5 9-5" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.4 2.2 3.6 5 3.6 8s-1.2 5.8-3.6 8c-2.4-2.2-3.6-5-3.6-8s1.2-5.8 3.6-8Z" />
    </svg>
  );
}
