"use client";

import { DeskShell } from "@/components/desk-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DeskShell>{children}</DeskShell>;
}
