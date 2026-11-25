import { z } from "zod";
import {
  GUEST_SIDES,
  LIMITS,
  validateGuest,
  type GuestCategory,
  type GuestInput,
  type GuestSide,
} from "@/domain/guests";
import type { GuestValues } from "./data";

/**
 * Shape of what the client sends to the server actions. The rules of a PERSON (limits, regexes,
 * Italian messages) are NOT written here: they come from `@/domain/guests` (`validateGuest`,
 * `LIMITS`), the single source (code-1 REV-1); `schemas.test` proves the two agree. The database
 * checks stay the real guard.
 */
const uuid = z.string().uuid();
const version = z.number().int().min(1);
const optionalText = z.string().nullable().optional();

/**
 * Cap on the people of ONE action (a transport bound, NOT a cap on the guests of a wedding): the
 * undo payload is the largest, ~140 bytes per entry, so 5000 entries (~0.7 MB) stay safely under
 * the 1 MB Server Action body. `serverActions.bodySizeLimit` is not raised (it is global).
 */
export const MAX_SELECTION = 5_000;
export const SELECTION_TOO_LARGE =
  "Puoi selezionare al massimo 5.000 persone alla volta: dividi la selezione.";
/** A family, not an import (the database says `too_many_rows` above 100). */
export const MAX_FAMILY = 100;

export const GROUP_NAME_REQUIRED = "Scrivi il nome del gruppo.";
export const groupNameTooLong = `Il nome del gruppo può avere al massimo ${LIMITS.name} caratteri.`;

/** Message for a group name, or null when valid. Same limit as the person's name. */
export function validateGroupName(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (v === "") return GROUP_NAME_REQUIRED;
  return v.length > LIMITS.name ? groupNameTooLong : null;
}

const trimmedOrNull = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/** A person as the forms send it. Empty optional text is stored as null (the DB refuses ''). */
export const guestInputSchema = z
  .object({
    firstName: z.string(),
    lastName: optionalText,
    category: optionalText,
    side: optionalText,
    phone: optionalText,
    email: optionalText,
    notes: optionalText,
  })
  .superRefine((value, ctx) => {
    const input: GuestInput = {
      firstName: value.firstName,
      lastName: value.lastName ?? null,
      category: value.category ?? null,
      side: value.side ?? null,
      phone: value.phone ?? null,
      email: value.email ?? null,
      notes: value.notes ?? null,
    };
    for (const [field, message] of Object.entries(validateGuest(input))) {
      ctx.addIssue({ code: "custom", path: [field], message });
    }
  })
  .transform((value): GuestValues => ({
    firstName: value.firstName.trim(),
    lastName: trimmedOrNull(value.lastName),
    category: (trimmedOrNull(value.category) ?? "adult") as GuestCategory,
    side: trimmedOrNull(value.side) as GuestSide | null,
    phone: trimmedOrNull(value.phone),
    email: trimmedOrNull(value.email),
    notes: trimmedOrNull(value.notes),
  }));

const groupName = z
  .string()
  .superRefine((value, ctx) => {
    const message = validateGroupName(value);
    if (message) ctx.addIssue({ code: "custom", message });
  })
  .transform((value) => value.trim());

const side = z.enum(GUEST_SIDES, "Scegli un lato valido.").nullable();
const kind = z.enum(["guest", "group", "table"]);
const optionalRef = uuid.nullable().optional();

const previousEntry = z.object({
  id: uuid,
  op: z.enum(["assign_group", "assign_table", "delete", "restore"]),
  group_id: uuid.nullable(),
  table_id: uuid.nullable(),
  deleted: z.boolean(),
});

export const schemas = {
  addGuest: z.object({ guest: guestInputSchema, groupId: optionalRef, tableId: optionalRef }),
  updateGuest: z.object({
    guestId: uuid,
    version,
    guest: guestInputSchema,
    groupId: optionalRef,
    tableId: optionalRef,
  }),
  assignGuest: z.object({ guestId: uuid, groupId: optionalRef, tableId: optionalRef }),
  addGroup: z.object({ name: groupName }),
  updateGroup: z.object({ groupId: uuid, version, name: groupName }),
  createFamily: z.object({
    name: groupName,
    side,
    guests: z
      .array(guestInputSchema)
      .min(1, "Aggiungi almeno una persona.")
      .max(MAX_FAMILY, `Una famiglia può avere al massimo ${MAX_FAMILY} persone.`),
  }),
  entity: z.object({ kind, id: uuid, version }),
  purge: z.object({ kind, id: uuid }),
  empty: z.object({ scope: z.enum(["guests", "groups", "tables", "all"]) }),
  bulk: z
    .object({
      ids: z.array(uuid).min(1).max(MAX_SELECTION, SELECTION_TOO_LARGE),
      op: z.enum(["assign_group", "assign_table", "delete", "restore"]),
      target: uuid.nullable().optional(),
    })
    .refine((v) => (v.op !== "assign_group" && v.op !== "assign_table") || !!v.target, "target"),
  undo: z.object({
    previous: z.array(previousEntry).min(1).max(MAX_SELECTION, SELECTION_TOO_LARGE),
  }),
};

/**
 * Fixed message for a failed parse: our own Italian domain messages (custom issues, never values),
 * otherwise a generic line. Zod's default English texts are never shown.
 */
export function invalidMessage(error: z.ZodError, fallback: string): string {
  const custom = error.issues.find(
    (issue) =>
      (issue.code === "custom" && issue.message !== "target") ||
      issue.message === SELECTION_TOO_LARGE,
  );
  return custom ? custom.message : fallback;
}
