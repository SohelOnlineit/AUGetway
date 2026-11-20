"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  AdminHomepageSection,
  AdminHomepageSlide,
  AdminNavigationItem,
  AdminSitePage,
  SitePageKeyPublic,
} from "@amarpin/types";
import { SeoFields } from "@/components/admin/SeoFields";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";

const PAGE_LABEL: Record<SitePageKeyPublic, string> = {
  ABOUT: "About",
  CONTACT: "Contact",
  PRIVACY: "Privacy",
  TERMS: "Terms",
  REFUND_POLICY: "Refund policy",
  DISCLAIMERS: "Disclaimers",
};

function sectionKind(type: AdminHomepageSection["type"]) {
  if (type === "FEATURED_PRODUCTS") return "Featured";
  if (type === "CATEGORY_PRODUCTS") return "Category";
  return "Latest";
}

async function uploadImage(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }
  const result = await adminFetch<{ path: string }>("/uploads/images", {
    method: "POST",
    body: JSON.stringify({
      dataBase64: btoa(binary),
      contentType: file.name.toLowerCase().endsWith(".svg") ? "image/svg+xml" : file.type || "image/png",
    }),
  });
  if (!result.ok) return result;
  return result;
}

function Mark({ kind }: { kind: "image" | "layers" | "link" | "file" }) {
  const path =
    kind === "image"
      ? "M5 7h14v10H5zM8 14l2-2 1.5 1.5L14.5 10 18 14"
      : kind === "layers"
        ? "M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4"
        : kind === "link"
          ? "M10 13a5 5 0 007.1.1l1.4-1.4a5 5 0 00-7.1-7.1L10 6M14 11a5 5 0 00-7.1-.1L5.5 12.3a5 5 0 007.1 7.1L14 18"
          : "M7 4.5h7l4 4V19.5H7zM14 4.5V9h4.5M9 13h6M9 16.5h4";
  return (
    <span className="cms-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d={path} />
      </svg>
    </span>
  );
}

