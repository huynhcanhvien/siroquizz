"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
export const adminRoutes = ["overview", "moderation", "users", "ai", "sets", "audit"] as const;
export function AdminNav() {
  const t = useTranslations("admin");
  const pathname = usePathname();
  return (
    <nav aria-label={t("navigation")} className="flex flex-wrap gap-2 border-b border-border pb-4">
      {adminRoutes.map((route) => {
        const href = route === "overview" ? "/admin" : `/admin/${route}`;
        const active =
          route === "overview"
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={route}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${active ? "bg-primary-soft text-primary-text" : "text-muted hover:bg-surface-2"}`}
          >
            {t(route)}
          </Link>
        );
      })}
    </nav>
  );
}
