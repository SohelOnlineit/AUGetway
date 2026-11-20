"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type {
  AdminBlogCategory,
  AdminBlogPostDetail,
  BlogPostStatusPublic,
} from "@amarpin/types";
import { SeoFields } from "@/components/admin/SeoFields";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";

export default function AdminBlogPostEditPage() {
  const params = useParams<{ id: string }>();
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [post, setPost] = useState<AdminBlogPostDetail | null>(null);
  const [categories, setCategories] = useState<AdminBlogCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (loading || sessionError || !params.id) return;
    let cancelled = false;
    async function load() {
      const [postRes, catsRes] = await Promise.all([
        adminFetch<AdminBlogPostDetail>(`/blog/posts/${params.id}`),
        adminFetch<AdminBlogCategory[]>("/blog/categories"),
      ]);
      if (cancelled) return;
      if (!postRes.ok) {
        setError(postRes.message);
        return;
      }
      if (catsRes.ok) setCategories(catsRes.data);
      setPost(postRes.data);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, params.id, sessionError]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!post) return;
    setPending(true);
    setSaved(false);
    const result = await adminFetch<AdminBlogPostDetail>(`/blog/posts/${post.id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        body: post.body,
        categoryId: post.category?.id ?? null,
        seoTitle: post.seoTitle,
        seoDescription: post.seoDescription,
        seoImageUrl: post.seoImageUrl,
        noindex: post.noindex,
        status: post.status,
        coverImagePath: post.coverImagePath,
      }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPost(result.data);
    setSaved(true);
  }

  async function setStatus(status: BlogPostStatusPublic) {
    if (!post) return;
    const result = await adminFetch<AdminBlogPostDetail>(
      `/blog/posts/${post.id}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status }),
      },
    );
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPost(result.data);
  }

  const canWrite = can(permissions, "admin:content:write");

  return (
    <AdminShell title="Edit post" permissions={permissions}>
      {sessionError || error ? (
        <p className="form-error">{sessionError || error}</p>
      ) : null}
      {!post ? <p>Loading…</p> : null}
      {post ? (
        <form className="account-stack" onSubmit={(e) => void save(e)}>
          <p className="lead">
            Status: {post.status}
            {post.publishedAt ? ` · published ${formatBangladeshDateTime(post.publishedAt)}` : ""}
          </p>
          {canWrite ? (
            <div className="admin-toolbar">
              <button type="button" onClick={() => void setStatus("DRAFT")}>
                Set draft
              </button>
              <button type="button" onClick={() => void setStatus("PUBLISHED")}>
                Publish
              </button>
              <button type="button" onClick={() => void setStatus("ARCHIVED")}>
                Archive
              </button>
            </div>
          ) : null}
          <label>
            Title
            <input
              value={post.title}
              disabled={!canWrite}
              onChange={(e) => setPost({ ...post, title: e.target.value })}
              required
            />
          </label>
          <label>
            Slug
            <input
              value={post.slug}
              disabled={!canWrite}
              onChange={(e) => setPost({ ...post, slug: e.target.value })}
              required
            />
          </label>
          <label>
            Excerpt
            <textarea
              value={post.excerpt ?? ""}
              disabled={!canWrite}
              onChange={(e) => setPost({ ...post, excerpt: e.target.value })}
              rows={2}
            />
          </label>
          <div>
            <p className="product-editor-kicker">Body</p>
            <RichTextEditor
              value={post.body}
              onChange={(body) => setPost({ ...post, body })}
              unlimited
              minHeight="8rem"
              placeholder="Write the post…"
            />
          </div>
          <label>
            Category
            <select
              value={post.category?.id ?? ""}
              disabled={!canWrite}
              onChange={(e) => {
                const cat = categories.find((c) => c.id === e.target.value);
                setPost({
                  ...post,
                  category: cat
                    ? { id: cat.id, name: cat.name, slug: cat.slug }
                    : null,
                });
              }}
            >
              <option value="">None</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cover path
            <input
              value={post.coverImagePath ?? ""}
              disabled={!canWrite}
              onChange={(e) =>
                setPost({ ...post, coverImagePath: e.target.value || null })
              }
            />
          </label>
          <SeoFields
            title={post.seoTitle ?? ""}
            description={post.seoDescription ?? ""}
            imageUrl={post.seoImageUrl ?? ""}
            noindex={post.noindex}
            disabled={!canWrite}
            onChange={(next) =>
              setPost({
                ...post,
                seoTitle: next.title || null,
                seoDescription: next.description || null,
                seoImageUrl: next.imageUrl || null,
                noindex: next.noindex,
              })
            }
          />
          {canWrite ? (
            <button className="primary-btn" type="submit" disabled={pending}>
              {pending ? "Saving…" : saved ? "Saved" : "Save"}
            </button>
          ) : null}
        </form>
      ) : null}
    </AdminShell>
  );
}
