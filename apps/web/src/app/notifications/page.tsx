"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicNotification } from "@amarpin/types";
import { AccountShell, AccountState } from "@/components/account/AccountShell";

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<PublicNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/account/notifications");
      if (cancelled) return;
      if (response.status === 401) {
        router.replace("/login?next=/notifications");
        return;
      }
      if (!response.ok) {
        setError("Unable to load notifications");
        setLoading(false);
        return;
      }
      setItems((await response.json()) as PublicNotification[]);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function markRead(id: string) {
    setPending(true);
    const response = await fetch(`/api/account/notifications/${id}/read`, {
      method: "PATCH",
    });
    setPending(false);
    if (!response.ok) {
      setError("Could not mark notification as read");
      return;
    }
    const updated = (await response.json()) as PublicNotification;
    setItems((prev) =>
      (prev ?? []).map((row) => (row.id === updated.id ? updated : row)),
    );
  }

  async function markAll() {
    setPending(true);
    const response = await fetch("/api/account/notifications/read-all", {
      method: "POST",
    });
    setPending(false);
    if (!response.ok) {
      setError("Could not mark all as read");
      return;
    }
    setItems((prev) =>
      (prev ?? []).map((row) => ({
        ...row,
        readAt: row.readAt ?? new Date().toISOString(),
      })),
    );
  }

  return (
    <AccountShell
      title="Notifications"
      lead="In-app alerts with delivery status. Email/push stay skipped until a real provider is configured."
    >
      <AccountState
        loading={loading}
        error={error}
        empty={
          items && items.length === 0
            ? "No notifications yet."
            : null
        }
      >
        {items && items.length > 0 ? (
          <>
            <p className="auth-links">
              <button
                type="button"
                disabled={pending}
                onClick={() => void markAll()}
              >
                Mark all read
              </button>
            </p>
            <div className="order-list">
              {items.map((item) => (
                <article key={item.id} className="order-row">
                  <div>
                    <strong>
                      {item.title}
                      {!item.readAt ? " · unread" : ""}
                    </strong>
                    <p>{item.body}</p>
                    <p className="muted-note">
                      {formatBangladeshDateTime(item.createdAt)}
                      {item.href ? (
                        <>
                          {" · "}
                          <Link href={item.href}>Open</Link>
                        </>
                      ) : null}
                    </p>
                    {item.deliveries?.length ? (
                      <p className="muted-note">
                        Delivery:{" "}
                        {item.deliveries
                          .map(
                            (d) =>
                              `${d.channel}=${d.status}${
                                d.failureReason ? ` (${d.failureReason})` : ""
                              }`,
                          )
                          .join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  {!item.readAt ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void markRead(item.id)}
                    >
                      Mark read
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        ) : null}
      </AccountState>
    </AccountShell>
  );
}
