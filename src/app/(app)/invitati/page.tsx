import type { Metadata } from "next";
import { displayName } from "@/lib/display-name";
import { canReadGuests, GuestsLoadError, loadGuests, type Db } from "@/features/guests/data";
import { GuestsScreen } from "@/features/guests/GuestsScreen";
import { pageContext } from "@/features/guests/server";
import { LoadError } from "./LoadError";

export const metadata: Metadata = { title: "Invitati" };

/** Names of the two partners by slot, for the "lato" labels (fallbacks "Partner A"/"Partner B"). */
async function partnerNames(db: Db): Promise<{ a: string; b: string }> {
  const rows = await db.from("wedding_partners").select("slot, first_name, label");
  const nameOf = (slot: string, fallback: string) => {
    const row = rows.data?.find((p) => p.slot === slot);
    return displayName(row ? { firstName: row.first_name, label: row.label } : null, fallback);
  };
  return { a: nameOf("A", "Partner A"), b: nameOf("B", "Partner B") };
}

/**
 * Invitati (Persone). Without `guests/read` the page itself shows "Questo spazio è su invito" (no
 * redirect: the guards send members away from /su-invito). A read failure is an `ErrorState` with
 * "Riprova"; a service outage goes to the root boundary.
 */
export default async function GuestsRoute() {
  const { db } = await pageContext();
  if (!(await canReadGuests(db))) {
    return (
      <div className="flex flex-col gap-2" data-testid="guests-invite-only">
        <h1 className="text-2xl leading-8 font-semibold">Questo spazio è su invito</h1>
        <p className="text-muted-foreground text-lg">
          Non hai ancora accesso agli invitati. Chiedi a chi te l&apos;ha condiviso di aggiornare i
          tuoi permessi.
        </p>
      </div>
    );
  }
  let snapshot;
  try {
    snapshot = await loadGuests(db);
  } catch (error) {
    if (error instanceof GuestsLoadError && !error.infra) {
      return <LoadError notMigrated={error.code === "not_migrated"} />;
    }
    throw error;
  }
  return <GuestsScreen snapshot={snapshot} partners={await partnerNames(db)} />;
}
