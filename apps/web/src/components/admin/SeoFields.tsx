export function SeoFields({
  title,
  description,
  imageUrl,
  keywords,
  noindex,
  canonicalPath,
  nofollow,
  disabled,
  compact,
  onChange,
}: {
  title: string;
  description: string;
  imageUrl: string;
  keywords?: string;
  noindex: boolean;
  canonicalPath?: string;
  nofollow?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onChange: (next: {
    title: string;
    description: string;
    imageUrl: string;
    keywords?: string;
    noindex: boolean;
    canonicalPath?: string;
    nofollow?: boolean;
  }) => void;
}) {
  const nextBase = { title, description, imageUrl, keywords, noindex, canonicalPath, nofollow };
  return (
    <div className={compact ? "account-stack seo-fields" : "account-stack"}>
      <label>
        {compact ? (
          <span className="seo-field-line">
            <span>SEO title</span>
            <span className={title.length > 60 ? "seo-count is-long" : "seo-count"}>{title.length}/60</span>
          </span>
        ) : (
          "SEO title"
        )}
        <input
          value={title}
          disabled={disabled}
          onChange={(event) => onChange({ ...nextBase, title: event.target.value })}
        />
        {compact ? null : (
          <span className="muted-note">{title.length} characters. About 50–60 is a comfortable length.</span>
        )}
      </label>
      <label>
        {compact ? (
          <span className="seo-field-line">
            <span>SEO description</span>
            <span className={description.length > 160 ? "seo-count is-long" : "seo-count"}>
              {description.length}/160
            </span>
          </span>
        ) : (
          "SEO description"
        )}
        <textarea
          value={description}
          rows={3}
          disabled={disabled}
          onChange={(event) => onChange({ ...nextBase, description: event.target.value })}
        />
        {compact ? null : (
          <span className="muted-note">
            {description.length} characters. About 150–160 is a comfortable length. Leave blank to inherit the fallback.
          </span>
        )}
      </label>
      {keywords !== undefined ? (
        <label>
          Keywords
          <input
            value={keywords}
            disabled={disabled}
            placeholder="gift card, pubg uc, top up"
            onChange={(event) => onChange({ ...nextBase, keywords: event.target.value })}
          />
          {compact ? null : <span className="muted-note">Separate words with commas.</span>}
        </label>
      ) : null}
      <label>
        Social image
        <input
          value={imageUrl}
          disabled={disabled}
          placeholder="https://… or /api/content/media/…"
          onChange={(event) => onChange({ ...nextBase, imageUrl: event.target.value })}
        />
      </label>
      {canonicalPath !== undefined ? (
        <label>
          Canonical path
          <input
            value={canonicalPath}
            disabled={disabled}
            placeholder="/product-slug"
            onChange={(event) => onChange({ ...nextBase, canonicalPath: event.target.value })}
          />
          {compact ? null : (
            <span className="muted-note">Leave blank to use the product address. Must start with /.</span>
          )}
        </label>
      ) : null}
      <label className="cms-publish">
        <input
          type="checkbox"
          checked={noindex}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...nextBase, noindex: event.target.checked })
          }
        />
        <span>
          <strong>Hide from search</strong>
          {compact ? null : <em>Noindex and omit this page from the sitemap.</em>}
        </span>
      </label>
      {nofollow !== undefined ? (
        <label className="cms-publish">
          <input
            type="checkbox"
            checked={nofollow}
            disabled={disabled}
            onChange={(event) => onChange({ ...nextBase, nofollow: event.target.checked })}
          />
          <span>
            <strong>Nofollow</strong>
            {compact ? null : <em>Ask crawlers not to follow links from this page.</em>}
          </span>
        </label>
      ) : null}
    </div>
  );
}
