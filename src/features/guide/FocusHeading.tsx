"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Shell = { hasNavigated: (currentPath: string) => boolean };

const GuideShellContext = createContext<Shell | null>(null);

/**
 * Wraps every page of the Guide (`guida/layout.tsx`). The layout stays mounted while the
 * reader moves between Guide pages and mounts anew when arriving from another section, so
 * the path it first rendered with is "where this visit to the Guide started" (first load,
 * or the arrival from elsewhere). No timers, no module state: it does not depend on when a
 * page mounts (skeletons, late hydration, back/forward).
 */
export function GuideShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [shell] = useState<Shell>(() => {
    let navigated = false;
    return {
      // True once a page other than the one the visit started on has been seen.
      hasNavigated: (path) => (navigated ||= path !== pathname),
    };
  });
  return <GuideShellContext.Provider value={shell}>{children}</GuideShellContext.Provider>;
}

/**
 * Moves focus to the page title once the reader has moved from one Guide page to another.
 * The first page of a visit (document load, or arrival from another section) is left
 * alone. Renders nothing; the title (`id`, `tabIndex={-1}`) is rendered by the server.
 */
export function FocusHeading({ targetId }: { targetId: string }) {
  const shell = useContext(GuideShellContext);
  const pathname = usePathname();
  useEffect(() => {
    if (!shell) return;
    if (shell.hasNavigated(pathname)) document.getElementById(targetId)?.focus();
  }, [shell, pathname, targetId]);
  return null;
}
