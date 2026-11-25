"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * True for the instant a FocusHeading was unmounted (cleared right after the commit).
 * A new instance that mounts in the same commit was reached from a Guide page.
 */
let justLeftGuide = false;

/**
 * Moves focus to the page title only when the navigation started inside the Guide
 * (/guida -> /guida/x, x -> y, back to the index). Never on the first load of the
 * document and never when arriving from another section. Renders nothing; the title
 * (`id`, `tabIndex={-1}`) is rendered by the server.
 */
export function FocusHeading({ targetId }: { targetId: string }) {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const first = lastPath.current === null;
    const changed = !first && lastPath.current !== pathname;
    lastPath.current = pathname;
    if ((first && justLeftGuide) || changed) {
      document.getElementById(targetId)?.focus();
    }
  }, [pathname, targetId]);

  useEffect(
    () => () => {
      justLeftGuide = true;
      setTimeout(() => {
        justLeftGuide = false;
      }, 0);
    },
    [],
  );

  return null;
}
