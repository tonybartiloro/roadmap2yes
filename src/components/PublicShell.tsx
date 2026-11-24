import type { ReactNode } from "react";
import { APP_NAME } from "@/components/app-name";

/**
 * Frame of public pages without data (invite, "su invito", unsubscribe, service down): wordmark
 * and a centred column. Reads nothing: the theme comes from the root layout (cookie or default).
 */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenuto"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-4 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Vai al contenuto
      </a>
      <header className="px-6 pt-6">
        <p className="font-heading text-[22px] leading-7">{APP_NAME}</p>
      </header>
      <main id="contenuto" className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
