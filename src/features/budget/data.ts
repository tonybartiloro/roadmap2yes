import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_BUDGET_CATEGORIES } from "@/content/budget-categories";
import type { Database, Tables } from "@/lib/supabase/database.types";
import { classifyDbError } from "@/lib/supabase/errors";
import {
  versionedUpdate,
  VersionedUpdateError,
  type VersionedPatch,
  type VersionedTable,
} from "@/lib/supabase/versioned-update";
import { buildSnapshot, GENERIC_ERROR, mapDbError, nameBook, type PartnerRow } from "./model";
import type {
  ActionResult,
  BudgetSnapshot,
  ItemInput,
  PaymentInput,
  VersionedResult,
} from "./types";

/**
 * Reads and writes of the Budget screens. Everything runs with the USER'S client (RLS is the only
 * authorization layer); nothing here imports Next.js, so the integration tests drive it directly.
 */
export type Db = SupabaseClient<Database>;

/** A failed read: rendered by the segment `error.tsx` ("Riprova"), never swallowed. */
export class BudgetLoadError extends Error {
  readonly infra: "paused" | "unreachable" | null;
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "BudgetLoadError";
    this.infra = classifyDbError(cause);
  }
}

type Loaded<D> = { data: D; error: { message: string; code?: string } | null };

function must<D>(result: Loaded<D>, what: string): NonNullable<D> {
  if (result.error) throw new BudgetLoadError(`Budget: ${what}`, result.error);
  return result.data as NonNullable<D>;
}

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

/** The id of the couple's wedding (RLS shows only the caller's). */
export async function currentWeddingId(db: Db): Promise<string> {
  const row = must(await db.from("weddings").select("id").limit(1).maybeSingle(), "nozze");
  if (!row) throw new BudgetLoadError("Budget: nozze", { message: "wedding not visible" });
  return row.id;
}

/**
 * Seeds the 11 predefined categories (AC34) that are still missing, idempotently by `default_key`
 * (a deleted one still counts as present, so it never comes back by itself). A concurrent seed by
 * the other partner (23505) or a read-only role (42501) is not an error: the page shows what exists.
 */
export async function ensureDefaultCategories(db: Db, weddingId: string): Promise<void> {
  const existing = must(
    await db
      .from("budget_categories")
      .select("default_key")
      .eq("wedding_id", weddingId)
      .not("default_key", "is", null),
    "categorie",
  );
  const have = new Set(existing.map((row) => row.default_key));
  const missing = DEFAULT_BUDGET_CATEGORIES.filter((c) => !have.has(c.key));
  if (missing.length === 0) return;
  const inserted = await db.from("budget_categories").insert(
    missing.map((c) => ({
      wedding_id: weddingId,
      name: c.name,
      default_key: c.key,
      sort_order: c.sortOrder,
    })),
  );
  if (inserted.error && inserted.error.code !== "23505" && inserted.error.code !== "42501") {
    throw new BudgetLoadError("Budget: categorie predefinite", inserted.error);
  }
}

async function loadPartners(db: Db): Promise<PartnerRow[]> {
  const rows = must(
    await db.from("wedding_partners").select("user_id, first_name, last_name, label"),
    "partner",
  );
  return rows as PartnerRow[];
}

