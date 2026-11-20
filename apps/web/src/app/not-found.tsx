import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <section className="card">
        <h1>Page not found</h1>
        <p className="lead">
          The page may be unpublished, removed, or the URL is incorrect.
        </p>
        <p className="auth-links">
          <Link href="/">Home</Link>
          {" · "}
          <Link href="/products">Products</Link>
        </p>
      </section>
    </main>
  );
}
