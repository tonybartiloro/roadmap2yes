import type { ReactNode } from "react";
import { AppNav } from "@/components/AppNav";
import { EmailStatusProvider } from "@/components/EmailOffBanner";
import { readEmailConfig } from "@/lib/app-config";
import { createClient } from "@/lib/supabase/server";
import { LOOKUP_TIMEOUT_MS, withTimeout } from "@/themes/server";

/**
 * Can the user read the guests? Only decides whether the nav item shows (the real check is RLS
 * and the page itself). `has_permission` on the user's wedding (RLS shows only that one).
 * Any failure or timeout resolves to `true`: an outage must not hide a section by mistake.
 */
async function canReadGuests(): Promise<boolean> {
  try {
    const db = await createClient();
    const { data: wedding, error } = await db.from("weddings").select("id").limit(1).maybeSingle();
    if (error || !wedding) return true;
    const { data, error: rpcError } = await db.rpc("has_permission", {
      p_wedding_id: wedding.id,
      p_area: "guests",
      p_action: "read",
    });
    return rpcError ? true : data === true;
  } catch {
    return true;
  }
}

/**
 * Shell of the signed-in area: skip link, navigation (bottom bar / rail) and the content column.
 * Access control is NOT here: the proxy guards and RLS own it. The "are emails on?" flag is
 * computed on the server at request time and handed to `EmailOffBanner` through a provider.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const emailEnabled = readEmailConfig().enabled;
  const showGuests = await withTimeout(canReadGuests(), LOOKUP_TIMEOUT_MS, true);
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
