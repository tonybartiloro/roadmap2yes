/**
 * Values the couple-side screens (client components) need. No Node imports here: `data.ts` pulls
 * in `node:crypto`, so a client component must read these from this module, never from `data.ts`.
 */

/** The recomputed token does not match the stored hash (secret rotated): "Nuovo link" fixes it. */
export const STALE_MESSAGE = "Questo link va rigenerato.";
export const LINK_ERROR = "Non sono riuscito a creare il link. Riprova.";
export const SHARE_ERROR = "Non sono riuscito a segnare il link come condiviso. Riprova.";

/** Codes after which the screen is stale and must reload. */
export const RSVP_STALE_CODES: ReadonlySet<string> = new Set([
  "link_not_found",
  "link_not_working",
  "link_expired",
]);

/** What `unmarkShared` takes back: handed over exactly as `markShared` returned it. */
export interface SharedPrevious {
  shared_at: string | null;
  shared_by: string | null;
  people: string[];
}
