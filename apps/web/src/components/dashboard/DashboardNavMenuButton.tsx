"use client";

/** Hamburger for opening account/admin sidebar on small screens. */
export function DashboardNavMenuButton({
  expanded,
  onClick,
  label = "Open menu",
}: {
  expanded: boolean;
  onClick: () => void;
  /** e.g. "Open account menu" / "Open admin menu" */
  label?: string;
}) {
  return (
    <button
      type="button"
      className="dashboard-nav-menu-btn"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={label}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M5 7h14M5 12h14M5 17h14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
        />
      </svg>
      <span className="dashboard-nav-menu-btn-label">Menu</span>
    </button>
  );
}
