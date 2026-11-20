"use client";

import { useCallback, useEffect, useState } from "react";

const AUTOPLAY_MS = 6000;

export function HomePosterSlider({
  slides,
}: {
  slides: Array<{
    id: string;
    title: string;
    imageUrl: string;
    linkUrl: string | null;
  }>;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  const goTo = useCallback(
    (next: number) => {
      if (count <= 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    setIndex(0);
  }, [count]);

  useEffect(() => {
    if (count <= 1 || paused) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  if (count === 0) return null;

  return (
    <section
      className="home-hero"
      aria-label="Featured promotions"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="home-hero-stage">
        {slides.map((slide, slideIndex) => {
          const active = slideIndex === index;
          const image = (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slide.imageUrl}
              alt={slide.title || "Homepage banner"}
              loading={slideIndex === 0 ? "eager" : "lazy"}
              fetchPriority={slideIndex === 0 ? "high" : "low"}
              decoding="async"
            />
          );
          return (
            <div
              key={slide.id}
              className={`home-hero-slide${active ? " is-active" : ""}`}
              aria-hidden={!active}
            >
              {slide.linkUrl ? (
                <a href={slide.linkUrl} tabIndex={active ? 0 : -1}>
                  {image}
                </a>
              ) : (
                <div>{image}</div>
              )}
            </div>
          );
        })}
        {count > 1 ? (
          <>
            <button
              type="button"
              className="home-hero-arrow home-hero-arrow--prev"
              aria-label="Previous slide"
              onClick={() => goTo(index - 1)}
            >
              <Chevron direction="left" />
            </button>
            <button
              type="button"
              className="home-hero-arrow home-hero-arrow--next"
              aria-label="Next slide"
              onClick={() => goTo(index + 1)}
            >
              <Chevron direction="right" />
            </button>
          </>
        ) : null}
      </div>
      {count > 1 ? (
        <div className="home-hero-dots">
          {slides.map((slide, dotIndex) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`Go to slide ${dotIndex + 1}`}
              aria-current={dotIndex === index ? "true" : undefined}
              className={dotIndex === index ? "is-active" : undefined}
              onClick={() => goTo(dotIndex)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
