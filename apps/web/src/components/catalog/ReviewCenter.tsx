import Link from "next/link";
import type { PublicReviewFeed } from "@amarpin/types";

type Filters = {
  q: string;
  category: string;
  product: string;
  page: number;
};

export function ReviewCenter({ feed, filters }: { feed: PublicReviewFeed; filters: Filters }) {
  const label = feed.total === 1 ? "review" : "reviews";

  return (
    <div className="vreviews">
      <header className="vreviews-hero">
        <div>
          <p>Customer reviews</p>
          <h1>Verified Reviews.</h1>
          <p>Read verified customer reviews across our digital products and categories.</p>
        </div>
        <form className="vreviews-search" action="/reviews" method="get">
          {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
          {filters.product ? <input type="hidden" name="product" value={filters.product} /> : null}
          <SearchIcon />
          <input name="q" defaultValue={filters.q} placeholder="Search by product or category…" />
        </form>
      </header>

      <div className="vreviews-layout">
        <aside className="vreviews-side">
          <h2>Browse</h2>
          <p>All reviews</p>
          <Link className={!filters.category && !filters.product ? "is-on" : ""} href={reviewHref({ ...filters, category: "", product: "", page: 1 })}>
            All reviews
            <em>{feed.categories.reduce((sum, item) => sum + item.count, 0)}</em>
          </Link>
          <p>Categories</p>
          <nav aria-label="Review categories">
            {feed.categories.map((item) => (
              <Link
                key={item.id}
                className={filters.category === item.slug ? "is-on" : ""}
                href={reviewHref({ ...filters, category: item.slug, product: "", page: 1 })}
              >
                {item.name}
                <em>{item.count}</em>
              </Link>
            ))}
          </nav>
          <p>Products</p>
          <nav aria-label="Review products">
            {feed.products.map((item) => (
              <Link
                key={item.id}
                className={filters.product === item.slug ? "is-on" : ""}
                href={reviewHref({ ...filters, product: item.slug, category: "", page: 1 })}
              >
                {item.name}
                <em>{item.count}</em>
              </Link>
            ))}
          </nav>
        </aside>

        <section className="vreviews-feed" aria-label="Customer reviews">
          <p className="vreviews-count">
            {feed.total} published customer {label}
          </p>
          {feed.reviews.length === 0 ? (
            <p className="vreviews-empty">No published reviews match this view.</p>
          ) : (
            feed.reviews.map((review) => {
              const name = review.authorDisplayName?.trim() || "Customer";
              return (
                <article key={review.id} className="vreviews-card">
                  <header>
                    <div>
                      <Link href={`/${review.productSlug}`}>{review.productTitle}</Link>
                      <span>·</span>
                      <Link href={`/category/${review.categorySlug}`}>{review.categoryName}</Link>
                    </div>
                  </header>
                  <div className="vreviews-person">
                    <span aria-hidden>{name.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <strong>
                        {name}
                        {review.verifiedPurchase ? <em>Verified buyer</em> : null}
                      </strong>
                      <Stars rating={review.rating} />
                      <time dateTime={review.createdAt}>{formatReviewDate(review.createdAt)}</time>
                    </div>
                    <b>{review.rating.toFixed(1)}</b>
                  </div>
                  <p>{review.body}</p>
                </article>
              );
            })
          )}
          <nav className="vreviews-pages" aria-label="Reviews pagination">
            {filters.page > 1 ? (
              <Link href={reviewHref({ ...filters, page: filters.page - 1 })}>Previous</Link>
            ) : (
              <span>Previous</span>
            )}
            <p>
              Page {feed.page} of {feed.pageCount}
            </p>
            {filters.page < feed.pageCount ? (
              <Link href={reviewHref({ ...filters, page: filters.page + 1 })}>Next</Link>
            ) : (
              <span>Next</span>
            )}
          </nav>
        </section>
      </div>
    </div>
  );
}

function reviewHref(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.product) params.set("product", filters.product);
  if (filters.page > 1) params.set("page", String(filters.page));
  const qs = params.toString();
  return qs ? `/reviews?${qs}` : "/reviews";
}

function formatReviewDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  }).format(new Date(value));
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="vreviews-stars" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <i key={index} className={index < rating ? "is-on" : ""}>
          ★
        </i>
      ))}
    </span>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}
