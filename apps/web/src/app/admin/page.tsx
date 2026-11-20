import Link from "next/link";
import { cookies } from "next/headers";
import type { AdminDashboardDelivery, AdminDashboardSummary, Permission } from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { apiFetchWithAccessToken } from "@/lib/auth/api-client";
import { ACCESS_COOKIE } from "@/lib/auth/constants";

export default async function AdminHomePage() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const [meResponse, dashResponse] = await Promise.all([
    apiFetchWithAccessToken("/admin/me", token),
    apiFetchWithAccessToken("/admin/dashboard", token),
  ]);
  const permissions = meResponse.ok
    ? ((await meResponse.json()) as { permissions?: Permission[] }).permissions
    : undefined;

  if (!dashResponse.ok) {
    const payload = (await dashResponse.json().catch(() => ({}))) as { message?: string };
    return (
      <AdminShell
        title="Admin overview"
        lead="Catalog, sales, inventory, and audit controls. Permission checks are enforced by the API."
        permissions={permissions}
      >
        <p className="form-error">{payload.message || "Unable to load admin overview"}</p>
      </AdminShell>
    );
  }

  const summary = (await dashResponse.json()) as AdminDashboardSummary;
  const canReadOrders = permissions?.includes("admin:orders:read") === true;
  let deliveries: AdminDashboardDelivery[] = [];
  if (canReadOrders) {
    const cards = await apiFetchWithAccessToken("/admin/dashboard/deliveries", token);
    if (cards.ok) {
      deliveries = ((await cards.json()) as { items?: AdminDashboardDelivery[] }).items ?? [];
    }
  }

  return (
    <AdminShell
      title="Admin overview"
      lead="Catalog, sales, inventory, and audit controls. Permission checks are enforced by the API."
      permissions={permissions}
    >
      <div className="admin-stat-grid">
        <Stat label="Products" value={`${summary.productsActive}/${summary.productsTotal} active`} href="/admin/products" />
        <Stat label="Pending payment" value={String(summary.ordersPendingPayment)} href="/admin/orders" />
        <Stat label="Paid / fulfilled" value={`${summary.ordersPaid} / ${summary.ordersFulfilled}`} href="/admin/orders" />
        <Stat label="Customers" value={String(summary.customersTotal)} href="/admin/customers" />
        <Stat label="Stock available" value={String(summary.inventoryAvailable)} href="/admin/inventory" />
        <Stat label="Reserved units" value={String(summary.inventoryReserved)} href="/admin/inventory" />
        <Stat label="Audit (7d)" value={String(summary.recentAuditCount)} href="/admin/audit" />
        <Stat label="Open tickets" value={String(summary.openTickets)} href="/admin/tickets" />
        <Stat
          label="Page views (7d)"
          value={String(summary.analyticsLast7d.totals.page_view)}
          href="/admin/analytics"
        />
      </div>
      {canReadOrders && deliveries.length ? (
        <section className="admin-delivery-board">
          <h2>Delivered cards</h2>
          <div className="admin-delivery-list">
            {deliveries.map((card) => (
              <Link key={`${card.orderId}-${card.deliveredAt}-${card.title}`} href={`/admin/orders/${card.orderId}`} className="admin-delivery-card">
                <strong>{card.title}</strong>
                <p>Region: <b>{card.region || "—"}</b></p>
                <p>Redeem Code: <b>{card.code}</b></p>
                <small>Order #{card.orderNumber}</small>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </AdminShell>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link href={href} className="account-stat">
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
    </Link>
  );
}
