import type { Metadata } from "next";
import { connection } from "next/server";
import { MailX } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { loadPreferences } from "@/features/notifications/data";
import { PreferenceSwitches } from "@/features/notifications/PreferenceSwitches";
import { pageContext } from "@/features/notifications/server";
import { readEmailConfig } from "@/lib/app-config";

export const metadata: Metadata = { title: "Promemoria email" };

/**
 * Altro > Promemoria (AC52, AC59). Two switches, for this person only. With email off no email is
 * ever sent, so the switches are replaced by an explanation (and nothing is read from the database).
 */
export default async function PromemoriaPage() {
  // The email flag comes from the runtime environment: never frozen at build time.
  await connection();
  const emailEnabled = readEmailConfig().enabled;
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="font-heading text-[28px] leading-9">Promemoria email</h1>
      {emailEnabled ? <Switches /> : <EmailOffExplanation />}
    </div>
  );
}

async function Switches() {
  const { db, userId } = await pageContext();
  const preferences = await loadPreferences(db, userId);
  return <PreferenceSwitches initial={preferences} />;
}

function EmailOffExplanation() {
  return (
    <Alert data-testid="email-off-explanation">
      <MailX aria-hidden className="size-5" />
      <AlertTitle>Le email sono spente</AlertTitle>
      <AlertDescription>
        <p>
          Per ora l&apos;app non manda nessuna email: i promemoria li trovi solo qui, nel Percorso e
          nella Home. Quando le email si accenderanno potrai scegliere da qui quali ricevere.
        </p>
      </AlertDescription>
    </Alert>
  );
}