/** Everything the Budget screens show: total history, live categories, items and payments. */
export async function loadBudget(db: Db, context: { userId: string }): Promise<BudgetSnapshot> {
  const weddingId = await currentWeddingId(db);
  await ensureDefaultCategories(db, weddingId);
  const [versions, categories, items, payments, partners] = await Promise.all([
    db.from("budget_versions").select("*").eq("wedding_id", weddingId),
    db.from("budget_categories").select("*").eq("wedding_id", weddingId).is("deleted_at", null),
    db.from("budget_items").select("*").eq("wedding_id", weddingId).is("deleted_at", null),
    db.from("payments").select("*").eq("wedding_id", weddingId).is("deleted_at", null),
    loadPartners(db),
  ]);
  return buildSnapshot({
    weddingId,
    versions: must(versions, "totale"),
    categories: must(categories, "categorie"),
    items: must(items, "voci"),
    payments: must(payments, "pagamenti"),
    partners,
    meUserId: context.userId,
  });
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

function infraMessage(error: unknown): string | null {
  const kind = classifyDbError(error);
  if (kind === "paused") return "L'app è in pausa: riprova più tardi.";
  if (kind === "unreachable") {
    return "Non riesco a raggiungere il servizio. Controlla la connessione e riprova.";
  }
  return null;
}

function failure(error: { code?: string; message?: string } | null): ActionResult<never> {
  const infra = infraMessage(error);
  if (infra) return { ok: false, code: "unreachable", message: infra };
  const mapped = mapDbError(error);
  return { ok: false, code: mapped.code, message: mapped.message };
}

function versionedFailure(error: unknown): VersionedResult {
  if (error instanceof VersionedUpdateError) {
    return failure({ ...(error.code ? { code: error.code } : {}), message: error.message });
  }
  return { ok: false, code: "unknown", message: GENERIC_ERROR };
}

/** Append-only (AC33): a new version with amount, author (stamped by the database) and reason. */
export async function setTotal(
  db: Db,
  input: { totalCents: number; reason: string | null },
): Promise<ActionResult> {
  const weddingId = await weddingIdOrFail(db);
  if (typeof weddingId !== "string") return weddingId;
  const inserted = await db.from("budget_versions").insert({
    wedding_id: weddingId,
    total_cents: input.totalCents,
    reason: input.reason,
  });
  return inserted.error ? failure(inserted.error) : { ok: true, data: undefined };
}

async function weddingIdOrFail(db: Db): Promise<string | ActionResult<never>> {
  const row = await db.from("weddings").select("id").limit(1).maybeSingle();
  if (row.error) return failure(row.error);
  if (!row.data) return failure({ code: "42501" });
  return row.data.id;
}

export async function addCategory(
  db: Db,
  input: { name: string; assignedCents?: number | null },
): Promise<ActionResult<{ categoryId: string }>> {
  const weddingId = await weddingIdOrFail(db);
  if (typeof weddingId !== "string") return weddingId;
  const last = await db
    .from("budget_categories")
    .select("sort_order")
    .eq("wedding_id", weddingId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last.error) return failure(last.error);
  const inserted = await db
    .from("budget_categories")
    .insert({
      wedding_id: weddingId,
      name: input.name,
      assigned_cents: input.assignedCents ?? null,
      sort_order: (last.data?.sort_order ?? -1) + 1,
    })
    .select("id")
    .single();
  return inserted.error
    ? failure(inserted.error)
    : { ok: true, data: { categoryId: inserted.data.id } };
}

function categoryFields(row: Tables<"budget_categories">): Record<string, unknown> {
  return { name: row.name, assignedCents: row.assigned_cents, version: row.version };
}

function itemFields(row: Tables<"budget_items">): Record<string, unknown> {
  return {
    description: row.description,
    status: row.status,
    plannedCents: row.planned_cents,
    agreedCents: row.agreed_cents,
    version: row.version,
  };
}

function paymentFields(row: Tables<"payments">): Record<string, unknown> {
  return {
    kind: row.kind,
    amountCents: row.amount_cents,
    dueDate: row.due_date,
    paid: row.paid,
    paidOn: row.paid_on,
    version: row.version,
  };
}

async function conflictResult(
  db: Db,
  userId: string,
  current: Record<string, unknown> | null,
  changedBy: string | null,
  changedAt: string | null,
): Promise<VersionedResult> {
  const names = nameBook(await loadPartners(db).catch(() => []), userId);
  return {
    ok: false,
    code: "conflict",
    message: "Qualcuno ha modificato questo elemento mentre lo guardavi.",
    conflict: {
      current,
      changedByName: changedBy ? names.nameOf(changedBy) : null,
      changedAt,
    },
  };
}

/** One optimistic-concurrency write (AC40): a conflict never overwrites. */
async function versioned<T extends VersionedTable>(
  db: Db,
  userId: string,
  table: T,
  id: string,
  version: number,
  patch: VersionedPatch<T>,
  fields: (row: Tables<T>) => Record<string, unknown>,
): Promise<VersionedResult> {
  try {
    const result = await versionedUpdate(db, table, id, version, patch);
    if (!result.conflict) return { ok: true, data: { version: result.row.version } };
    return conflictResult(
      db,
      userId,
      result.current ? fields(result.current) : null,
      result.changedBy,
      result.changedAt,
    );
  } catch (error) {
    return versionedFailure(error);
  }
}

export async function updateCategory(
  db: Db,
  userId: string,
  input: { categoryId: string; version: number; name?: string; assignedCents?: number | null },
): Promise<VersionedResult> {
  const patch: VersionedPatch<"budget_categories"> = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.assignedCents !== undefined ? { assigned_cents: input.assignedCents } : {}),
  };
  return versioned(
    db,
    userId,
    "budget_categories",
    input.categoryId,
    input.version,
    patch,
    categoryFields,
  );
}

/** Soft delete: the database refuses (`category_not_empty`) while the category has live items. */
export async function removeCategory(
  db: Db,
  userId: string,
  input: { categoryId: string; version: number },
): Promise<VersionedResult> {
  return versioned(
    db,
    userId,
    "budget_categories",
    input.categoryId,
    input.version,
    { deleted_at: new Date().toISOString() },
    categoryFields,
  );
}

export async function restoreCategory(
  db: Db,
  userId: string,
  input: { categoryId: string; version: number },
): Promise<VersionedResult> {
  return versioned(
    db,
    userId,
    "budget_categories",
    input.categoryId,
    input.version,
    { deleted_at: null },
    categoryFields,
  );
}

/**
 * "Sposta in…" then delete (AC34, D37): the RPC moves the live items and returns Assegnato of the
 * source to "non assegnato"; the category is then empty, so it can be deleted. The version to
 * delete with is read after the move (the RPC bumped it).
 */
