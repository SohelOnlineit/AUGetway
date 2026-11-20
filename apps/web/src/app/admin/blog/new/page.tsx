"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { AdminBlogCategory, AdminBlogPostDetail } from "@amarpin/types";
import { SeoFields } from "@/components/admin/SeoFields";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";
import { plainText } from "@/lib/rich-html";

export default function AdminNewBlogPostPage() {
  const router = useRouter();
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [categories, setCategories] = useState<AdminBlogCategory[]>([]);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [seoImageUrl, setSeoImageUrl] = useState("");
  const [noindex, setNoindex] = useState(false);
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">("DRAFT");
  const [coverImagePath, setCoverImagePath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (loading || sessionError) return;
    void adminFetch<AdminBlogCategory[]>("/blog/categories").then((result) => {
      if (result.ok) setCategories(result.data);
    });
  }, [loading, sessionError]);

  async function onUpload(file: File) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
    const dataBase64 = btoa(binary);
    const result = await adminFetch<{ path: string }>("/uploads/images", {
      method: "POST",
      body: JSON.stringify({
      dataBase64,
      contentType: file.name.toLowerCase().endsWith(".svg") ? "image/svg+xml" : file.type || "image/png",
    }),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCoverImagePath(result.data.path);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!plainText(body)) {
      setError("Write the post body.");
      return;
    }
    setPending(true);
    const result = await adminFetch<AdminBlogPostDetail>("/blog/posts", {
      method: "POST",
      body: JSON.stringify({
        title,
        slug: slug || undefined,
        excerpt: excerpt || null,
        body,
        categoryId: categoryId || null,
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null,
        seoImageUrl: seoImageUrl || null,
        noindex,
        status,
        coverImagePath: coverImagePath || null,
      }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push(`/admin/blog/${result.data.id}`);
  }

  if (!can(permissions, "admin:content:write") && !loading) {
    return (
      <AdminShell title="New post" permissions={permissions}>
        <p className="form-error">Missing admin:content:write</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="New blog post" permissions={permissions}>
      {sessionError || error ? (
        <p className="form-error">{sessionError || error}</p>
      ) : null}
      <form className="account-stack" onSubmit={(e) => void save(e)}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Slug (optional)
          <input value={slug} onChange={(e) => setSlug(e.target.value)} />
        </label>
        <label>
          Excerpt
          <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} />
        </label>
        <div>
          <p className="product-editor-kicker">Body</p>
          <RichTextEditor
            value={body}
            onChange={setBody}
            unlimited
            minHeight="8rem"
            placeholder="Write the post…"
          />
        </div>
        <label>
          Category
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">None</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cover image
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/tiff,image/svg+xml"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onUpload(file);
            }}
          />
        </label>
        {coverImagePath ? <p className="lead">{coverImagePath}</p> : null}
        <SeoFields
          title={seoTitle}
          description={seoDescription}
          imageUrl={seoImageUrl}
          noindex={noindex}
          onChange={(next) => {
            setSeoTitle(next.title);
            setSeoDescription(next.description);
            setSeoImageUrl(next.imageUrl);
            setNoindex(next.noindex);
          }}
        />
        <label>
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "DRAFT" | "PUBLISHED")}
          >
            <option value="DRAFT">DRAFT</option>
            <option value="PUBLISHED">PUBLISHED</option>
          </select>
        </label>
        <button className="primary-btn" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Create"}
        </button>
      </form>
    </AdminShell>
  );
}
