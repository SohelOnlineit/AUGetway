"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function EmailSectionNav() {
  const pathname = usePathname();
  const templates = pathname.startsWith("/admin/settings/email/templates");
  return (
    <div className="tpl-sections">
      <span>Sections</span>
      <div>
        <Link href="/admin/settings/email" className={templates ? "" : "is-on"} aria-current={templates ? undefined : "page"}>
          SMTP
        </Link>
        <Link href="/admin/settings/email/templates" className={templates ? "is-on" : ""} aria-current={templates ? "page" : undefined}>
          Email Template Customize
        </Link>
      </div>
    </div>
  );
}
