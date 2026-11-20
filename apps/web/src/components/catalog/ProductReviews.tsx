"use client";

import { useState, type FormEvent } from "react";
import type { PublicProductReview } from "@amarpin/types";

export function ProductReviews({
  productId,
  reviews,
}: {
  productId: string;
  reviews: PublicProductReview[];
}) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch(`/api/account/reviews/${productId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating, body }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
      status?: string;
    };
    if (!response.ok) {
      setError(
        Array.isArray(payload.message)
          ? payload.message.join(", ")
          : payload.message || "Could not save review",
      );
      return;
    }
    setMessage(`Saved as ${payload.status}. It stays private until approved.`);
    setBody("");
  }

  return (
    <section className="catalog-section">
      <h2>Reviews</h2>
      {reviews.length === 0 ? (
        <p className="empty-state">No approved reviews yet.</p>
      ) : (
        <div className="order-list">
          {reviews.map((review) => (
            <div key={review.id} className="order-row">
              <div>
                <strong>{review.rating}/5</strong>
                <p>
                  {review.authorDisplayName || "Customer"}
                  {review.verifiedPurchase ? " · Verified purchase" : ""}
                </p>
                <p>{review.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <form className="account-stack" onSubmit={(e) => void submit(e)}>
        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="lead">{message}</p> : null}
        <label>
          Rating
          <input
            type="number"
            min={1}
            max={5}
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            required
          />
        </label>
        <label>
          Review
          <textarea
            value={body}
            minLength={8}
            maxLength={2000}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={4}
          />
        </label>
        <button className="primary-btn" type="submit">
          Submit review
        </button>
      </form>
    </section>
  );
}
