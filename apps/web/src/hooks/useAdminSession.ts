"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Permission } from "@amarpin/types";
import { adminFetch } from "@/lib/admin/api";
import { ensureAdminSession } from "@/lib/auth/ensure-session";

export type AdminSessionValue = {
  permissions: Permission[] | undefined;
  error: string | null;
  loading: boolean;
  router: ReturnType<typeof useRouter>;
};

export const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export function useAdminSession() {
  const shared = useContext(AdminSessionContext);
  const local = useFetchedAdminSession(shared == null);
  return shared ?? local;
}

export function useFetchedAdminSession(
  enabled = true,
  initial?: Permission[],
): AdminSessionValue {
  const router = useRouter();
  const [permissions, setPermissions] = useState<Permission[] | undefined>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled && initial == null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function load() {
      const ok = await ensureAdminSession();
      if (!ok) {
        router.replace("/login?next=/admin");
        return;
      }
      const me = await adminFetch<{ permissions: Permission[] }>("/me");
      if (cancelled) return;
      if (!me.ok) {
        if (initial == null) {
          setError(me.message);
          setLoading(false);
        }
        return;
      }
      setPermissions(me.data.permissions);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled, router]);

  return { permissions, error, loading, router };
}
