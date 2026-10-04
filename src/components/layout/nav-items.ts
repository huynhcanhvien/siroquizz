import {
  House,
  Library,
  Settings,
  CalendarCheck,
  ChartNoAxesCombined,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  labelKey: "home" | "library" | "settings" | "review" | "stats";
  icon: LucideIcon;
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/home", labelKey: "home", icon: House },
  { href: "/library", labelKey: "library", icon: Library },
  { href: "/review", labelKey: "review", icon: CalendarCheck },
  { href: "/stats", labelKey: "stats", icon: ChartNoAxesCombined },
];

export const SECONDARY_NAV: readonly NavItem[] = [
  { href: "/settings", labelKey: "settings", icon: Settings },
];

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
