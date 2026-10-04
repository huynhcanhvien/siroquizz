"use client";

import { Menu as MenuIcon, Plus, Search, WandSparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog as RadixDialog } from "radix-ui";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/Menu";
import { Logo } from "@/components/ui/misc";
import type { User } from "@/lib/types";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { SideNav } from "./SideNav";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

function HeaderSearch() {
  const t = useTranslations("library");
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  // The library page has its own live search box.
  if (pathname === "/library") return <div className="hidden flex-1 md:block" />;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams(query.trim() ? { q: query.trim() } : {});
    router.push(`/library${params.size ? `?${params}` : ""}`);
  };

  return (
    <form role="search" onSubmit={handleSubmit} className="relative hidden w-full max-w-md md:block">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label={t("searchLabel")}
        placeholder={t("searchPlaceholder")}
        className="h-10 w-full rounded-full border border-transparent bg-surface-2 pr-4 pl-10 text-sm transition-colors placeholder:text-subtle hover:border-border focus:border-primary focus:bg-surface focus:outline-none"
      />
    </form>
  );
}

function MobileDrawer() {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Trigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("openMenu")}>
          <MenuIcon className="size-5" aria-hidden />
        </Button>
      </RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-overlay lg:hidden" />
        <RadixDialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col border-r border-border bg-surface p-4 shadow-lg data-[state=open]:animate-[rise_240ms_ease-out] lg:hidden">
          <div className="mb-6 flex items-center justify-between">
            <Logo />
            <RadixDialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label={tCommon("close")}>
                <X className="size-4" aria-hidden />
              </Button>
            </RadixDialog.Close>
          </div>
          <RadixDialog.Title className="sr-only">{t("mainNav")}</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">{t("mainNav")}</RadixDialog.Description>
          <SideNav onNavigate={() => setOpen(false)} />
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function CreateMenu() {
  const t = useTranslations("nav");
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button size="sm" aria-label={t("create")}>
          <Plus className="size-4" aria-hidden />
          <span className="hidden sm:inline">{t("create")}</span>
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem asChild>
          <Link href="/sets/new">
            <Plus aria-hidden />
            {t("createSet")}
          </Link>
        </MenuItem>
        <MenuItem asChild>
          <Link href="/sets/new/ai">
            <WandSparkles aria-hidden />
            {t("createWithAi")}
          </Link>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function AppHeader({ user }: { user: User }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-2 px-4 sm:gap-3 lg:px-6">
        <MobileDrawer />
        <Link href="/home" className="mr-2 shrink-0 rounded-md" aria-label="SiroQuizz">
          <Logo className="hidden sm:inline-flex" />
          <Logo className="sm:hidden" withWordmark={false} />
        </Link>
        <HeaderSearch />
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <CreateMenu />
          <LanguageSwitcher compact />
          <ThemeToggle />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
