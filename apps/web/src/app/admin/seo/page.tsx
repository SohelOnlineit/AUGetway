"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { SEO_VERIFIERS, type AdminRouteSeo, type AdminSeoSettings, type SeoVerificationLink, type SeoVerifierId } from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";

type ShopId = "amarpin" | "uniqbd";
type ShopSeo = { settings: AdminSeoSettings; routes: AdminRouteSeo[] };

const SHOPS: Array<{ id: ShopId; label: string; domain: string }> = [
  { id: "amarpin", label: "AuGetway", domain: "amarpin.com" },
  { id: "uniqbd", label: "UniQbd", domain: "uniqbd.com" },
];

const LOCALES: Array<{ value: AdminSeoSettings["ogLocale"]; label: string }> = [
  { value: "en_US", label: "English (United States)" },
  { value: "en_GB", label: "English (United Kingdom)" },
  { value: "bn_BD", label: "Bangla (Bangladesh)" },
];

const LOCALE_LABEL = Object.fromEntries(LOCALES.map((item) => [item.value, item.label])) as Record<AdminSeoSettings["ogLocale"], string>;

const ROUTE_LABEL: Record<AdminRouteSeo["key"], string> = {
  HOME: "Home",
  PRODUCTS: "Products",
  BLOG: "Blog",
  REQUEST_PRODUCT: "Request product",
};

