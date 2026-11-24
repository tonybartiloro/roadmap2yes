"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMilestone, MILESTONE_CATEGORIES } from "@/content/milestones";
import { isPlainDate } from "@/lib/dates/plain-date";
import { createClient } from "@/lib/supabase/server";
import { classifyDbError } from "@/lib/supabase/errors";
import type { Database, Tables } from "@/lib/supabase/database.types";
import {
  versionedUpdate,
  VersionedUpdateError,
  type VersionedPatch,
} from "@/lib/supabase/versioned-update";
import {
  ERROR_MESSAGES,
  type ActionErrorCode,
  type ActionResult,
  type ConflictInfo,
  type ReferenceSet,
  type TaskSaved,
} from "./action-types";
import { taskToFields } from "./field-labels";
import { rowToPartner, rowToTask } from "./model";

/**
 * Server actions of the Percorso (plan §1, §9). Every write runs with the USER's session, so RLS
 * and column grants are the only authorization (§3.1); zod only shapes the input. Edits use
 * `versionedUpdate`: a stale version becomes a `conflict` result (AC40), never an overwrite.
 */

type Db = SupabaseClient<Database>;

async function userClient(): Promise<Db> {
  return (await createClient()) as unknown as Db;
}

function fail(code: ActionErrorCode, conflict?: ConflictInfo): ActionResult<never> {
  return { ok: false, code, message: ERROR_MESSAGES[code], ...(conflict ? { conflict } : {}) };
}

/** Maps a PostgREST/RPC failure to a stable code (RPC errors are P0001 with the code as message). */
function codeOf(error: { message?: string; code?: string } | null | undefined): ActionErrorCode {
  if (classifyDbError(error)) return "unavailable";
  if (error?.code === "42501") return "forbidden";
  switch (error?.message) {
    case "decision_taken":
    case "invalid_option":
    case "too_many_tasks":
      return error.message;
    case "forbidden":
      return "forbidden";
    case "no_date_decision":
      return "invalid_option";
    default:
      return "unknown";
  }
}

const dateSchema = z.string().refine(isPlainDate, "invalid date");
const idSchema = z.uuid();
const versionSchema = z.number().int().min(1);

const taskFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  dueDate: dateSchema.nullable(),
  category: z.enum(MILESTONE_CATEGORIES).nullable(),
  notes: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .transform((value) => (value ? value : null)),
  assignee: z.enum(["both", "A", "B"]),
  remindersEnabled: z.boolean(),
});

async function weddingIdOf(db: Db): Promise<string | null> {
  const { data } = await db.from("weddings").select("id").maybeSingle();
  return data?.id ?? null;
}

async function conflictInfo(
  db: Db,
  current: Tables<"tasks"> | null,
  changedBy: string | null,
  changedAt: string | null,
): Promise<ConflictInfo | null> {
  if (!current) return null;
  const { data } = await db.from("wedding_partners").select("*");
  const partner = (data ?? []).map(rowToPartner).find((p) => p.userId && p.userId === changedBy);
  return {
    currentVersion: current.version,
    changedByName: partner?.name ?? null,
    changedAt,
    theirs: taskToFields(rowToTask(current)),
  };
}

async function writeTask(
  db: Db,
  id: string,
  expectedVersion: number,
  patch: VersionedPatch<"tasks">,
): Promise<ActionResult<TaskSaved>> {
  try {
    const result = await versionedUpdate(db, "tasks", id, expectedVersion, patch);
    if (!result.conflict) {
      revalidatePath("/percorso");
      return { ok: true, data: { id: result.row.id, version: result.row.version } };
    }
    const info = await conflictInfo(db, result.current, result.changedBy, result.changedAt);
    return info ? fail("unknown", info) : fail("not_found");
  } catch (error) {
    return fail(error instanceof VersionedUpdateError ? codeOf(error) : "unknown");
  }
}

export async function createTaskAction(input: unknown): Promise<ActionResult<TaskSaved>> {
  const parsed = taskFieldsSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const db = await userClient();
  const weddingId = await weddingIdOf(db);
  if (!weddingId) return fail("forbidden");
  const f = parsed.data;
  const { data, error } = await db
    .from("tasks")
    .insert({
      wedding_id: weddingId,
      title: f.title,
      notes: f.notes,
      category: f.category,
      due_date: f.dueDate,
      assignee: f.assignee,
      reminders_enabled: f.remindersEnabled,
    })
    .select("id, version")
    .single();
  if (error || !data) return fail(codeOf(error));
  revalidatePath("/percorso");
  return { ok: true, data: { id: data.id, version: data.version } };
}

