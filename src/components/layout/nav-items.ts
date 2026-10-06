import {
  Compass,
  School,
  FolderOpen,
  House,
  Library,
  Settings,
  CalendarCheck,
  ChartNoAxesCombined,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  labelKey:
    "home" | "library" | "settings" | "review" | "stats" | "explore" | "folders" | "classes";
  icon: LucideIcon;
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/home", labelKey: "home", icon: House },
  { href: "/library", labelKey: "library", icon: Library },
  { href: "/review", labelKey: "review", icon: CalendarCheck },
  { href: "/stats", labelKey: "stats", icon: ChartNoAxesCombined },
  // Community pages need the server backend.
  ...(process.env.NEXT_PUBLIC_DATA_SOURCE === "http"
    ? [
        { href: "/folders", labelKey: "folders", icon: FolderOpen } as const,
        { href: "/classes", labelKey: "classes", icon: School } as const,
        { href: "/explore", labelKey: "explore", icon: Compass } as const,
      ]
    : []),
];

export const SECONDARY_NAV: readonly NavItem[] = [
  { href: "/settings", labelKey: "settings", icon: Settings },
];

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
