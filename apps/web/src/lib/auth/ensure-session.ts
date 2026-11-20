/**
 * Deduped session ensure for client components.
 * Avoids concurrent /api/auth/refresh calls (React Strict Mode double-mount)
 * which trigger refresh-token reuse detection and force logout.
 */

let inFlight: Promise<boolean> | null = null;

async function refreshOnce(): Promise<boolean> {
  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
  });
  return response.ok;
}

/** Probe access cookie via admin me; refresh only when needed. */
export async function ensureAdminSession(): Promise<boolean> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const me = await fetch("/api/auth/admin-me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (me.ok) return true;
      if (me.status !== 401) return false;
      return refreshOnce();
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export async function ensureSession(): Promise<boolean> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      return refreshOnce();
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
