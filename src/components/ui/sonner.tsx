"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Toast host (used for "Annulla" toasts, >= 8 s, plan AC31). Colours come from the theme tokens
 * through CSS variables; the theme itself is applied by the root layout (T3).
 *
 * - The description colour is the theme text colour: sonner's own grey (#3f3f3f) is unreadable on
 *   a dark card (about 1.7:1, DES-02).
 * - Under 768 px the bottom bar and the round "+" button are on screen (the "+" ends 8.5 rem from
 *   the bottom), so the toast sits above both instead of covering them. From 768 px sonner's own
 *   corner offset applies. Both sonner offset variables are set (it switches at 600 px).
 * - Action and cancel buttons ("Annulla") are 44 x 44 px touch targets (WCAG 2.5.5, DES-54):
 *   sonner draws them 24 px tall with 12 px text. Its own rules use attribute selectors, so ours
 *   need `!`. Sonner also sets `outline: 0`, which beats the app-wide `:focus-visible` outline:
 *   the same outline is restored here (its 40 % black shadow vanishes on dark themes).
 */
const TOAST_BUTTON =
  "h-11! min-w-11! px-3! text-sm! rounded-md! focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-ring!";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group max-md:[--mobile-offset-bottom:calc(9rem+env(safe-area-inset-bottom))]! max-md:[--offset-bottom:calc(9rem+env(safe-area-inset-bottom))]!"
      toastOptions={{
        classNames: {
          description: "text-[var(--normal-text)]!",
          actionButton: TOAST_BUTTON,
          cancelButton: TOAST_BUTTON,
        },
      }}
      position="bottom-center"
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
        } as CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
