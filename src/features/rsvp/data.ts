import { randomUUID } from "node:crypto";
import type { ActionResult, VersionedResult } from "@/features/decisions/types";
import { mapDbError, versioned, type Db, type RsvpMode } from "@/features/guests/data";
import { allPages, chunk, PageReadError } from "@/lib/supabase/all-pages";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { classifyDbError } from "@/lib/supabase/errors";
import { deriveRsvpToken, hashRsvpToken, rsvpUrl } from "./token";
import type { PresenceStatus, RsvpLink, RsvpResponse, RsvpSnapshot } from "./view";

/**
 * Couple side of RSVP: reads (`loadRsvp`) and writes (links, "Condiviso", mode) with the USER'S
 * client; RLS and the DEFINER RPCs are the only authorization. Nothing here imports Next.js (the
 * integration tests drive it directly), and nothing logs: a result carries only fixed Italian
 * texts chosen by code, never a database message, a token or a hash (ADR-0003).
 *
 * `now` always comes from `getNow()`/`resolveNow()` at the edge (the actions) and is passed as
 * `p_now`; it is never read from a request parameter.
 */

// ---------------------------------------------------------------- reads

/** A failed read. A missing migration is not thrown: `loadRsvp` answers `null` for it. */
export class RsvpLoadError extends Error {
  readonly infra: "paused" | "unreachable" | null;
  constructor(cause: unknown) {
    super("Rsvp: read failed");
    this.name = "RsvpLoadError";
    this.infra = classifyDbError(cause);
  }
}

const NOT_MIGRATED_CODES: ReadonlySet<string> = new Set(["42P01", "42883", "PGRST205", "PGRST202"]);

const asString = (v: unknown): string | null => (typeof v === "string" ? v : null);

function toLink(raw: unknown): RsvpLink | null {
  const l = raw as Record<string, unknown> | null;
  if (!l || typeof l["id"] !== "string") return null;
  return {
    id: l["id"],
    groupId: asString(l["group_id"]),
    guestId: asString(l["guest_id"]),
    working: l["working"] === true,
    revokedAt: asString(l["revoked_at"]),
    sharedAt: asString(l["shared_at"]),
    createdAt: asString(l["created_at"]) ?? "",
  };
}

/**
 * Expiry, links with their `working` flag, "Da rimandare" ids (`rsvp_status`: one source of truth
 * with the public page) and the answers (paged, no truncation). `null` = the migration is not
 * there yet: the list opens without RSVP states (plan, risk "finestra codice nuovo / schema vecchio").
 */
export async function loadRsvp(db: Db, now: Date): Promise<RsvpSnapshot | null> {
  const status = await db.rpc("rsvp_status", { p_now: now.toISOString() });
  if (status.error) {
    if (status.error.code && NOT_MIGRATED_CODES.has(status.error.code)) return null;
    throw new RsvpLoadError(status.error);
  }
  const body = status.data as {
    expires_on?: unknown;
    links?: unknown;
    resend_guest_ids?: unknown;
  } | null;
  if (!body || !Array.isArray(body.links) || !Array.isArray(body.resend_guest_ids)) {
    throw new RsvpLoadError(null);
  }
  let rows: Pick<
    Tables<"rsvp_responses">,
    "id" | "status" | "diet" | "diet_note" | "answered_at"
  >[];
  try {
    rows = await allPages((from, to) =>
      db
        .from("rsvp_responses")
        .select("id, status, diet, diet_note, answered_at")
        .order("id")
        .range(from, to),
    );
  } catch (error) {
    const code = error instanceof PageReadError ? error.code : undefined;
    if (code && NOT_MIGRATED_CODES.has(code)) return null;
    throw new RsvpLoadError(error);
  }
  const responses: RsvpResponse[] = rows.flatMap((r) =>
    r.status === "yes" || r.status === "no"
      ? [
          {
            guestId: r.id,
            status: r.status as PresenceStatus,
            diet: r.diet,
            dietNote: r.diet_note,
            answeredAt: r.answered_at,
          },
        ]
      : [],
  );
  return {
    expiresOn: asString(body.expires_on),
    links: body.links.flatMap((l) => toLink(l) ?? []),
    resendGuestIds: body.resend_guest_ids.filter((id): id is string => typeof id === "string"),
    responses,
  };
}

