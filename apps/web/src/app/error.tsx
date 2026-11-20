"use client";

import Link from "next/link";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main>
      <section className="card">
        <h1>Something went wrong</h1>
        <p className="lead">
          We could not load this page. Error details are hidden to avoid leaking
          internals. Try again or return to the catalog.
        </p>
        <p className="auth-links">
          <button type="button" className="primary-btn" onClick={reset}>
            Retry
          </button>
          {" · "}
          <Link href="/products">Products</Link>
          {" · "}
          <Link href="/">Home</Link>
        </p>
      </section>
    </main>
  );
}
