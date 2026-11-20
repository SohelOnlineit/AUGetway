"use client";

import Link from "next/link";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="admin-main">
      <section className="card admin-panel">
        <h1>Admin error</h1>
        <p className="lead">
          Something failed in the admin UI. Details are not shown here to avoid
          leaking internals.
        </p>
        <p className="auth-links">
          <button type="button" className="primary-btn" onClick={reset}>
            Retry
          </button>
          {" · "}
          <Link href="/admin">Overview</Link>
        </p>
      </section>
    </main>
  );
}
