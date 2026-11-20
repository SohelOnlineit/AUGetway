"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

function Chevron() {
  return (
    <span className="filter-menu-btn-chevron" aria-hidden>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M4 6.25 8 10.25 12 6.25"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function FilterMenu({
  label,
  value,
  options,
  disabled,
  onChange,
  searchable = false,
  searchPlaceholder = "Search",
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  onChange: (value: string) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = options.find((option) => option.value === value)?.label ?? options[0]?.label ?? "";
  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!searchable || !needle) return options;
    return options.filter((option) => {
      const name = option.label.toLowerCase();
      const code = option.value.toLowerCase();
      return name.includes(needle) || code.includes(needle);
    });
  }, [needle, options, searchable]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open || !searchable) return;
    setQuery("");
    setActiveIndex(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, searchable]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(visible.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const pick = visible[activeIndex] ?? visible[0];
      if (pick) choose(pick.value);
    }
  }

  return (
    <div className={`filter-menu${open ? " is-open" : ""}${searchable ? " is-searchable" : ""}`} ref={rootRef}>
      {searchable && open ? (
        <div className="filter-menu-btn" role="combobox" aria-expanded aria-label={label}>
          <input
            ref={inputRef}
            className="filter-menu-search"
            value={query}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onSearchKey}
          />
          <button type="button" className="filter-menu-search-toggle" aria-label={`Close ${label}`} onClick={() => setOpen(false)}>
            <Chevron />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="filter-menu-btn"
          aria-label={label}
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((currentOpen) => !currentOpen)}
          onKeyDown={(event) => {
            if (!searchable || event.key !== "Escape") return;
            setOpen(false);
          }}
        >
          <span className="filter-menu-btn-label">{current}</span>
          <Chevron />
        </button>
      )}
      {open ? (
        <ul className="filter-menu-list" role="listbox" aria-label={label}>
          {visible.length === 0 ? <li className="filter-menu-empty">No matches</li> : null}
          {visible.map((option, index) => (
            <li key={`${option.value}:${option.label}`}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`${option.value === value ? "is-on" : ""}${index === activeIndex && searchable && needle ? " is-active" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(option.value)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
