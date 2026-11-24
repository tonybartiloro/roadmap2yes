import type { ReactNode } from "react";
import { AppNav } from "@/components/AppNav";
import { EmailStatusProvider } from "@/components/EmailOffBanner";
import { readEmailConfig } from "@/lib/app-config";

/**
 * Shell of the signed-in area: skip link, navigation (bottom bar / rail) and the content column.
 * Access control is NOT here: the proxy guards and RLS own it. The "are emails on?" flag is
 * computed on the server at request time and handed to `EmailOffBanner` through a provider.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const emailEnabled = readEmailConfig().enabled;
  return (
    <EmailStatusProvider emailEnabled={emailEnabled}>
      <a
        href="#contenuto"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Vai al contenuto
      </a>
      <AppNav />
      <div className="md:pl-20 lg:pl-56">
        <main
          id="contenuto"
          className="mx-auto w-full max-w-[1120px] px-4 pt-6 pb-28 md:px-8 md:pb-10"
        >
          {children}
        </main>
      </div>
    </EmailStatusProvider>
  );
}
