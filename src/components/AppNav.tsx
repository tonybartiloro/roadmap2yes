"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, Home, Menu, Scale, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The five sections (design §2). Future areas (R2-R6) grow under "Altro" and "Scelte". */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/percorso", label: "Percorso", icon: CalendarCheck },
  { href: "/scelte", label: "Scelte", icon: Scale },
  { href: "/budget", label: "Budget", icon: Wallet },
  { href: "/altro", label: "Altro", icon: Menu },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * One `<nav>`: fixed bottom bar under 768 px, left rail from 768 px (icons + labels from 1024 px).
 * Targets are at least 44 px; text and icon together, active state not only by colour (bold + bar).
 */
export function AppNav({ items = NAV_ITEMS }: { items?: readonly NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Principale"
      className="border-border bg-card fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:inset-y-0 md:right-auto md:w-20 md:border-t-0 md:border-r md:pb-0 lg:w-56"
    >
      <ul className="flex md:flex-col md:gap-1 md:p-2 md:pt-6 lg:p-4 lg:pt-6">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-muted-foreground relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs md:min-h-14 md:rounded-md lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-base",
                  active && "text-primary font-semibold",
                  !active && "hover:text-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "bg-primary absolute top-0 h-0.5 w-8 rounded-full md:top-3 md:left-0 md:h-8 md:w-0.5 lg:h-6",
                    !active && "hidden",
                  )}
                />
                <Icon aria-hidden className="size-6 shrink-0" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