export async function moveAndDeleteCategory(
  db: Db,
  userId: string,
  input: { fromId: string; toId: string },
): Promise<ActionResult<{ moved: number; version: number }>> {
  const moved = await db.rpc("move_budget_items", { p_from: input.fromId, p_to: input.toId });
  if (moved.error) return failure(moved.error);
  const row = await db
    .from("budget_categories")
    .select("version")
    .eq("id", input.fromId)
    .maybeSingle();
  if (row.error) return failure(row.error);
  if (!row.data) return failure({ message: "not_found" });
  const deleted = await removeCategory(db, userId, {
    categoryId: input.fromId,
    version: row.data.version,
  });
  if (deleted.ok)
    return { ok: true, data: { moved: moved.data ?? 0, version: deleted.data.version } };
  if (deleted.code === "conflict") {
    return {
      ok: false,
      code: "category_changed",
      message: "Qualcuno ha modificato questa categoria mentre la spostavi. Riprova.",
    };
  }
  return { ok: false, code: deleted.code, message: deleted.message };
}

export async function addItem(
  db: Db,
  input: { categoryId: string; item: ItemInput },
): Promise<ActionResult<{ itemId: string }>> {
  const category = await db
    .from("budget_categories")
    .select("wedding_id")
    .eq("id", input.categoryId)
    .maybeSingle();
  if (category.error) return failure(category.error);
  if (!category.data) return failure({ message: "category_not_found" });
  const inserted = await db
    .from("budget_items")
    .insert({
      wedding_id: category.data.wedding_id,
      category_id: input.categoryId,
      description: input.item.description,
      status: input.item.status,
      planned_cents: input.item.plannedCents,
      agreed_cents: input.item.agreedCents,
    })
    .select("id")
    .single();
  return inserted.error
    ? failure(inserted.error)
    : { ok: true, data: { itemId: inserted.data.id } };
}

function itemPatch(item: ItemInput): VersionedPatch<"budget_items"> {
  return {
    description: item.description,
    status: item.status,
    planned_cents: item.plannedCents,
    agreed_cents: item.agreedCents,
  };
}

export async function updateItem(
  db: Db,
  userId: string,
  input: { itemId: string; version: number; item: ItemInput },
): Promise<VersionedResult> {
  return versioned(
    db,
    userId,
    "budget_items",
    input.itemId,
    input.version,
    itemPatch(input.item),
    itemFields,
  );
}

/** Soft delete; its payments stay in the database so "Annulla" brings everything back (REV-5a). */
export async function removeItem(
  db: Db,
  userId: string,
  input: { itemId: string; version: number },
): Promise<VersionedResult> {
  return versioned(
    db,
    userId,
    "budget_items",
    input.itemId,
    input.version,
    { deleted_at: new Date().toISOString() },
    itemFields,
  );
}

export async function restoreItem(
  db: Db,
  userId: string,
  input: { itemId: string; version: number },
): Promise<VersionedResult> {
  return versioned(
    db,
    userId,
    "budget_items",
    input.itemId,
    input.version,
    { deleted_at: null },
    itemFields,
  );
}

export async function addPayment(
  db: Db,
  input: { itemId: string; payment: PaymentInput },
): Promise<ActionResult<{ paymentId: string }>> {
  const item = await db
    .from("budget_items")
    .select("wedding_id")
    .eq("id", input.itemId)
    .maybeSingle();
  if (item.error) return failure(item.error);
  if (!item.data) return failure({ message: "not_found" });
  const p = input.payment;
  const inserted = await db
    .from("payments")
    .insert({
      wedding_id: item.data.wedding_id,
      item_id: input.itemId,
      kind: p.kind,
      amount_cents: p.amountCents,
      due_date: p.dueDate,
      paid: p.paid,
      paid_on: p.paid ? p.paidOn : null,
    })
    .select("id")
    .single();
  return inserted.error
    ? failure(inserted.error)
    : { ok: true, data: { paymentId: inserted.data.id } };
}

export async function updatePayment(
  db: Db,
  userId: string,
  input: { paymentId: string; version: number; payment: PaymentInput },
): Promise<VersionedResult> {
  const p = input.payment;
  return versioned(
    db,
    userId,
    "payments",
    input.paymentId,
    input.version,
    {
      kind: p.kind,
      amount_cents: p.amountCents,
      due_date: p.dueDate,
      paid: p.paid,
      paid_on: p.paid ? p.paidOn : null,
    },
    paymentFields,
  );
}

export async function removePayment(
  db: Db,
  userId: string,
  input: { paymentId: string; version: number },
): Promise<VersionedResult> {
  return versioned(
    db,
    userId,
    "payments",
    input.paymentId,
    input.version,
    { deleted_at: new Date().toISOString() },
    paymentFields,
  );
}

export async function restorePayment(
  db: Db,
  userId: string,
  input: { paymentId: string; version: number },
): Promise<VersionedResult> {
  return versioned(
    db,
    userId,
    "payments",
    input.paymentId,
    input.version,
    { deleted_at: null },
    paymentFields,
  );
}
