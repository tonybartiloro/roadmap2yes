import type { ReactNode } from "react";
import { AppNav } from "@/components/AppNav";
import { EmailStatusProvider } from "@/components/EmailOffBanner";
import { shouldShowGuestsNav } from "@/components/guests-nav";
import { readEmailConfig } from "@/lib/app-config";
import { createClient } from "@/lib/supabase/server";

/**
 * Shell of the signed-in area: skip link, navigation (bottom bar / rail) and the content column.
 * Access control is NOT here: the proxy guards and RLS own it. The "are emails on?" flag is
 * computed on the server at request time and handed to `EmailOffBanner` through a provider.
 *
 * "Invitati" in the bar depends on the `guests` read permission (`shouldShowGuestsNav`: both reads
 * share one 1.5 s abort signal, fail-open). It runs on full loads and refreshes, not on client
 * navigation (a shared layout stays mounted), so a permission change shows only after a reload.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const emailEnabled = readEmailConfig().enabled;
  const showGuests = await shouldShowGuestsNav(await createClient());
  return (
    <EmailStatusProvider emailEnabled={emailEnabled}>
      <a
        href="#contenuto"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Vai al contenuto
      </a>
      <AppNav showGuests={showGuests} />
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