export default function AdminSeoPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [shop, setShop] = useState<ShopId>("amarpin");
  const [bundle, setBundle] = useState<Record<ShopId, ShopSeo> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draftProvider, setDraftProvider] = useState<SeoVerifierId>("google");
  const [draftName, setDraftName] = useState("");
  const [draftCode, setDraftCode] = useState("");
  const [draftProfile, setDraftProfile] = useState("");
  const [brokenImage, setBrokenImage] = useState("");

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const pairs = await Promise.all(
        SHOPS.map(async (item) => {
          const [settings, routes] = await Promise.all([
            adminFetch<AdminSeoSettings>(`/seo/settings?shop=${item.id}`),
            adminFetch<AdminRouteSeo[]>(`/seo/routes?shop=${item.id}`),
          ]);
          return { item, settings, routes };
        }),
      );
      if (cancelled) return;
      const failed = pairs.find((pair) => !pair.settings.ok || !pair.routes.ok);
      if (failed) {
        setError(!failed.settings.ok ? failed.settings.message : !failed.routes.ok ? failed.routes.message : "Could not load SEO");
        return;
      }
      setBundle(
        Object.fromEntries(
          pairs.map((pair) => [
            pair.item.id,
            {
              settings: pair.settings.ok ? pair.settings.data : null,
              routes: pair.routes.ok ? pair.routes.data : [],
            },
          ]),
        ) as Record<ShopId, ShopSeo>,
      );
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, sessionError]);

  const site = SHOPS.find((item) => item.id === shop)!;
  const current = bundle?.[shop];
  const settings = current?.settings;
  const canWrite = can(permissions, "admin:seo:write");

  function patch(partial: Partial<AdminSeoSettings>) {
    setBundle((value) => {
      if (!value) return value;
      return { ...value, [shop]: { ...value[shop], settings: { ...value[shop].settings, ...partial } } };
    });
    setNotice(null);
  }

  function patchRoute(key: AdminRouteSeo["key"], partial: Partial<AdminRouteSeo>) {
    setBundle((value) => {
      if (!value) return value;
      return {
        ...value,
        [shop]: {
          ...value[shop],
          routes: value[shop].routes.map((route) => (route.key === key ? { ...route, ...partial } : route)),
        },
      };
    });
    setNotice(null);
  }

  function addVerification() {
    if (!settings) return;
    const parsed = readVerification(draftCode, draftProvider, draftName);
    if (!parsed) {
      setError("Paste the verification code, or the whole meta tag from that site.");
      return;
    }
    const key = parsed.provider === "other" ? `other:${parsed.name}` : parsed.provider;
    const next = settings.verifications.filter((item) => (item.provider === "other" ? `other:${item.name}` : item.provider) !== key);
    next.push(parsed);
    patch({
      verifications: next,
      googleSiteVerification: next.find((item) => item.provider === "google")?.code ?? null,
      bingSiteVerification: next.find((item) => item.provider === "bing")?.code ?? null,
    });
    setDraftCode("");
    setDraftName("");
    setError(null);
  }

  function addProfile() {
    if (!settings) return;
    const raw = draftProfile.trim();
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      setError("Profile link must be a full URL, such as https://facebook.com/amarpin");
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      setError("Profile link must start with http:// or https://");
      return;
    }
    const links = profileLinks(settings.sameAs);
    if (links.length >= 8) {
      setError("Add at most 8 profile links.");
      return;
    }
    const next = url.toString();
    if (links.includes(next)) {
      setError("That profile link is already added.");
      return;
    }
    patch({ sameAs: [...links, next].join("\n") });
    setDraftProfile("");
    setError(null);
  }

  function removeProfile(link: string) {
    if (!settings) return;
    const next = profileLinks(settings.sameAs).filter((item) => item !== link);
    patch({ sameAs: next.join("\n") || null });
  }

  function removeVerification(item: SeoVerificationLink) {
    if (!settings) return;
    const next = settings.verifications.filter((row) => row !== item);
    patch({
      verifications: next,
      googleSiteVerification: next.find((row) => row.provider === "google")?.code ?? null,
      bingSiteVerification: next.find((row) => row.provider === "bing")?.code ?? null,
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    if (settings.canonicalBaseUrl?.trim() && !originOf(settings.canonicalBaseUrl, site.domain)) {
      setError("Canonical base URL must start with http:// or https://");
      return;
    }
    const handle = (settings.twitterHandle ?? "").trim().replace(/^@+/, "");
    if (handle && !/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
      setError("X handle must be 1–15 letters, numbers, or underscores.");
      return;
    }
    const imageError = imageProblem(settings.defaultOgImageUrl);
    if (imageError) {
      setError(imageError);
      return;
    }
    const robotsError = robotsProblem(settings.robotsExtra);
    if (robotsError) {
      setError(robotsError);
      return;
    }
    setPending(true);
    setNotice(null);
    const result = await adminFetch<AdminSeoSettings>("/seo/settings", {
      method: "PUT",
      body: JSON.stringify({
        shop,
        siteName: settings.siteName,
        tagline: settings.tagline,
        defaultSeoTitle: settings.defaultSeoTitle,
        defaultSeoDescription: settings.defaultSeoDescription,
        canonicalBaseUrl: settings.canonicalBaseUrl,
        robotsExtra: settings.robotsExtra,
        defaultOgImageUrl: settings.defaultOgImageUrl,
        indexing: settings.indexing,
        titleSuffix: settings.titleSuffix,
        twitterHandle: settings.twitterHandle,
        googleSiteVerification: settings.googleSiteVerification,
        bingSiteVerification: settings.bingSiteVerification,
        verifications: settings.verifications,
        ogLocale: settings.ogLocale,
        sameAs: settings.sameAs,
      }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setBundle((value) => (value ? { ...value, [shop]: { ...value[shop], settings: result.data } } : value));
    setError(null);
    setNotice(`${site.label} SEO saved.`);
  }

  async function saveRoute(route: AdminRouteSeo) {
    setNotice(null);
    const result = await adminFetch<AdminRouteSeo>(`/seo/routes/${route.key}`, {
      method: "PUT",
      body: JSON.stringify({
        shop,
        key: route.key,
        title: route.title,
        description: route.description,
        imageUrl: route.imageUrl,
        canonicalPath: route.canonicalPath,
        noindex: route.noindex,
        nofollow: route.nofollow,
      }),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setBundle((value) =>
      value
        ? {
            ...value,
            [shop]: {
              ...value[shop],
              routes: value[shop].routes.map((item) => (item.key === route.key ? result.data : item)),
            },
          }
        : value,
    );
    setError(null);
    setNotice(`${site.label} ${ROUTE_LABEL[route.key]} page saved.`);
  }

  const titleLength = (settings?.defaultSeoTitle ?? "").length;
  const descriptionLength = (settings?.defaultSeoDescription ?? "").length;
  const host = hostOf(settings?.canonicalBaseUrl) || site.domain;

  return (
    <AdminShell title="SEO" permissions={permissions} bare>
      {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
      {!settings || !current ? (
        <p className="seo-loading">{sessionError ? "" : "Loading SEO settings…"}</p>
      ) : (
        <div className="seo-page">
          <header className="seo-hero">
            <span className="seo-hero-icon" aria-hidden>
              <span className="seo-ring" />
              <SearchIcon />
            </span>
            <div>
              <p>Settings</p>
              <h1>SEO</h1>
              <p>AuGetway and UniQbd keep separate titles, social cards, verification, and crawler rules.</p>
            </div>
          </header>
          {notice ? <p className="seo-notice">{notice}</p> : null}

          <div className="seo-shops" role="tablist" aria-label="Site">
            {SHOPS.map((item, index) => {
              const row = bundle?.[item.id]?.settings;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={item.id === shop}
                  className={item.id === shop ? "is-on" : ""}
                  style={{ animationDelay: `${index * 80}ms` }}
                  onClick={() => {
                    setShop(item.id);
                    setNotice(null);
                    setError(null);
                    setDraftCode("");
                    setDraftName("");
                    setDraftProfile("");
                  }}
                >
                  <span className={`seo-mark seo-mark--${item.id}`} aria-hidden>
                    <span className="seo-ring" />
                    {item.id === "uniqbd" ? <GlobeIcon /> : <PinIcon />}
                  </span>
                  <span>
                    <strong>{item.label}</strong>
                    <em>
                      {item.domain} · {row?.indexing === false ? "Hidden from search" : "Indexing on"}
                    </em>
                  </span>
                </button>
              );
            })}
          </div>

          <section className="seo-stats">
            <Stat label="Search" value={settings.indexing ? "On" : "Off"} meta={settings.indexing ? "Pages can be indexed" : "Whole site is noindex"} tone={settings.indexing ? "is-success" : "is-amber"} icon={<SearchIcon />} />
            <Stat label="Title" value={titleLength ? String(titleLength) : "—"} meta="Aim for 50–60 characters" tone={tone(titleLength, 50, 60)} icon={<TypeIcon />} />
            <Stat label="Description" value={descriptionLength ? String(descriptionLength) : "—"} meta="Aim for 140–160 characters" tone={tone(descriptionLength, 140, 160)} icon={<LinesIcon />} />
            <Stat
              label="Verification"
              value={settings.verifications.length ? String(settings.verifications.length) : "Empty"}
              meta="Google, Bing, and other sites"
              tone={settings.googleSiteVerification || settings.bingSiteVerification ? "is-success" : ""}
              icon={<BadgeIcon />}
            />
          </section>

          <form className="seo-grid" onSubmit={(event) => void save(event)}>
            <section className="seo-card seo-card--wide">
              <header>
                <span className="seo-stat-icon" aria-hidden>
                  <SearchIcon />
                </span>
                <div>
                  <h2>Search listing · {site.label}</h2>
                  <p>This is the default title and description when a page does not set its own.</p>
                </div>
              </header>
              <article className="seo-preview">
                <p>{host}</p>
                <strong>{settings.defaultSeoTitle?.trim() || settings.siteName}</strong>
                <span>{settings.defaultSeoDescription?.trim() || settings.tagline || "Add a description so search results explain this site."}</span>
              </article>
              <label>
                Site name
                <input value={settings.siteName} required disabled={!canWrite} onChange={(event) => patch({ siteName: event.target.value })} />
              </label>
              <label>
                Tagline
                <input value={settings.tagline ?? ""} disabled={!canWrite} onChange={(event) => patch({ tagline: event.target.value || null })} />
              </label>
              <label>
                Default SEO title
                <input value={settings.defaultSeoTitle ?? ""} disabled={!canWrite} onChange={(event) => patch({ defaultSeoTitle: event.target.value || null })} />
                <Meter length={titleLength} good="50–60 is a comfortable length." />
              </label>
              <label>
                Default SEO description
                <textarea rows={3} value={settings.defaultSeoDescription ?? ""} disabled={!canWrite} onChange={(event) => patch({ defaultSeoDescription: event.target.value || null })} />
                <Meter length={descriptionLength} good="140–160 is a comfortable length." />
              </label>
              <label>
                Title suffix
                <input value={settings.titleSuffix ?? ""} maxLength={40} disabled={!canWrite} placeholder={site.label} onChange={(event) => patch({ titleSuffix: event.target.value || null })} />
                <span className="muted-note">Added after inner page titles, for example Page name | {settings.titleSuffix?.trim() || site.label}.</span>
              </label>
            </section>

            <section className="seo-card">
              <header>
                <span className="seo-stat-icon" aria-hidden>
                  <ShareIcon />
                </span>
                <div>
                  <h2>Social cards</h2>
                  <p>This is the card Facebook, X, and chat apps show when a page has no image of its own.</p>
                </div>
              </header>
              <article className="seo-share">
                <div className="seo-share-media">
                  {shareImage(settings.defaultOgImageUrl) && shareImage(settings.defaultOgImageUrl) !== brokenImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={shareImage(settings.defaultOgImageUrl)}
                      alt=""
                      onError={() => setBrokenImage(shareImage(settings.defaultOgImageUrl))}
                    />
                  ) : (
                    <span>Social image appears here</span>
                  )}
                </div>
                <div className="seo-share-body">
                  <p>{host}</p>
                  <strong>{settings.defaultSeoTitle?.trim() || settings.siteName}</strong>
                  <span>{settings.defaultSeoDescription?.trim() || settings.tagline || "Add a description so the shared card explains this site."}</span>
                </div>
                <footer>
                  <em>{settings.twitterHandle?.trim() ? `@${settings.twitterHandle.trim().replace(/^@+/, "")}` : "No X handle"}</em>
                  <em>{LOCALE_LABEL[settings.ogLocale]}</em>
                </footer>
              </article>
              <label>
                Default social image
                <input value={settings.defaultOgImageUrl ?? ""} disabled={!canWrite} placeholder="https://… or /api/content/media/…" onChange={(event) => patch({ defaultOgImageUrl: event.target.value || null })} />
                <span className="muted-note">1200×630 works best. A site path or an http(s) image URL both work.</span>
              </label>
              <label>
                X / Twitter handle
                <span className="seo-prefix">
                  <em>@</em>
                  <input
                    value={(settings.twitterHandle ?? "").replace(/^@+/, "")}
                    maxLength={15}
                    disabled={!canWrite}
                    placeholder="amarpin"
                    onChange={(event) => patch({ twitterHandle: event.target.value.replace(/^@+/, "").replace(/\s/g, "") || null })}
                  />
                </span>
                <span className="muted-note">1–15 letters, numbers, or underscores. This becomes twitter:site.</span>
              </label>
              <label>
                Social locale
                <select value={settings.ogLocale} disabled={!canWrite} onChange={(event) => patch({ ogLocale: event.target.value as AdminSeoSettings["ogLocale"] })}>
                  {LOCALES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <span className="muted-note">Sets og:locale on every public page.</span>
              </label>
              <div className="seo-verify">
                <p>Organization profiles</p>
                <div className="seo-verify-add">
                  <input
                    value={draftProfile}
                    disabled={!canWrite}
                    placeholder="https://facebook.com/…"
                    onChange={(event) => setDraftProfile(event.target.value)}
                  />
                  <button type="button" className="primary-btn" disabled={!canWrite} onClick={() => addProfile()}>
                    Add
                  </button>
                </div>
                {profileLinks(settings.sameAs).length ? (
                  <ul>
                    {profileLinks(settings.sameAs).map((link) => (
                      <li key={link}>
                        <span className="seo-stat-icon" aria-hidden>
                          <ShareIcon />
                        </span>
                        <span>
                          <strong>{hostOf(link) || link}</strong>
                          <em>{link}</em>
                        </span>
                        {canWrite ? (
                          <button type="button" onClick={() => removeProfile(link)}>
                            Remove
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="muted-note">No profiles yet. These become the organization sameAs links, up to 8.</span>
                )}
              </div>
            </section>

            <section className="seo-card">
              <header>
                <span className="seo-stat-icon" aria-hidden>
                  <BotIcon />
                </span>
                <div>
                  <h2>Crawlers</h2>
                  <p>Search indexing, the canonical host, and the paths robots.txt skips.</p>
                </div>
              </header>
              <div className={settings.indexing ? "seo-index is-on" : "seo-index is-off"}>
                <button
                  type="button"
                  className={settings.indexing ? "seo-switch is-on" : "seo-switch"}
                  aria-pressed={settings.indexing}
                  disabled={!canWrite}
                  onClick={() => patch({ indexing: !settings.indexing })}
                >
                  <span />
                  {settings.indexing ? "Allow search engines" : "Hide this site from search"}
                </button>
                <p>
                  {settings.indexing
                    ? "Pages can send index,follow. robots.txt allows the site and sitemap.xml is published."
                    : "Pages send noindex,nofollow. robots.txt blocks the whole site and the sitemap is empty."}
                </p>
              </div>
              <label>
                Canonical base URL
                <input value={settings.canonicalBaseUrl ?? ""} disabled={!canWrite} placeholder={`https://${site.domain}`} onChange={(event) => patch({ canonicalBaseUrl: event.target.value || null })} />
                <span className="muted-note">
                  {originOf(settings.canonicalBaseUrl, site.domain)
                    ? `Canonical links, Open Graph, and the sitemap use ${originOf(settings.canonicalBaseUrl, site.domain)}.`
                    : `Enter a full URL, such as https://${site.domain}.`}
                </span>
              </label>
              <div className="seo-verify">
                <p>Verification links</p>
                <div className="seo-verify-add">
                  <select value={draftProvider} disabled={!canWrite} onChange={(event) => setDraftProvider(event.target.value as SeoVerifierId)}>
                    {SEO_VERIFIERS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  {draftProvider === "other" ? (
                    <input value={draftName} disabled={!canWrite} placeholder="meta name" onChange={(event) => setDraftName(event.target.value)} />
                  ) : null}
                  <input
                    value={draftCode}
                    disabled={!canWrite}
                    placeholder="Paste the code or the meta tag"
                    onChange={(event) => setDraftCode(event.target.value)}
                  />
                  <button type="button" className="primary-btn" disabled={!canWrite} onClick={() => addVerification()}>
                    Add
                  </button>
                </div>
                {settings.verifications.length ? (
                  <ul>
                    {settings.verifications.map((item) => {
                      const known = SEO_VERIFIERS.find((row) => row.id === item.provider);
                      return (
                        <li key={`${item.provider}:${item.name ?? ""}`}>
                          <span className="seo-stat-icon" aria-hidden>
                            <BadgeIcon />
                          </span>
                          <span>
                            <strong>{item.provider === "other" ? item.name : known?.label}</strong>
                            <em>{item.code}</em>
                          </span>
                          {known?.href ? (
                            <a href={known.href} target="_blank" rel="noreferrer">
                              Open
                            </a>
                          ) : null}
                          {canWrite ? (
                            <button type="button" onClick={() => removeVerification(item)}>
                              Remove
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <span className="muted-note">No verification links yet. Add Google, Bing, Yandex, or another site.</span>
                )}
              </div>
              <label>
                Extra robots paths
                <textarea rows={3} value={robotsPaths(settings.robotsExtra)} disabled={!canWrite} placeholder={"/legacy\n/staging"} onChange={(event) => patch({ robotsExtra: event.target.value || null })} />
                <span className="muted-note">One path per line, such as /legacy. Account, cart, checkout, and admin are already blocked.</span>
              </label>
              <div className="seo-robots">
                <p>robots.txt for {site.label}</p>
                <pre>{crawlerPreview(settings.indexing, settings.robotsExtra, originOf(settings.canonicalBaseUrl, site.domain) || `https://${site.domain}`)}</pre>
              </div>
            </section>

            <div className="seo-save">
              <span>
                <em>Last saved</em>
                Updated {formatBangladeshDateTime(settings.updatedAt)}
              </span>
              {canWrite ? (
                <button type="submit" className="primary-btn" disabled={pending}>
                  {pending ? "Saving…" : `Save ${site.label} SEO`}
                </button>
              ) : (
                <p className="muted-note">Read-only — need admin:seo:write.</p>
              )}
            </div>
          </form>

          <section className="seo-routes">
            <header>
              <span className="seo-stat-icon" aria-hidden>
                <PagesIcon />
              </span>
              <div>
                <h2>Fixed pages · {site.label}</h2>
                <p>Home, products, blog, and request product. Blank fields inherit the site defaults. Product, category, brand, and blog records keep their own SEO.</p>
              </div>
            </header>
            <div className="seo-route-grid">
              {current.routes.map((route) => (
                <form
                  key={route.key}
                  className="seo-card"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveRoute(route);
                  }}
                >
                  <header>
                    <strong>
                      {ROUTE_LABEL[route.key]} <em>{route.path}</em>
                    </strong>
                  </header>
                  <label>
                    Title
                    <input value={route.title ?? ""} disabled={!canWrite} onChange={(event) => patchRoute(route.key, { title: event.target.value || null })} />
                    <Meter length={(route.title ?? "").length} good="Leave blank to use the site title." />
                  </label>
                  <label>
                    Description
                    <textarea rows={3} value={route.description ?? ""} disabled={!canWrite} onChange={(event) => patchRoute(route.key, { description: event.target.value || null })} />
                  </label>
                  <label>
                    Social image
                    <input value={route.imageUrl ?? ""} disabled={!canWrite} onChange={(event) => patchRoute(route.key, { imageUrl: event.target.value || null })} />
                  </label>
                  <label>
                    Canonical path
                    <input value={route.canonicalPath ?? ""} disabled={!canWrite} placeholder={route.path} onChange={(event) => patchRoute(route.key, { canonicalPath: event.target.value || null })} />
                  </label>
                  <label className="seo-check">
                    <input type="checkbox" checked={route.noindex} disabled={!canWrite} onChange={(event) => patchRoute(route.key, { noindex: event.target.checked })} />
                    <span>
                      <strong>Noindex</strong>
                      <em>Leave this page out of search results and the sitemap.</em>
                    </span>
                  </label>
                  <label className="seo-check">
                    <input type="checkbox" checked={route.nofollow} disabled={!canWrite} onChange={(event) => patchRoute(route.key, { nofollow: event.target.checked })} />
                    <span>
                      <strong>Nofollow</strong>
                      <em>Ask crawlers not to follow links from this page.</em>
                    </span>
                  </label>
                  {canWrite ? (
                    <button className="primary-btn" type="submit">
                      Save {ROUTE_LABEL[route.key]}
                    </button>
                  ) : null}
                </form>
              ))}
            </div>
          </section>
        </div>
      )}
    </AdminShell>
  );
}

function readVerification(raw: string, provider: SeoVerifierId, name: string): SeoVerificationLink | null {
  const content = raw.match(/content\s*=\s*["']([^"']+)["']/i)?.[1] ?? raw;
  const metaName = raw.match(/name\s*=\s*["']([^"']+)["']/i)?.[1];
  const code = content.trim();
  if (!/^[A-Za-z0-9_.:-]{8,160}$/.test(code)) return null;
  const otherName = (metaName || name).trim().toLowerCase();
  if (provider === "other" && !/^[a-z][a-z0-9:_-]{2,40}$/.test(otherName)) return null;
  return { provider, name: provider === "other" ? otherName : null, code };
}

function profileLinks(value: string | null | undefined) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function shareImage(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("..")) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    return "";
  }
  return "";
}

function imageProblem(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  if (raw.length > 500) return "Social image URL is too long.";
  if (shareImage(raw)) return "";
  return "Social image must be an http(s) URL or a site path.";
}

function robotsPaths(value: string | null | undefined) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^disallow:\s+/i, ""))
    .join("\n");
}

function robotsProblem(value: string | null | undefined) {
  const lines = (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^disallow:\s+/i, "").split("?")[0]?.split("#")[0] ?? "");
  if (lines.length > 40) return "Add at most 40 extra robots paths.";
  for (const path of lines) {
    if (path === "/") return "Use the search switch to hide the whole site.";
    if (!path.startsWith("/") || path.includes("..") || !/^\/[A-Za-z0-9._~/-]*$/.test(path)) {
      return "Each robots path must start with /, for example /legacy.";
    }
  }
  return "";
}

function crawlerPreview(indexing: boolean, extra: string | null | undefined, origin: string) {
  if (!indexing) return "User-agent: *\nDisallow: /";
  const paths = robotsPaths(extra)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("/") && line !== "/");
  return ["User-agent: *", "Allow: /", "Disallow: /admin", "Disallow: /cart", "Disallow: /checkout", ...paths.map((path) => `Disallow: ${path}`), `Sitemap: ${origin}/sitemap.xml`].join("\n");
}

function originOf(value: string | null | undefined, fallback: string) {
  const raw = value?.trim();
  if (!raw) return `https://${fallback}`;
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
  } catch {
    return "";
  }
  return "";
}

function hostOf(value: string | null | undefined) {
  if (!value?.trim()) return "";
  try {
    return new URL(value.trim()).host;
  } catch {
    return "";
  }
}

function tone(length: number, min: number, max: number) {
  if (!length) return "";
  if (length >= min && length <= max) return "is-success";
  if (length > max) return "is-amber";
  return "";
}

function Meter({ length, good }: { length: number; good: string }) {
  return (
    <span className="muted-note">
      {length} characters. {good}
    </span>
  );
}

function Stat({
  label,
  value,
  meta,
  tone: toneName,
  icon,
}: {
  label: string;
  value: string;
  meta: string;
  tone: string;
  icon: ReactNode;
}) {
  return (
    <article className={toneName}>
      <span className="seo-stat-icon" aria-hidden>
        {icon}
      </span>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{meta}</span>
    </article>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.4 2.6 2.4 13.4 0 16M12 4c-2.4 2.6-2.4 13.4 0 16" />
    </svg>
  );
}

function TypeIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5 6h14M12 6v12M8 18h8" />
    </svg>
  );
}

function LinesIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5 7h14M5 12h14M5 17h9" />
    </svg>
  );
}

function BadgeIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="7" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="6" cy="12" r="2" />
      <circle cx="17" cy="7" r="2" />
      <circle cx="17" cy="17" r="2" />
      <path d="M8 11l7-3M8 13l7 3" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="5" y="8" width="14" height="10" rx="2" />
      <path d="M12 8V5M9 13h.01M15 13h.01" />
    </svg>
  );
}

function PagesIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M7 4h8l4 4v12H7z" />
      <path d="M15 4v4h4" />
    </svg>
  );
}
