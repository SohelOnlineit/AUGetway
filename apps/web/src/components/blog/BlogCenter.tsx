import Link from "next/link";
import type { PublicBlogCategory, PublicBlogPostSummary } from "@amarpin/types";

function readingMinutes(text: string | null) {
  const words = (text ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

export function BlogCenter({
  siteName,
  categories,
  posts,
  activeSlug,
  query,
}: {
  siteName: string;
  categories: PublicBlogCategory[];
  posts: PublicBlogPostSummary[];
  activeSlug?: string;
  query?: string;
}) {
  return (
    <div className="blog-center">
      <header className="blog-hero">
        <div>
          <p className="blog-kicker">
            <DocIcon />
            Blog center
          </p>
          <h1>
            {siteName} <span>Blog.</span>
          </h1>
          <p>Guides, product news, and digital shopping tips from the {siteName} team.</p>
        </div>
        <span className="blog-hero-art" aria-hidden>
          <span className="blog-bubble blog-bubble--a" />
          <span className="blog-bubble blog-bubble--b" />
          <span className="blog-bubble blog-bubble--c" />
          <span className="blog-bubble blog-bubble--d" />
          <DocBadge />
        </span>
      </header>

      <div className="blog-layout">
        <aside className="blog-side">
          <section>
            <h2>Search</h2>
            <form className="blog-search" action="/blog" method="get">
              <input name="q" defaultValue={query ?? ""} placeholder="Search articles..." />
              <button type="submit">
                <SearchIcon />
                Search
              </button>
            </form>
          </section>
          <section>
            <h2>Categories</h2>
            <nav className="blog-cats" aria-label="Blog categories">
              <Link href="/blog" className={activeSlug ? "" : "is-on"}>
                All articles
              </Link>
              {categories.map((category) => (
                <Link
                  key={category.id}
                  href={`/blog/category/${category.slug}`}
                  className={category.slug === activeSlug ? "is-on" : ""}
                >
                  {category.name}
                </Link>
              ))}
            </nav>
          </section>
        </aside>

        <div className="blog-feed">
          {posts.length === 0 ? (
            <p className="blog-empty">{query ? "No articles match that search." : "No published articles yet."}</p>
          ) : (
            posts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className="blog-card">
                <span className="blog-card-media">
                  {post.coverImagePath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.coverImagePath} alt="" />
                  ) : (
                    <DocBadge />
                  )}
                </span>
                <strong>{post.title}</strong>
                {post.excerpt || post.seoDescription ? <p>{post.excerpt || post.seoDescription}</p> : null}
                <em>{readingMinutes(post.excerpt || post.seoDescription)} min read</em>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M14 3.5V8h4.5M8.5 12h7M8.5 16h5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function DocBadge() {
  return (
    <svg className="blog-doc" viewBox="0 0 88 88" aria-hidden="true">
      <path className="blog-doc-spark" d="M70 10l1.2 3.2L74.4 14l-3.2 1.2L70 18.4 68.8 15.2 65.6 14l3.2-1.2L70 10Z" />
      <path className="blog-doc-spark" d="M78 24l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
      <rect x="22" y="16" width="40" height="52" rx="8" />
      <path d="M34 32h16M34 40h16M34 48h10" />
      <circle cx="58" cy="56" r="10" />
      <path d="m53.5 56 3 3 6-6" />
    </svg>
  );
}
