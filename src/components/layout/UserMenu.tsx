"use client";

import { LogOut, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/misc";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/Menu";
import { useLogout } from "@/features/auth/hooks";
import type { User } from "@/lib/types";

export function UserMenu({ user }: { user: User }) {
  const t = useTranslations("nav");
  const tCommunity = useTranslations("admin");
  const logout = useLogout();

  const handleLogout = () => logout.mutate();

  return (
    <Menu>
      <MenuTrigger
        className="cursor-pointer rounded-full transition-transform hover:scale-105 active:scale-95"
        aria-label={`${t("account")}: ${user.displayName}`}
      >
        <Avatar name={user.displayName} color={user.avatarColor} size="sm" />
      </MenuTrigger>
      <MenuContent className="min-w-60">
        <MenuLabel className="flex items-center gap-3 py-2 normal-case">
          <Avatar name={user.displayName} color={user.avatarColor} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-text">{user.displayName}</span>
            <span className="block truncate text-xs font-medium text-muted">{user.email}</span>
          </span>
        </MenuLabel>
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden />
            {t("settings")}
          </Link>
        </MenuItem>
        {user.role === "admin" ? (
          <MenuItem asChild>
            <Link href="/admin">
              <ShieldCheck aria-hidden />
              {tCommunity("title")}
            </Link>
          </MenuItem>
        ) : null}
        <MenuItem onSelect={handleLogout}>
          <LogOut aria-hidden />
          {t("logout")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
