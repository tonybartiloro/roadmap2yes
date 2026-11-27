import type { ReactNode } from "react";

/**
 * Frame of the guest pages (design §1.1): no app wordmark, a centred column, 18 px text. The theme
 * is the root layout's (the proxy sets `x-r2y-theme` for a working link, the default otherwise).
 */
export function RsvpShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col text-lg">
      <a
        href="#contenuto"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-4 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Vai al contenuto
      </a>
      <main id="contenuto" className="mx-auto w-full max-w-xl flex-1 px-5 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
    </div>
  );
}