export async function updateTaskAction(input: unknown): Promise<ActionResult<TaskSaved>> {
  const parsed = z
    .object({ id: idSchema, expectedVersion: versionSchema, fields: taskFieldsSchema })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { id, expectedVersion, fields: f } = parsed.data;
  return writeTask(await userClient(), id, expectedVersion, {
    title: f.title,
    notes: f.notes,
    category: f.category,
    due_date: f.dueDate,
    assignee: f.assignee,
    reminders_enabled: f.remindersEnabled,
  });
}

/** Checkbox: complete or reopen. Same concurrency rule as every other edit. */
export async function setTaskStatusAction(input: unknown): Promise<ActionResult<TaskSaved>> {
  const parsed = z
    .object({ id: idSchema, expectedVersion: versionSchema, done: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { id, expectedVersion, done } = parsed.data;
  return writeTask(await userClient(), id, expectedVersion, { status: done ? "done" : "todo" });
}

/** Logical deletion: the task stays in "Eliminati di recente" and is never regenerated (AC31). */
export async function deleteTaskAction(input: unknown): Promise<ActionResult<TaskSaved>> {
  const parsed = z.object({ id: idSchema, expectedVersion: versionSchema }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  return writeTask(await userClient(), parsed.data.id, parsed.data.expectedVersion, {
    deleted_at: new Date().toISOString(),
  });
}

export async function restoreTaskAction(input: unknown): Promise<ActionResult<TaskSaved>> {
  const parsed = z.object({ id: idSchema, expectedVersion: versionSchema }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  return writeTask(await userClient(), parsed.data.id, parsed.data.expectedVersion, {
    deleted_at: null,
  });
}

/** "Va bene così" (AC20): one task, or every task flagged "Da rivedere" with `taskId` null. */
export async function acknowledgeReviewAction(input: unknown): Promise<ActionResult<number>> {
  const parsed = z.object({ taskId: idSchema.nullable() }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const db = await userClient();
  const { data, error } = await db.rpc("acknowledge_task_review", {
    ...(parsed.data.taskId ? { p_task_id: parsed.data.taskId } : {}),
  });
  if (error) return fail(codeOf(error));
  revalidatePath("/percorso");
  return { ok: true, data: data ?? 0 };
}

/**
 * "Imposta come riferimento" (AC24, AC32) and "Torna automatico" (`optionId` null). Returns the
 * previous manual reference so the "Annulla" toast can send it back.
 */
export async function setReferenceAction(input: unknown): Promise<ActionResult<ReferenceSet>> {
  const parsed = z.object({ optionId: idSchema.nullable() }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const db = await userClient();
  const before = await db.from("weddings").select("manual_reference_option_id").maybeSingle();
  if (before.error) return fail(codeOf(before.error));
  const { data, error } = await db.rpc("set_reference_scenario", {
    ...(parsed.data.optionId ? { p_option_id: parsed.data.optionId } : {}),
  });
  if (error) return fail(codeOf(error));
  revalidatePath("/percorso");
  revalidatePath("/scelte");
  const reference = (data ?? {}) as { reference_date?: string | null };
  return {
    ok: true,
    data: {
      previousOptionId: before.data?.manual_reference_option_id ?? null,
      referenceDate: reference.reference_date ?? null,
    },
  };
}

/** "Accetta" on a new suggestion: a copy of the milestone, due date computed by the DB. */
export async function acceptSuggestedTaskAction(input: unknown): Promise<ActionResult<number>> {
  const parsed = z.object({ templateKey: z.string().min(1).max(60) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const milestone = getMilestone(parsed.data.templateKey);
  if (!milestone) return fail("invalid");
  const db = await userClient();
  const { data, error } = await db.rpc("insert_template_tasks", {
    p_tasks: [
      {
        template_key: milestone.key,
        template_version: milestone.version,
        title: milestone.title,
        advice: milestone.advice,
        category: milestone.category,
        offset: milestone.offset ? { ...milestone.offset } : null,
      },
    ],
  });
  if (error) return fail(codeOf(error));
  revalidatePath("/percorso");
  const inserted = (data as { inserted?: number } | null)?.inserted ?? 0;
  return { ok: true, data: inserted };
}

/** "Ignora": the suggestion (add or remove) is never shown again (AC16). */
export async function dismissSuggestionAction(input: unknown): Promise<ActionResult> {
  const parsed = z
    .object({ templateKey: z.string().min(1).max(60), kind: z.enum(["add", "remove"]) })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  const db = await userClient();
  const weddingId = await weddingIdOf(db);
  if (!weddingId) return fail("forbidden");
  const { error } = await db.from("task_suggestion_dismissals").insert({
    wedding_id: weddingId,
    template_key: parsed.data.templateKey,
    kind: parsed.data.kind,
  });
  // 23505: already dismissed (by the partner): same outcome.
  if (error && error.code !== "23505") return fail(codeOf(error));
  revalidatePath("/percorso");
  return { ok: true, data: null };
}