// ---------------------------------------------------------------- errors

const MESSAGES: Readonly<Record<string, string>> = {
  link_expired: "I link sono scaduti. Se sposti la data, tornano a funzionare da soli.",
  link_not_found: "Questo link non c'è più. Ho ricaricato la pagina.",
  link_not_working: "Questo link ora non copre nessuno: ricarica la pagina.",
  invalid_previous: "Non posso annullare questa azione: ricarica la pagina.",
};
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

function failure(
  error: { code?: string; message?: string } | null,
  generic: string = LINK_ERROR,
): ActionResult<never> {
  const code = (error?.message ?? "").trim();
  if (error?.code === "P0001" && Object.hasOwn(MESSAGES, code)) {
    return { ok: false, code, message: MESSAGES[code]! };
  }
  return { ok: false, ...mapDbError(error, generic) };
}

// ---------------------------------------------------------------- links

/** What a link is for: exactly one of the two. */
export type LinkTarget = { groupId: string } | { guestId: string };

/** The RPC takes at most 1000 items per call. */
export const CREATE_BATCH = 1000;

/**
 * "Crea link" / "Crea link per tutti": a derived token per target (the link id comes from the
 * server, the DB keeps only sha256). The RPC skips what is not a current recipient or already has
 * a link, so `created` can be lower than the targets. Batches of 1000; a later failure is reported
 * as it is (earlier batches stay created: running it again only fills the gaps).
 */
export async function createLinks(
  db: Db,
  input: { secret: string; now: Date; targets: readonly LinkTarget[] },
): Promise<ActionResult<{ created: number }>> {
  let created = 0;
  for (const batch of chunk([...input.targets], CREATE_BATCH)) {
    const items = batch.map((target) => {
      const linkId = randomUUID();
      return {
        link_id: linkId,
        token_hash: hashRsvpToken(deriveRsvpToken(input.secret, linkId)),
        ...("groupId" in target ? { group_id: target.groupId } : { guest_id: target.guestId }),
      };
    });
    const result = await db.rpc("rsvp_create_links", {
      p_items: items as unknown as Json,
      p_now: input.now.toISOString(),
    });
    const body = result.data as { created?: unknown } | null;
    if (result.error || !body || !Array.isArray(body.created)) return failure(result.error);
    created += body.created.length;
  }
  return { ok: true, data: { created } };
}

/**
 * The URL of an existing link, RECOMPUTED from the secret and the link id (read only; the token
 * is never stored). `forbidden` without `guests/write`; a missing or revoked link is `link_not_found`;
 * a recomputed token whose sha256 differs from the stored one (secret rotated) is `stale`
 * ("Questo link va rigenerato"), checked by `rsvp_link_matches` because `token_hash` is unreadable.
 */
export async function getLinkUrl(
  db: Db,
  input: { secret: string; siteUrl: string; linkId: string },
): Promise<ActionResult<{ url: string }>> {
  const wedding = await db.from("weddings").select("id").limit(1).maybeSingle();
  if (wedding.error) return failure(wedding.error);
  if (!wedding.data) return failure({ code: "42501" });
  const allowed = await db.rpc("has_permission", {
    p_wedding_id: wedding.data.id,
    p_area: "guests",
    p_action: "write",
  });
  if (allowed.error) return failure(allowed.error);
  if (allowed.data !== true) return failure({ code: "42501" });
  const row = await db
    .from("rsvp_links")
    .select("id, revoked_at")
    .eq("id", input.linkId)
    .maybeSingle();
  if (row.error) return failure(row.error);
  if (!row.data || row.data.revoked_at !== null) {
    return failure({ code: "P0001", message: "link_not_found" });
  }
  const token = deriveRsvpToken(input.secret, row.data.id);
  // The token is derived, the DB keeps its sha256: a rotated or wrong secret gives another hash.
  const matches = await db.rpc("rsvp_link_matches", {
    p_link_id: row.data.id,
    p_hash: hashRsvpToken(token),
  });
  if (matches.error) return failure(matches.error);
  if (matches.data !== true) return { ok: false, code: "stale", message: STALE_MESSAGE };
  return { ok: true, data: { url: rsvpUrl(input.siteUrl, token) } };
}

