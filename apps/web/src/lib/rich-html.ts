const ALLOWED = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "img",
  "hr",
  "pre",
  "span",
  "div",
]);

const VOID_TAGS = new Set(["br", "hr", "img"]);

function escapeText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeUrl(value: string) {
  const url = value.trim().replace(/^["']|["']$/g, "");
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) return url;
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url;
  return "";
}

function safeColor(value: string) {
  const color = value.trim();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return color;
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(color)) return color;
  return "";
}

function sanitizeAttrs(tag: string, raw: string) {
  const attrs: string[] = [];
  const href = raw.match(/\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const src = raw.match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const alt = raw.match(/\salt\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const style = raw.match(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i);
  if (tag === "a") {
    const url = safeUrl(href?.[2] || href?.[3] || href?.[4] || "");
    if (url) attrs.push(`href="${escapeText(url)}" rel="noopener noreferrer"`);
  }
  if (tag === "img") {
    const url = safeUrl(src?.[2] || src?.[3] || src?.[4] || "");
    if (!url) return "";
    attrs.push(`src="${escapeText(url)}"`);
    attrs.push(`alt="${escapeText(alt?.[2] || alt?.[3] || alt?.[4] || "")}"`);
  }
  if (tag === "span" && style) {
    const color = safeColor((style[2] || "").match(/color\s*:\s*([^;]+)/i)?.[1] || "");
    if (color) attrs.push(`style="color: ${color}"`);
  }
  return attrs.length ? ` ${attrs.join(" ")}` : "";
}

export function sanitizeRichHtml(input: string) {
  const stripped = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?\s*>/gi, "");
  // Quoted attribute values may contain ">", so the tag pattern walks quotes explicitly.
  const tagPattern = /<\/?\s*([a-z0-9]+)((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
  let out = "";
  let last = 0;
  for (const match of stripped.matchAll(tagPattern)) {
    const full = match[0];
    const tag = match[1] ?? "";
    const attrs = match[2] ?? "";
    const start = match.index ?? 0;
    out += escapeStray(stripped.slice(last, start));
    last = start + full.length;
    const name = tag.toLowerCase();
    if (!ALLOWED.has(name)) continue;
    if (full.startsWith("</")) {
      if (!VOID_TAGS.has(name)) out += `</${name}>`;
      continue;
    }
    const safe = sanitizeAttrs(name, attrs);
    if (name === "img" && !safe.includes("src=")) continue;
    out += `<${name}${safe}>`;
  }
  return out + escapeStray(stripped.slice(last));
}

/** Text between tags: a leftover "<" is never markup, so it cannot start a tag in the browser. */
function escapeStray(text: string) {
  return text.replace(/</g, "&lt;");
}

export function plainText(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function visibleText(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Imported descriptions often wrap every paragraph in a heading. Keep short titles, turn long ones into paragraphs. */
function normalizeHeadings(html: string) {
  return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/gi, (full, _level: string, inner: string) => {
    const text = visibleText(inner);
    if (!text) return "";
    if (text.length > 80) return `<p>${inner}</p>`;
    return full;
  });
}

export function toRichHtml(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/<[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed
      .split(/\n{2,}/)
      .map((block) => `<p>${escapeText(block).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }
  return normalizeHeadings(sanitizeRichHtml(trimmed));
}
