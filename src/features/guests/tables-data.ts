import { z } from "zod";
import { parseCapacity, validateTableName } from "@/domain/guests";
import { nameBook, type PartnerRow } from "@/features/budget/model";
import type { ActionResult, VersionedResult } from "@/features/decisions/types";
import type { Tables } from "@/lib/supabase/database.types";
import { versionedUpdate, VersionedUpdateError } from "@/lib/supabase/versioned-update";
import { GENERIC_ERROR, mapDbError, type Db } from "./data";

/**
 * Create and edit of a TABLE (name 1-60, capacity 1-50 or none). Deleting, restoring and deleting
 * for good go through the generic entity functions of `data.ts` (kind "table"). Same rules as the
 * rest of the module: the user's client (RLS decides), fixed texts only, never a DB message.
 * Shape and position stay in the database, unused here (BR10, R-06).
 */

export interface TableValues {
  name: string;
  capacity: number | null;
}

const uuid = z.string().uuid();

/** What the forms send: the capacity as typed or a number; the transform returns the stored values. */
const tableInput = z
  .object({ name: z.string(), capacity: z.union([z.string(), z.number(), z.null()]).optional() })
  .superRefine((value, ctx) => {
    const name = validateTableName(value.name);
    if (name) ctx.addIssue({ code: "custom", path: ["name"], message: name });
    const capacity = parseCapacity(value.capacity ?? null);
    if (!capacity.ok)
      ctx.addIssue({ code: "custom", path: ["capacity"], message: capacity.message });
  })
  .transform((value): TableValues => {
    const parsed = parseCapacity(value.capacity ?? null);
    return { name: value.name.trim(), capacity: parsed.ok ? parsed.capacity : null };
  });

export const tableSchemas = {
  add: tableInput,
  update: z.object({
    tableId: uuid,
    version: z.number().int().min(1),
    table: tableInput,
  }),
};

/** Our own Italian message of a failed parse, else a generic line (never Zod's English text). */
export function tableInvalidMessage(error: z.ZodError): string {
  return error.issues.find((i) => i.code === "custom")?.message ?? GENERIC_ERROR;
}

export async function addTable(
  db: Db,
  input: TableValues,
): Promise<ActionResult<{ tableId: string }>> {
  const wedding = await db.from("weddings").select("id").limit(1).maybeSingle();
  if (wedding.error || !wedding.data) {
    return { ok: false, ...mapDbError(wedding.error ?? { code: "42501" }) };
  }
  const inserted = await db
    .from("guest_tables")
    .insert({ wedding_id: wedding.data.id, name: input.name, capacity: input.capacity })
    .select("id")
    .single();
  return inserted.error
    ? { ok: false, ...mapDbError(inserted.error) }
    : { ok: true, data: { tableId: inserted.data.id } };
}

const tableFields = (row: Tables<"guest_tables">): Record<string, unknown> => ({
  name: row.name,
  capacity: row.capacity,
  version: row.version,
});

/** Edit from the form: versioned update, conflict data for the dialog (AC6, BR9). */
export async function updateTable(
  db: Db,
  userId: string,
  input: { tableId: string; version: number; table: TableValues },
): Promise<VersionedResult> {
  try {
    const result = await versionedUpdate(db, "guest_tables", input.tableId, input.version, {
      name: input.table.name,
      capacity: input.table.capacity,
    });
    if (!result.conflict) return { ok: true, data: { version: result.row.version } };
    // Same version but zero rows: the UPDATE was denied (RLS), not a conflict.
    if (result.current && result.current.version === input.version) {
      return { ok: false, ...mapDbError({ code: "42501" }) };
    }
    const partners = await db
      .from("wedding_partners")
      .select("user_id, first_name, last_name, label");
    const names = nameBook((partners.data ?? []) as PartnerRow[], userId);
    return {
      ok: false,
      code: "conflict",
      message: "Qualcuno ha modificato questo elemento mentre lo guardavi.",
      conflict: {
        current: result.current ? tableFields(result.current) : null,
        changedByName: result.changedBy ? names.nameOf(result.changedBy) : null,
        changedAt: result.changedAt,
      },
    };
  } catch (error) {
    if (error instanceof VersionedUpdateError) {
      return {
        ok: false,
        ...mapDbError({ ...(error.code ? { code: error.code } : {}), message: error.message }),
      };
    }
    return { ok: false, code: "unknown", message: GENERIC_ERROR };
  }
}
