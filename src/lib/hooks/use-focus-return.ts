"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

interface Opened {
  opener: HTMLElement | null;
  /** The dialog or sheet the opener sat in, if any: still open when the opener itself is gone. */
  scope: HTMLElement | null;
  fallbackLabels: readonly string[];
}

/**
 * Focus goes back to what opened a dialog (WCAG 2.4.3). Radix does it only through a Trigger: an
 * AlertDialog opened from state remembers whatever had focus when its content mounted, and when that
 * element is gone by the time it closes (a menu sheet that closed, a row that was deleted) the focus
 * drops to `body`.
 *
 * Pass the dialog's `open` and put the returned handler on the content's `onCloseAutoFocus`. The
 * opener is read in a layout effect, before Radix moves the focus into the dialog. When it closes the
 * focus goes, in order, to: the opener if it is still on the page; the first button whose
 * `aria-label` is one of `fallbackLabels` (read when the dialog opens); the dialog or sheet the
 * opener was in, if still open. If none applies, Radix's default runs.
 */
export function useFocusReturn(open: boolean, fallbackLabels: readonly string[] = []) {
  const opened = useRef<Opened>({ opener: null, scope: null, fallbackLabels: [] });
  const labels = useRef(fallbackLabels);

  useLayoutEffect(() => {
    labels.current = fallbackLabels;
  });

  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    opened.current = {
      opener,
      scope: opener?.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]') ?? null,
      fallbackLabels: labels.current,
    };
  }, [open]);

  return useCallback((event: Event) => {
    const { opener, scope, fallbackLabels: fallbacks } = opened.current;
    opened.current = { opener: null, scope: null, fallbackLabels: [] };
    const target =
      (opener?.isConnected ? opener : null) ??
      findByLabel(fallbacks) ??
      (scope?.isConnected ? scope : null);
    if (!target) return;
    event.preventDefault();
    target.focus();
  }, []);
}

function findByLabel(labels: readonly string[]): HTMLElement | null {
  if (labels.length === 0) return null;
  const buttons = [...document.querySelectorAll<HTMLElement>("button[aria-label]")];
  for (const label of labels) {
    const match = buttons.find((b) => b.getAttribute("aria-label") === label);
    if (match) return match;
  }
  return null;
}
