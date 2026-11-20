import type { ReactNode } from "react";
import { APP_NAME } from "@amarpin/types";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="card auth-card">
        <div className="auth-theme">
          <p className="eyebrow">{APP_NAME}</p>
          <ThemeToggle />
        </div>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}
