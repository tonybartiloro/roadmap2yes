import type { Metadata } from "next";
import Link from "next/link";
import { pageContext } from "@/features/onboarding/server";
import { loadSettings } from "@/features/settings/data";
import { SettingsForm } from "@/features/settings/SettingsForm";

export const metadata: Metadata = { title: "Impostazioni nozze" };

/**
 * Altro > Impostazioni nozze (AC16, AC48): the answers of the onboarding, editable by either partner.
 * A changed rite shows up as "Suggerimenti da rivedere" in Percorso; nothing is added or deleted.
 */
export default async function SettingsPage() {
  const { db, userId } = await pageContext();
  const view = await loadSettings(db, userId);
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="font-heading text-[28px] leading-9">Impostazioni nozze</h1>
      <p className="text-muted-foreground">
        Le risposte che hai dato all&apos;inizio. Puoi cambiarle quando vuoi: nessuna tappa viene
        aggiunta o tolta da sola.
      </p>
      <SettingsForm view={view} scope={`${userId}:${view.weddingId}`} />
      <p>
        <Link href="/altro" className="text-primary underline underline-offset-4">
          Torna ad Altro
        </Link>
      </p>
    </div>
  );
}
