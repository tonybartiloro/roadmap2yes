"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  IMPORT_TOO_LARGE,
  IMPORT_TOO_MANY_ROWS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  payloadSize,
  type ImportRowPayload,
} from "@/domain/guests/csv-import";
import { LIMITS, validateGuest } from "@/domain/guests/validation";
import type { ActionResult } from "@/features/decisions/types";
import { createClient } from "@/lib/supabase/server";
import { mapDbError, type Db } from "./data";

/**
 * Server actions of the import (AC17-AC20, plan P3). The text is parsed in the browser (the file
 * never leaves it); this side receives only the READY rows, re-checks them with the same rules
 * (`validateGuest` and the limits of the parser), and hands them to the `import_guests` RPC, which
 * writes groups and people in ONE transaction. Failures are FIXED Italian texts chosen by code:
 * a database message or detail, which may hold a row, is never returned or logged (ADR-0002).
 */

const SESSION_EXPIRED = "La sessione è scaduta. Entra di nuovo: non hai perso nulla.";
const IMPORT_FAILED = "Non ho importato nulla. Riprova tra un attimo.";
const INVALID_ROW = "Una riga non è valida: torna indietro e controlla l'anteprima.";
const UNDO_FAILED = "Non sono riuscito ad annullare l'importazione. Ricarica la pagina.";

/** Name of the RPC argument that carries the batch id (kept in one place until the types land). */
const UNDO_ARG = "p_batch_id";

const optionalText = z.string().nullable();

const rowSchema = z.object({
  first_name: z.string(),
  last_name: optionalText,
  category: z.string(),
  side: optionalText,
  group: optionalText,
  phone: optionalText,
  email: optionalText,
  notes: optionalText,
});

const importSchema = z.object({
  rows: z.array(rowSchema).min(1).max(MAX_IMPORT_ROWS, IMPORT_TOO_MANY_ROWS),
});

export type ImportResult = { batchId: string; guests: number; groups: number };

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;

async function session(): Promise<{ db: Db } | null> {
  const db = (await createClient()) as unknown as Db;
  const { data } = await db.auth.getClaims();
  return data?.claims?.sub ? { db } : null;
}

/** Exact business codes of the RPC; anything else goes through `mapDbError` (fixed texts). */
function failure(error: { code?: string; message?: string } | null, fallback: string) {
  const code = (error?.message ?? "").trim();
  if (code === "too_many_rows") return { ok: false as const, code, message: IMPORT_TOO_MANY_ROWS };
  if (code === "payload_too_large") {
    return { ok: false as const, code, message: IMPORT_TOO_LARGE };
  }
  if (code === "invalid_row") return { ok: false as const, code, message: INVALID_ROW };
  return { ok: false as const, ...mapDbError(error, fallback) };
}

export async function importGuestsAction(input: unknown): Promise<ActionResult<ImportResult>> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) {
    const tooMany = parsed.error.issues.some((i) => i.message === IMPORT_TOO_MANY_ROWS);
    return {
      ok: false,
      code: tooMany ? "too_many_rows" : "invalid",
      message: tooMany ? IMPORT_TOO_MANY_ROWS : INVALID_ROW,
    };
  }
  const rows = parsed.data.rows as ImportRowPayload[];
  // Same single source of the rules as the browser: a row the parser would refuse is refused here.
  for (const row of rows) {
    const errors = validateGuest({
      firstName: row.first_name,
      lastName: row.last_name,
      category: row.category,
      side: row.side,
      phone: row.phone,
      email: row.email,
      notes: row.notes,
    });
    const group = (row.group ?? "").trim();
    if (Object.keys(errors).length > 0 || group.length > LIMITS.name) {
      return { ok: false, code: "invalid_row", message: INVALID_ROW };
    }
  }
  if (payloadSize(rows) > MAX_IMPORT_BYTES) {
    return { ok: false, code: "payload_too_large", message: IMPORT_TOO_LARGE };
  }
  const ctx = await session();
  if (!ctx) return { ok: false, code: "session", message: SESSION_EXPIRED };

  const result = await (ctx.db.rpc as unknown as Rpc).call(ctx.db, "import_guests", {
    p_rows: rows,
  });
  const body = result.data as { batch_id?: unknown; guests?: unknown; groups?: unknown } | null;
  if (
    result.error ||
    !body ||
    typeof body.batch_id !== "string" ||
    typeof body.guests !== "number" ||
    typeof body.groups !== "number"
  ) {
    return failure(result.error, IMPORT_FAILED);
  }
  revalidatePath("/invitati");
  revalidatePath("/altro/impostazioni");
  return { ok: true, data: { batchId: body.batch_id, guests: body.guests, groups: body.groups } };
}

/** "Annulla importazione" (AC20): removes what the batch created (people and the groups it made). */
export async function undoGuestImportAction(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ batchId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid", message: UNDO_FAILED };
  const ctx = await session();
  if (!ctx) return { ok: false, code: "session", message: SESSION_EXPIRED };
  const result = await (ctx.db.rpc as unknown as Rpc).call(ctx.db, "undo_guest_import", {
    [UNDO_ARG]: parsed.data.batchId,
  });
  if (result.error) return failure(result.error, UNDO_FAILED);
  revalidatePath("/invitati");
  revalidatePath("/altro/impostazioni");
  return { ok: true, data: undefined };
}
