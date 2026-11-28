"use client";

import { useCallback, useState } from "react";

/**
 * Focus goes back to what opened the dialog (WCAG 2.4.3). Radix cannot do it for a dialog that has
 * no Trigger (an AlertDialog then sends it to `body`). `fallbackLabels` = `aria-label`s of buttons
 * to try, in order, when the opener is gone (a menu sheet that closed) or was never focused (Safari
 * does not focus a button on tap): the row's "Invia il link di …", then the menu button.
 */
export function useFocusReturn(...fallbackLabels: string[]) {
  const [opener] = useState<Element | null>(() =>
    typeof document === "undefined" ? null : document.activeElement,
  );
  const key = fallbackLabels.join("\n");
  return useCallback(
    (event: Event) => {
      event.preventDefault();
      if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body) {
        opener.focus();
        return;
      }
      const buttons = [...document.querySelectorAll<HTMLElement>("button")];
      for (const label of key.split("\n")) {
        const target = label && buttons.find((b) => b.getAttribute("aria-label") === label);
        if (target) return target.focus();
      }
    },
    [opener, key],
  );
}
