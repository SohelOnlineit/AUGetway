import { toRichHtml } from "@/lib/rich-html";

export function RichHtml({
  html,
  className = "rich-html",
}: {
  html: string;
  className?: string;
}) {
  const safe = toRichHtml(html);
  if (!safe) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: safe }} />;
}
