import type { Metadata } from "next";
import { displayName } from "@/lib/display-name";
import { canReadGuests, GuestsLoadError, loadGuests, type Db } from "@/features/guests/data";
import { GuestsScreen, type RsvpProps } from "@/features/guests/GuestsScreen";
import { loadRsvp } from "@/features/rsvp/data";
import { getNow } from "@/lib/clock";
import { pageContext } from "@/features/guests/server";
import { LoadError } from "./LoadError";

export const metadata: Metadata = { title: "Invitati" };

/** Names of the two partners by slot, for the "lato" labels (fallbacks "Partner A"/"Partner B"). */
async function partnerNames(
  db: Db,
): Promise<{ shown: { a: string; b: string }; real: { a: string | null; b: string | null } }> {
  const rows = await db.from("wedding_partners").select("slot, first_name, label");
  const nameOf = (slot: string, fallback: string) => {
    const row = rows.data?.find((p) => p.slot === slot);
    return displayName(row ? { firstName: row.first_name, label: row.label } : null, fallback);
  };
  // The CSV `lato` column uses a real name only: no fallback text such as "Partner A".
  const real = (slot: string) => nameOf(slot, "") || null;
  return {
    shown: { a: nameOf("A", "Partner A"), b: nameOf("B", "Partner B") },
    real: { a: real("A"), b: real("B") },
  };
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
  const names = await partnerNames(db);
  const rsvp = await rsvpProps(db, [names.real.a, names.real.b]);
  return (
    <GuestsScreen
      snapshot={snapshot}
      partners={names.shown}
      importNames={names.real}
      {...(rsvp ? { rsvp } : {})}
    />
  );
}

/** `guests/write` of the caller (the actions are hidden without it; the server decides anyway). */
async function canWriteGuests(db: Db): Promise<boolean> {
  const wedding = await db.from("weddings").select("id").limit(1).maybeSingle();
  if (wedding.error || !wedding.data) return false;
  const allowed = await db.rpc("has_permission", {
    p_wedding_id: wedding.data.id,
    p_area: "guests",
    p_action: "write",
  });
  return allowed.data === true;
}

/**
 * The RSVP states. A missing schema (`loadRsvp` answers `null`) or a failed read leaves the list
 * as it was, without states and without an error: the guests list must open anyway.
 */
async function rsvpProps(db: Db, couple: (string | null)[]): Promise<RsvpProps | null> {
  try {
    const now = await getNow();
    const snapshot = await loadRsvp(db, now);
    if (!snapshot) return null;
    return {
      snapshot,
      now: now.toISOString(),
      couple: couple.filter((n): n is string => Boolean(n)),
      canWrite: await canWriteGuests(db),
    };
  } catch {
    return null;
  }
}