export default function AdminCmsPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [slides, setSlides] = useState<AdminHomepageSlide[]>([]);
  const [sections, setSections] = useState<AdminHomepageSection[]>([]);
  const [nav, setNav] = useState<AdminNavigationItem[]>([]);
  const [pages, setPages] = useState<AdminSitePage[]>([]);
  const [selectedPage, setSelectedPage] = useState<AdminSitePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [slideTitle, setSlideTitle] = useState("");
  const [slideFile, setSlideFile] = useState<File | null>(null);
  const [navLabel, setNavLabel] = useState("");
  const [navHref, setNavHref] = useState("/");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const [s, sec, n, p] = await Promise.all([
        adminFetch<AdminHomepageSlide[]>("/cms/slides"),
        adminFetch<AdminHomepageSection[]>("/cms/sections"),
        adminFetch<AdminNavigationItem[]>("/cms/navigation"),
        adminFetch<AdminSitePage[]>("/cms/pages"),
      ]);
      if (cancelled) return;
      if (!s.ok) {
        setError(s.message);
        return;
      }
      if (!sec.ok) {
        setError(sec.message);
        return;
      }
      if (!n.ok) {
        setError(n.message);
        return;
      }
      if (!p.ok) {
        setError(p.message);
        return;
      }
      const pageRows = p.data;
      setSlides(s.data);
      setSections(sec.data);
      setNav(n.data);
      setPages(pageRows);
      setSelectedPage((prev) =>
        prev
          ? (pageRows.find((page) => page.key === prev.key) ?? pageRows[0] ?? null)
          : pageRows[0] ?? null,
      );
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, reload, sessionError]);

  const canWrite = can(permissions, "admin:content:write");

  async function addSlide(event: FormEvent) {
    event.preventDefault();
    if (!slideFile) {
      setError("Choose an image.");
      return;
    }
    const uploaded = await uploadImage(slideFile);
    if (!uploaded.ok) {
      setError(uploaded.message);
      return;
    }
    const result = await adminFetch("/cms/slides", {
      method: "POST",
      body: JSON.stringify({
        title: slideTitle,
        imageUrl: uploaded.data.path,
        isActive: true,
        sortOrder: slides.length,
      }),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSlideTitle("");
    setSlideFile(null);
    setNotice("Slide added.");
    setError(null);
    setReload((v) => v + 1);
  }

  async function addNav(event: FormEvent) {
    event.preventDefault();
    const result = await adminFetch("/cms/navigation", {
      method: "POST",
      body: JSON.stringify({
        label: navLabel,
        href: navHref,
        isActive: true,
        sortOrder: nav.length,
      }),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNavLabel("");
    setNavHref("/");
    setNotice("Navigation link added.");
    setError(null);
    setReload((v) => v + 1);
  }

  async function savePage(event: FormEvent) {
    event.preventDefault();
    if (!selectedPage) return;
    const result = await adminFetch(`/cms/pages/${selectedPage.key}`, {
      method: "PUT",
      body: JSON.stringify({
        title: selectedPage.title,
        body: selectedPage.body,
        seoTitle: selectedPage.seoTitle,
        seoDescription: selectedPage.seoDescription,
        seoImageUrl: selectedPage.seoImageUrl,
        noindex: selectedPage.noindex,
        isPublished: selectedPage.isPublished,
      }),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice(`${PAGE_LABEL[selectedPage.key]} page saved.`);
    setError(null);
    setReload((v) => v + 1);
  }

  async function addLatestSection() {
    const result = await adminFetch("/cms/sections", {
      method: "POST",
      body: JSON.stringify({
        title: "Latest products",
        type: "LATEST_PRODUCTS",
        productLimit: 8,
        isActive: true,
        sortOrder: sections.length,
      }),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice("Latest products section added.");
    setError(null);
    setReload((v) => v + 1);
  }

  const publishedCount = pages.filter((page) => page.isPublished).length;

  return (
    <AdminShell title="Homepage & pages" permissions={permissions} bare>
      <div className="cms-studio">
        {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
        {notice ? <p className="form-success">{notice}</p> : null}

        <header className="cms-hero">
          <p className="cms-crumb">Settings · Home & Slider</p>
          <h1>Homepage & pages</h1>
          <p>
            Posters, product rows, footer links, and the legal pages. Draft pages stay off the public site and the sitemap.
          </p>
        </header>

        <aside className="cms-guide">
          <div>
            <strong>Image size</strong>
            <p>Use these sizes so the picture stays sharp and fills the frame. The site does not crop it.</p>
          </div>
          <ul>
            <li>
              <span>Homepage slider</span>
              <b>3200 × 800 px</b>
              <em>4:1. This matches the wide banner on a computer. JPG, PNG, or WebP.</em>
            </li>
            <li>
              <span>Phone</span>
              <b>Same picture</b>
              <em>On a phone the banner is taller, 2:1. Keep the title and logo in the middle.</em>
            </li>
            <li>
              <span>Page share image</span>
              <b>1200 × 630 px</b>
              <em>The social image on About and the legal pages.</em>
            </li>
          </ul>
        </aside>

        <div className="cms-stats">
          <article>
            <span>Slides</span>
            <strong>{slides.length}</strong>
            <p>{slides.filter((slide) => slide.isActive).length} live on the homepage</p>
          </article>
          <article>
            <span>Sections</span>
            <strong>{sections.length}</strong>
            <p>{sections.filter((section) => section.isActive).length} product rows active</p>
          </article>
          <article>
            <span>Links</span>
            <strong>{nav.length}</strong>
            <p>{nav.filter((item) => item.isActive).length} navigation links on</p>
          </article>
          <article>
            <span>Pages</span>
            <strong>{publishedCount}</strong>
            <p>{pages.length - publishedCount} still in draft</p>
          </article>
        </div>

        <section className="cms-card">
          <header className="cms-card-head">
            <Mark kind="image" />
            <div>
              <h2>Homepage slider</h2>
              <p>Poster images at the top of the homepage. Add a title and upload the picture.</p>
            </div>
          </header>
          {canWrite ? (
            <form className="cms-compose" onSubmit={(e) => void addSlide(e)}>
              <label>
                Title
                <input
                  value={slideTitle}
                  onChange={(e) => setSlideTitle(e.target.value)}
                  placeholder="Summer offer"
                  required
                />
              </label>
              <label>
                Image
                <span className="cms-file">
                  {slideFile ? slideFile.name : "Choose image"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/tiff,image/svg+xml"
                    required
                    onChange={(event) => setSlideFile(event.target.files?.[0] ?? null)}
                  />
                </span>
              </label>
              <button className="primary-btn" type="submit">
                Add slide
              </button>
            </form>
          ) : null}
          {slides.length === 0 ? (
            <p className="cms-empty">No slides yet. The homepage banner stays empty until one is added.</p>
          ) : (
            <div className="cms-slide-list">
              {slides.map((slide, index) => (
                <SlideEditor
                  key={`${slide.id}-${slide.updatedAt}`}
                  slide={slide}
                  index={index}
                  canWrite={canWrite}
                  onChanged={(message) => {
                    setNotice(message);
                    setError(null);
                    setReload((value) => value + 1);
                  }}
                  onError={setError}
                />
              ))}
            </div>
          )}
        </section>

        <div className="cms-split">
          <section className="cms-card">
            <header className="cms-card-head">
              <Mark kind="layers" />
              <div>
                <h2>Product sections</h2>
                <p>Rows of products under the slider.</p>
              </div>
              {canWrite ? (
                <button type="button" className="primary-btn cms-head-action" onClick={() => void addLatestSection()}>
                  Add latest
                </button>
              ) : null}
            </header>
            {sections.length === 0 ? (
              <p className="cms-empty">No sections yet.</p>
            ) : (
              <ul className="cms-rows">
                {sections.map((section, index) => (
                  <li key={section.id}>
                    <span className="cms-index">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{section.title}</strong>
                      <p>
                        {section.productLimit} products
                        {section.categoryName ? ` · ${section.categoryName}` : ""}
                      </p>
                    </div>
                    <span className="cms-kind">{sectionKind(section.type)}</span>
                    <span className={section.isActive ? "cms-pill is-on" : "cms-pill"}>
                      {section.isActive ? "Active" : "Hidden"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cms-card">
            <header className="cms-card-head">
              <Mark kind="link" />
              <div>
                <h2>Navigation</h2>
                <p>Extra links stored for the site menu.</p>
              </div>
            </header>
            {canWrite ? (
              <form className="cms-compose" onSubmit={(e) => void addNav(e)}>
                <label>
                  Label
                  <input
                    value={navLabel}
                    onChange={(e) => setNavLabel(e.target.value)}
                    placeholder="Blog"
                    required
                  />
                </label>
                <label>
                  Address
                  <input
                    value={navHref}
                    onChange={(e) => setNavHref(e.target.value)}
                    placeholder="/blog"
                    required
                  />
                </label>
                <button className="primary-btn" type="submit">
                  Add link
                </button>
              </form>
            ) : null}
            {nav.length === 0 ? (
              <p className="cms-empty">No navigation links yet.</p>
            ) : (
              <ul className="cms-rows">
                {nav.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.label}</strong>
                      <p>{item.href}</p>
                    </div>
                    <span className={item.isActive ? "cms-pill is-on" : "cms-pill"}>
                      {item.isActive ? "Active" : "Hidden"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="cms-card">
          <header className="cms-card-head">
            <Mark kind="file" />
            <div>
              <h2>Site pages</h2>
              <p>About, contact, and the legal pages. Only published pages appear on the site and in the sitemap.</p>
            </div>
          </header>
          {pages.length === 0 ? (
            <p className="cms-empty">No site pages yet.</p>
          ) : (
            <div className="cms-pages">
              <div className="cms-page-nav" role="tablist" aria-label="Site pages">
                {pages.map((page) => (
                  <button
                    key={page.key}
                    type="button"
                    role="tab"
                    aria-selected={selectedPage?.key === page.key}
                    className={selectedPage?.key === page.key ? "is-on" : undefined}
                    onClick={() => setSelectedPage(page)}
                  >
                    <span>{PAGE_LABEL[page.key]}</span>
                    <em className={page.isPublished ? "is-on" : undefined}>
                      {page.isPublished ? "Live" : "Draft"}
                    </em>
                  </button>
                ))}
              </div>
              {selectedPage ? (
                <form className="cms-fields" onSubmit={(e) => void savePage(e)}>
                  <label>
                    Title
                    <input
                      value={selectedPage.title}
                      disabled={!canWrite}
                      onChange={(e) => setSelectedPage({ ...selectedPage, title: e.target.value })}
                    />
                  </label>
                  <div className="cms-body-field">
                    <span>Body</span>
                    <RichTextEditor
                      value={selectedPage.body}
                      onChange={(body) => setSelectedPage({ ...selectedPage, body })}
                      unlimited
                      minHeight="8rem"
                      placeholder="Write the page…"
                    />
                  </div>
                  <SeoFields
                    title={selectedPage.seoTitle ?? ""}
                    description={selectedPage.seoDescription ?? ""}
                    imageUrl={selectedPage.seoImageUrl ?? ""}
                    noindex={selectedPage.noindex}
                    disabled={!canWrite}
                    onChange={(next) =>
                      setSelectedPage({
                        ...selectedPage,
                        seoTitle: next.title || null,
                        seoDescription: next.description || null,
                        seoImageUrl: next.imageUrl || null,
                        noindex: next.noindex,
                      })
                    }
                  />
                  <label className="cms-publish">
                    <input
                      type="checkbox"
                      checked={selectedPage.isPublished}
                      disabled={!canWrite}
                      onChange={(e) =>
                        setSelectedPage({ ...selectedPage, isPublished: e.target.checked })
                      }
                    />
                    <span>
                      <strong>Published</strong>
                      <em>Visible on the site and included in the sitemap.</em>
                    </span>
                  </label>
                  {canWrite ? (
                    <div className="cms-savebar">
                      <button className="primary-btn" type="submit">
                        Save {PAGE_LABEL[selectedPage.key]}
                      </button>
                    </div>
                  ) : null}
                </form>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

function SlideEditor({
  slide,
  index,
  canWrite,
  onChanged,
  onError,
}: {
  slide: AdminHomepageSlide;
  index: number;
  canWrite: boolean;
  onChanged: (message: string) => void;
  onError: (message: string | null) => void;
}) {
  const [title, setTitle] = useState(slide.title);
  const [imageUrl, setImageUrl] = useState(slide.imageUrl);
  const [linkUrl, setLinkUrl] = useState(slide.linkUrl ?? "");
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    const result = await uploadImage(file);
    if (!result.ok) {
      onError(result.message);
      return;
    }
    setImageUrl(result.data.path);
    onError(null);
  }

  async function save() {
    setBusy(true);
    const result = await adminFetch(`/cms/slides/${slide.id}`, {
      method: "PUT",
      body: JSON.stringify({
        title,
        subtitle: slide.subtitle,
        imageUrl,
        linkUrl: linkUrl.trim() || null,
        sortOrder: slide.sortOrder,
        isActive: slide.isActive,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      onError(result.message);
      return;
    }
    onError(null);
    onChanged("Slide saved.");
  }

  async function remove() {
    setBusy(true);
    const result = await adminFetch(`/cms/slides/${slide.id}`, { method: "DELETE" });
    setBusy(false);
    if (!result.ok) {
      onError(result.message);
      return;
    }
    onChanged("Slide deleted.");
  }

  return (
    <article className="cms-slide">
      <div className="cms-slide-preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" />
        <span>{String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="cms-slide-fields">
        <div className="cms-slide-meta">
          <strong>{title || "Untitled slide"}</strong>
          <span className={slide.isActive ? "cms-pill is-on" : "cms-pill"}>
            {slide.isActive ? "Live" : "Hidden"}
          </span>
        </div>
        <label>
          Title
          <input
            type="text"
            value={title}
            disabled={!canWrite || busy}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          Link
          <input
            type="text"
            value={linkUrl}
            disabled={!canWrite || busy}
            placeholder="/category/games"
            onChange={(event) => setLinkUrl(event.target.value)}
          />
        </label>
        {canWrite ? (
          <div className="cms-slide-actions">
            <label className="cms-file">
              Change image
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/tiff,image/svg+xml"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.target.value = "";
                }}
              />
            </label>
            <button type="button" className="primary-btn" disabled={busy} onClick={() => void save()}>
              Save
            </button>
            <button type="button" className="cms-danger" disabled={busy} onClick={() => void remove()}>
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
