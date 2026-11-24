"use client";

import { createContext, useContext, type ReactNode } from "react";
import { MailX } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const EmailStatusContext = createContext<boolean | null>(null);

/**
 * The `(app)` layout computes "are emails on?" on the server (runtime config, never a
 * `NEXT_PUBLIC_` variable) and provides it here; pages only render `<EmailOffBanner />` (AC59).
 */
export function EmailStatusProvider({
  emailEnabled,
  children,
}: {
  emailEnabled: boolean;
  children: ReactNode;
}) {
  return <EmailStatusContext.Provider value={emailEnabled}>{children}</EmailStatusContext.Provider>;
}

/** Persistent, discreet notice on Home and Percorso when the app sends no email. */
export function EmailOffBanner({ emailEnabled }: { emailEnabled?: boolean }) {
  const fromContext = useContext(EmailStatusContext);
  const enabled = emailEnabled ?? fromContext ?? true;
  if (enabled) return null;
  return (
    <Alert variant="default" role="status" data-slot="email-off-banner" className="text-sm">
      <MailX aria-hidden className="size-5" />
      <AlertDescription>
        Le email sono spente: i promemoria li trovi solo qui nell&apos;app.
      </AlertDescription>
    </Alert>
  );
}
