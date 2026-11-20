"use client";

import { useEffect, useState } from "react";

type Notice = { id: number; text: string; tone: "ok" | "error" };

const SELECTOR = ".form-success, .form-error, .catalog-notice, .product-editor-saved";

const seen = new WeakMap<Element, string>();
const queue: Notice[] = [];
let holding = false;
let active: Notice | null = null;
let seq = 0;
const subscribers = new Set<(item: Notice | null) => void>();

function emit(item: Notice | null) {
  active = item;
  holding = item !== null;
  subscribers.forEach((notify) => notify(item));
}

function dismissNotice() {
  emit(queue.shift() ?? null);
}

function publish(item: Notice) {
  if (holding) queue.push(item);
  else emit(item);
}

function scanNotices() {
  document.querySelectorAll(SELECTOR).forEach((el) => {
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!text || seen.get(el) === text) return;
    seen.set(el, text);
    publish({
      id: ++seq,
      text,
      tone: el.classList.contains("form-error") ? "error" : "ok",
    });
  });
}

export function ScreenNotice() {
  const [current, setCurrent] = useState<Notice | null>(null);

  useEffect(() => {
    subscribers.add(setCurrent);
    if (active) setCurrent(active);
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(scanNotices);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const poll = window.setInterval(scanNotices, 400);
    scanNotices();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissNotice();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      subscribers.delete(setCurrent);
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.clearInterval(poll);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!current || current.tone !== "ok") return;
    const timer = window.setTimeout(dismissNotice, 2800);
    return () => window.clearTimeout(timer);
  }, [current]);

  if (!current) return null;

  return (
    <div className="screen-notice" role="presentation" onClick={dismissNotice}>
      <div
        className={`screen-notice-card is-${current.tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="screen-notice-text"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="screen-notice-mark" aria-hidden>
          {current.tone === "error" ? <AlertIcon /> : <CheckIcon />}
        </span>
        <p id="screen-notice-text">{current.text}</p>
        <button type="button" onClick={dismissNotice}>OK</button>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5 12.5 9.2 17 19 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 4.5 3.5 19.5h17L12 4.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 10v4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 16.8h.01" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
