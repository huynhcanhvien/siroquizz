"use client";

import { Plus, WandSparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { isActivePath, PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "./nav-items";

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 font-semibold transition-colors",
        active ? "bg-primary-soft text-primary-text" : "text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      <Icon className={cn("size-5 transition-transform group-hover:scale-110", active && "text-primary")} aria-hidden />
      {t(item.labelKey)}
    </Link>
  );
}

/** Navigation shared by the desktop sidebar and the mobile drawer. */
export function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const tHome = useTranslations("home");

  return (
    <nav aria-label={t("mainNav")} className="flex h-full flex-col gap-1">
      {PRIMARY_NAV.map((item) => (
        <NavLink key={item.href} item={item} onNavigate={onNavigate} />
      ))}

      <div className="my-4 h-px bg-border" />

      <Link
        href="/sets/new"
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-text"
      >
        <Plus className="size-5" aria-hidden />
        {t("createSet")}
      </Link>

      <Link
        href="/sets/new/ai"
        onClick={onNavigate}
        className="group relative mt-2 overflow-hidden rounded-xl border border-accent/60 bg-accent-soft p-4 transition-transform hover:-translate-y-0.5"
      >
        <span className="absolute -top-6 -right-6 size-20 rounded-full bg-accent/50 blur-xl transition-transform group-hover:scale-125" />
        <WandSparkles className="relative size-5 text-accent-strong" aria-hidden />
        <span className="relative mt-2 block font-bold text-text">{tHome("quickAiTitle")}</span>
        <span className="relative mt-0.5 block text-sm text-muted">{tHome("quickAiBody")}</span>
      </Link>

      <div className="mt-auto pt-6">
        {SECONDARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}
