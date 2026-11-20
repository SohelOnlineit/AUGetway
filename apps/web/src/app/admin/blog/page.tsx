"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type {
  AdminBlogCategory,
  AdminBlogPostListItem,
  AdminPage,
  BlogPostStatusPublic,
} from "@amarpin/types";
import { SeoFields } from "@/components/admin/SeoFields";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";

export default function AdminBlogPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [posts, setPosts] = useState<AdminBlogPostListItem[]>([]);
  const [categories, setCategories] = useState<AdminBlogCategory[]>([]);
  const [status, setStatus] = useState<"" | BlogPostStatusPublic>("");
  const [catName, setCatName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (status) params.set("status", status);
      const [postsRes, catsRes] = await Promise.all([
        adminFetch<AdminPage<AdminBlogPostListItem>>(`/blog/posts?${params}`),
        adminFetch<AdminBlogCategory[]>("/blog/categories"),
      ]);
      if (cancelled) return;
      if (!postsRes.ok) {
        setError(postsRes.message);
        return;
      }
      if (!catsRes.ok) {
        setError(catsRes.message);
        return;
      }
      setPosts(postsRes.data.items);
      setCategories(catsRes.data);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, reload, sessionError, status]);

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    const result = await adminFetch<AdminBlogCategory>("/blog/categories", {
      method: "POST",
      body: JSON.stringify({ name: catName, isActive: true }),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCatName("");
    setReload((v) => v + 1);
  }

  async function saveCategory(cat: AdminBlogCategory) {
    const result = await adminFetch<AdminBlogCategory>(`/blog/categories/${cat.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        sortOrder: cat.sortOrder,
        isActive: cat.isActive,
        seoTitle: cat.seoTitle,
        seoDescription: cat.seoDescription,
        seoImageUrl: cat.seoImageUrl,
        noindex: cat.noindex,
      }),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setCategories((current) => current.map((item) => (item.id === cat.id ? result.data : item)));
  }

  return (
    <AdminShell
      title="Blog"
      lead="Categories and posts with draft/publish workflow. Public site shows PUBLISHED only."
      permissions={permissions}
    >
      {sessionError || error ? (
        <p className="form-error">{sessionError || error}</p>
      ) : null}

      {can(permissions, "admin:content:write") ? (
        <form className="admin-toolbar" onSubmit={(e) => void createCategory(e)}>
          <input
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            placeholder="New blog category"
            required
          />
          <button className="primary-btn" type="submit">
            Add category
          </button>
          <Link className="primary-btn" href="/admin/blog/new">
            New post
          </Link>
        </form>
      ) : null}

      <div className="order-list" style={{ marginBottom: "1.5rem" }}>
        {categories.map((cat) => (
          <form
            key={cat.id}
            className="order-row account-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void saveCategory(cat);
            }}
          >
            <div>
              <strong>{cat.name}</strong>
              <p>
                {cat.slug} · {cat.isActive ? "active" : "inactive"} · {cat.postCount} posts
              </p>
            </div>
            <SeoFields
              title={cat.seoTitle ?? ""}
              description={cat.seoDescription ?? ""}
              imageUrl={cat.seoImageUrl ?? ""}
              noindex={cat.noindex}
              disabled={!can(permissions, "admin:content:write")}
              onChange={(next) =>
                setCategories((current) =>
                  current.map((item) =>
                    item.id === cat.id
                      ? {
                          ...item,
                          seoTitle: next.title || null,
                          seoDescription: next.description || null,
                          seoImageUrl: next.imageUrl || null,
                          noindex: next.noindex,
                        }
                      : item,
                  ),
                )
              }
            />
            {can(permissions, "admin:content:write") ? (
              <button className="primary-btn" type="submit">
                Save category SEO
              </button>
            ) : null}
          </form>
        ))}
      </div>

      <div className="admin-toolbar">
        <FilterMenu
          label="Post status"
          value={status}
          onChange={(value) => setStatus(value as "" | BlogPostStatusPublic)}
          options={[
            { value: "", label: "All statuses" },
            { value: "DRAFT", label: "DRAFT" },
            { value: "PUBLISHED", label: "PUBLISHED" },
            { value: "ARCHIVED", label: "ARCHIVED" },
          ]}
        />
      </div>

      <div className="order-list">
        {posts.map((post) => (
          <Link key={post.id} href={`/admin/blog/${post.id}`} className="order-row">
            <div>
              <strong>{post.title}</strong>
              <p>
                {post.status} · {post.slug}
                {post.category ? ` · ${post.category.name}` : ""}
              </p>
            </div>
            <span>{formatBangladeshDateTime(post.updatedAt)}</span>
          </Link>
        ))}
        {posts.length === 0 && !loading ? (
          <p className="empty-state">No posts yet.</p>
        ) : null}
      </div>
    </AdminShell>
  );
}
