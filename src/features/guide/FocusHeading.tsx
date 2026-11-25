"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** True once a FocusHeading has mounted in this document (module state, per tab). */
let seenInThisDocument = false;

/**
 * Moves focus to the page title after a client-side navigation inside the Guide,
 * never on the first load of the document. Renders nothing; the title itself
 * (`id`, `tabIndex={-1}`) is rendered by the server.
 */
export function FocusHeading({ targetId }: { targetId: string }) {
  const pathname = usePathname();
  // Decided during the first render: a later mount means we arrived by navigation.
  const arrivedByNavigation = useRef(seenInThisDocument);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const first = lastPath.current === null;
    const changed = !first && lastPath.current !== pathname;
    lastPath.current = pathname;
    seenInThisDocument = true;
    if ((first && arrivedByNavigation.current) || changed) {
      document.getElementById(targetId)?.focus();
    }
  }, [pathname, targetId]);

  return null;
}
