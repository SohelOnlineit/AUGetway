"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import {
  ROLE_PROFILES,
  ROLE_STORAGE_KEY,
  countEnabled,
  groupsForRole,
  type RoleId,
  type RolePermissionKey,
  type RoleProfile,
} from "@/lib/admin/role-catalog";

type Matrix = Record<RolePermissionKey, boolean>;
type Store = Partial<Record<RoleId, Matrix>>;

function cloneDefaults(): Record<RoleId, Matrix> {
  return Object.fromEntries(
    ROLE_PROFILES.map((role) => [role.id, { ...role.permissions }]),
  ) as Record<RoleId, Matrix>;
}

function sameMatrix(left: Matrix, right: Matrix) {
  return (Object.keys(left) as RolePermissionKey[]).every((key) => left[key] === right[key]);
}

export default function AdminRolesPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const defaults = useMemo(() => cloneDefaults(), []);
  const [saved, setSaved] = useState<Record<RoleId, Matrix>>(defaults);
  const [draft, setDraft] = useState<Record<RoleId, Matrix>>(defaults);
  const [selectedId, setSelectedId] = useState<RoleId>("shop_manager");
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const stored = window.localStorage.getItem(ROLE_STORAGE_KEY);
      const local = stored ? (JSON.parse(stored) as Store) : {};
      let server: Store | null = null;
      try {
        const response = await fetch("/api/admin/role-profiles", { cache: "no-store" });
        if (response.ok) {
          const payload = (await response.json()) as { overrides?: Store };
          server = payload.overrides ?? {};
        }
      } catch {
        server = null;
      }
      if (cancelled) return;
      const source = server ?? local;
      const next = cloneDefaults();
      for (const role of ROLE_PROFILES) {
        if (source[role.id]) next[role.id] = { ...role.permissions, ...source[role.id] };
      }
      setSaved(next);
      setDraft(next);
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = ROLE_PROFILES.find((role) => role.id === selectedId) ?? ROLE_PROFILES[0]!;
  const current = draft[selected.id];
  const dirty = ready && !sameMatrix(current, saved[selected.id]);
  const customized = ROLE_PROFILES.filter((role) => !sameMatrix(saved[role.id], defaults[role.id])).length;
  const adminAccess = ROLE_PROFILES.filter((role) => saved[role.id].admin_panel_access).length;
  const enabled = countEnabled(current);

  async function persist(nextSaved: Record<RoleId, Matrix>) {
    const overrides: Store = {};
    for (const role of ROLE_PROFILES) {
      if (!sameMatrix(nextSaved[role.id], defaults[role.id])) overrides[role.id] = nextSaved[role.id];
    }
    const response = await fetch("/api/admin/role-profiles", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ overrides }),
    });
    if (!response.ok) return false;
    if (Object.keys(overrides).length === 0) window.localStorage.removeItem(ROLE_STORAGE_KEY);
    else window.localStorage.setItem(ROLE_STORAGE_KEY, JSON.stringify(overrides));
    setSaved(nextSaved);
    setDraft(nextSaved);
    return true;
  }

  function toggle(key: RolePermissionKey) {
    if (selected.locked && key !== "manage_coupon_codes" && key !== "manage_points") return;
    setDraft((prev) => ({
      ...prev,
      [selected.id]: { ...prev[selected.id], [key]: !prev[selected.id][key] },
    }));
    setNotice(null);
  }

  async function saveRole() {
    const ok = await persist({ ...saved, [selected.id]: current });
    setNotice(ok ? `${selected.label} saved.` : `${selected.label} was not saved. Try again.`);
  }

  async function resetRole() {
    const next = { ...saved, [selected.id]: { ...defaults[selected.id] } };
    const ok = await persist(next);
    setNotice(
      ok
        ? `${selected.label} restored to the AuGetway default.`
        : `${selected.label} was not restored. Try again.`,
    );
  }

  async function resetAll() {
    const ok = await persist(cloneDefaults());
    setNotice(ok ? "All roles restored to the AuGetway defaults." : "Roles were not restored. Try again.");
  }

  return (
    <AdminShell
      title="Roles & permissions"
      lead="Shop role profiles. Administrator stays locked."
      permissions={permissions}
    >
      {sessionError ? <p className="form-error">{sessionError}</p> : null}
      {loading || !ready ? <p className="muted-note">Loading role profiles…</p> : null}
      {notice ? <p className="form-success">{notice}</p> : null}

      <div className="roles-workspace">
        <aside className="roles-list">
          <header>
            <strong>Roles</strong>
            <p>{ROLE_PROFILES.length} role profiles</p>
          </header>
          <p className="roles-kicker">Profiles</p>
          <nav aria-label="Role profiles">
            {ROLE_PROFILES.map((role) => (
              <button
                key={role.id}
                type="button"
                className={role.id === selected.id ? "is-active" : ""}
                aria-pressed={role.id === selected.id}
                onClick={() => setSelectedId(role.id)}
              >
                <span>{role.label}</span>
                {role.locked ? <span aria-label="Locked">🔒</span> : null}
                {!role.locked && customizedRole(saved[role.id], defaults[role.id]) ? <em>edited</em> : null}
              </button>
            ))}
          </nav>
        </aside>

        <div className="roles-detail">
          <RoleCard role={selected} dirty={dirty} onSave={saveRole} onReset={resetRole} onResetAll={resetAll} />
          <section className="roles-overview">
            <header>
              <strong>Roles overview</strong>
              <p>{ROLE_PROFILES.length} profiles · {adminAccess} with admin access</p>
            </header>
            <div className="roles-stats">
              <Stat label="Roles" value={String(ROLE_PROFILES.length)} meta="Role profiles" />
              <Stat label="Customized" value={String(customized)} meta="Changed from defaults" />
              <Stat label="Admin access" value={String(adminAccess)} meta="Roles with panel access" />
              <Stat label="Enabled" value={String(enabled)} meta={`Permissions for ${selected.label}`} />
            </div>
            <p className="roles-meta">
              <span>Selected {selected.label}</span>
              <span>Status {selected.locked ? "Locked" : customizedRole(saved[selected.id], defaults[selected.id]) ? "Customized" : "Default"}</span>
              <span>Unsaved {dirty ? "Yes" : "No"}</span>
            </p>
          </section>
          <section className="roles-card">
            <header>
              <strong>Role summary</strong>
              <p>Capabilities included in this profile</p>
            </header>
            <p className="roles-kicker">Includes</p>
            <ul>
              {selected.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
          {groupsForRole(selected.id).map((group) => (
            <section key={group.key} className="roles-card">
              <header>
                <strong>{group.label}</strong>
                <p>{group.hint}</p>
              </header>
              <p className="roles-kicker">Permissions</p>
              <div className="roles-perm-grid">
                {group.permissions.map((perm) => {
                  const on = current[perm.key];
                  return (
                    <button
                      key={perm.key}
                      type="button"
                      className={on ? "is-on" : ""}
                      aria-pressed={on}
                      disabled={selected.locked && perm.key !== "manage_coupon_codes" && perm.key !== "manage_points"}
                      onClick={() => toggle(perm.key)}
                    >
                      <span>{on ? "✓" : ""}</span>
                      {perm.label}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}

function customizedRole(saved: Matrix, fallback: Matrix) {
  return !sameMatrix(saved, fallback);
}

function Stat({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <article>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{meta}</span>
    </article>
  );
}

function RoleCard({
  role,
  dirty,
  onSave,
  onReset,
  onResetAll,
}: {
  role: RoleProfile;
  dirty: boolean;
  onSave: () => void;
  onReset: () => void;
  onResetAll: () => void;
}) {
  return (
    <section className="roles-card">
      <header>
        <strong>{role.label}</strong>
        <p>{role.description}</p>
      </header>
      <p className="roles-kicker">Actions</p>
      <div className="roles-actions">
        <button type="button" className="primary-btn" disabled={!dirty} onClick={onSave}>
          Save role
        </button>
        <button type="button" disabled={role.locked} onClick={onReset}>
          Reset role
        </button>
        <button type="button" onClick={onResetAll}>
          Reset all
        </button>
      </div>
    </section>
  );
}