/** "Nuovo link": revokes the current one and creates the next, atomically (AC7). */
export async function rotateLink(
  db: Db,
  input: { secret: string; now: Date; linkId: string },
): Promise<ActionResult<{ linkId: string }>> {
  const newId = randomUUID();
  const result = await db.rpc("rsvp_rotate_link", {
    p_link_id: input.linkId,
    p_new_id: newId,
    p_new_hash: hashRsvpToken(deriveRsvpToken(input.secret, newId)),
    p_now: input.now.toISOString(),
  });
  const body = result.data as { link_id?: unknown } | null;
  if (result.error || !body || typeof body.link_id !== "string") return failure(result.error);
  return { ok: true, data: { linkId: body.link_id } };
}

export async function revokeLink(
  db: Db,
  input: { linkId: string },
): Promise<ActionResult<{ linkId: string }>> {
  const result = await db.rpc("rsvp_revoke_link", { p_link_id: input.linkId });
  const body = result.data as { link_id?: unknown } | null;
  if (result.error || !body || typeof body.link_id !== "string") {
    return failure(result.error, "Non sono riuscito a revocare il link. Riprova.");
  }
  return { ok: true, data: { linkId: body.link_id } };
}

/** What `unmarkShared` takes back: handed over exactly as `markShared` returned it. */
export interface SharedPrevious {
  shared_at: string | null;
  shared_by: string | null;
  people: string[];
}

/** "Condiviso il": stamps the link and snapshots the people it covers (AC8). */
export async function markShared(
  db: Db,
  input: { linkId: string; now: Date },
): Promise<ActionResult<{ previous: SharedPrevious }>> {
  const result = await db.rpc("rsvp_mark_shared", {
    p_link_id: input.linkId,
    p_now: input.now.toISOString(),
  });
  const body = result.data as { previous?: Partial<SharedPrevious> } | null;
  const prev = body?.previous;
  if (result.error || !prev || !Array.isArray(prev.people)) {
    return failure(result.error, SHARE_ERROR);
  }
  return {
    ok: true,
    data: {
      previous: {
        shared_at: asString(prev.shared_at),
        shared_by: asString(prev.shared_by),
        people: prev.people.filter((id): id is string => typeof id === "string"),
      },
    },
  };
}

/** Annulla of "Condiviso il": puts back the previous stamp and snapshot. */
export async function unmarkShared(
  db: Db,
  input: { linkId: string; previous: SharedPrevious },
): Promise<ActionResult<{ linkId: string }>> {
  const result = await db.rpc("rsvp_unmark_shared", {
    p_link_id: input.linkId,
    p_previous: input.previous as unknown as Json,
  });
  const body = result.data as { link_id?: unknown } | null;
  if (result.error || !body || typeof body.link_id !== "string") {
    return failure(result.error, "Non sono riuscito ad annullare. Riprova.");
  }
  return { ok: true, data: { linkId: body.link_id } };
}

// ---------------------------------------------------------------- group mode

/** "Come rispondono": versioned, so a concurrent edit becomes the conflict dialog (BR1, BR3). */
export function setGroupMode(
  db: Db,
  userId: string,
  input: { groupId: string; version: number; mode: RsvpMode },
): Promise<VersionedResult> {
  return versioned(
    db,
    userId,
    "guest_groups",
    input.groupId,
    input.version,
    { rsvp_mode: input.mode },
    (row) => ({ name: row.name, rsvpMode: row.rsvp_mode, version: row.version }),
  );
}
