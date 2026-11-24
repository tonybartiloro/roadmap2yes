import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { todayInRome, type PlainDate } from "@/lib/dates/plain-date";
import type { AuditEntry, DecisionEventEntry, DecisionEventKind } from "@/domain/news";
import type { PlanPayment, PlanTask } from "@/domain/reminders";
import type {
  ClaimResult,
  ClaimStatus,
  JobDb,
  JobRecipient,
  QuotaStatus,
  WeddingJobData,
} from "./types";

/**
 * `JobDb` over Supabase. It receives an already built client (the secret-key one, from
 * `admin-job-db.ts` or from the tests), so this module never imports the admin client itself.
 * Reads go straight to the tables (service role bypasses RLS); the ledger is only touched through
 * the `job_*` functions.
 */

const DAY_MS = 86_400_000;
/** Audit window: the digest looks back 7 days, and so does the due-date-change check (D38). */
const AUDIT_DAYS = 7;
const PAGE_LIMIT = 1000;
const AUDIT_TABLES = ["tasks", "budget_versions", "payments"] as const;

const CLAIM_STATUSES: readonly ClaimStatus[] = [
  "claimed",
  "resumed",
  "in_progress",
  "already_sent",
  "skipped_quota",
  "opted_out",
  "failed_final",
];

class JobDbError extends Error {
  readonly code: string | undefined;
  constructor(code: string | undefined) {
    super("database error");
    this.name = "JobDbError";
    this.code = code;
  }
}

function unwrap<T>(result: { data: T | null; error: { code?: string } | null }): T {
  if (result.error) throw new JobDbError(result.error.code);
  if (result.data === null) throw new JobDbError("no_data");
  return result.data;
}

/** Reads every page of an ordered query (`max_rows` truncates a single response silently). */
export async function allPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { code?: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_LIMIT) {
    const rows = unwrap(await page(from, from + PAGE_LIMIT - 1));
    all.push(...rows);
    if (rows.length < PAGE_LIMIT) return all;
  }
}

function asObject(value: Json | undefined): Record<string, Json | undefined> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const num = (value: Json | undefined): number => (typeof value === "number" ? value : 0);

export function createSupabaseJobDb(client: SupabaseClient<Database>): JobDb {
  return {
    async syncTimeline() {
      return unwrap(await client.rpc("sync_timeline", {}));
    },

    async recordHeartbeat(details) {
      const { error } = await client.rpc("record_heartbeat", {
        p_source: "daily_job",
        p_details: details as Json,
      });
      if (error) throw new JobDbError(error.code);
    },

    async recipients() {
      // PostgREST caps every response at `max_rows` (1000): page through ALL recipients, or the
      // ones past the cap would silently never get an email. `job_recipients` is ordered.
      const rows = await allPages((from, to) => client.rpc("job_recipients").range(from, to));
      // Day each partner joined (for B: the first login), to avoid catch-up at entry (D44).
      const joined = new Map<string, PlainDate>();
      const memberships = await allPages((from, to) =>
        client
          .from("memberships")
          .select("wedding_id, user_id, created_at")
          .eq("role", "partner")
          .order("wedding_id")
          .order("user_id")
          .range(from, to),
      );
      for (const m of memberships) {
        joined.set(`${m.wedding_id}:${m.user_id}`, todayInRome(new Date(m.created_at)));
      }
      return rows
        .filter((r) => r.partner_slot === "A" || r.partner_slot === "B")
        .map((r): JobRecipient => ({
          weddingId: r.wedding_id,
          userId: r.user_id,
          slot: r.partner_slot as "A" | "B",
          email: r.email,
          firstName: r.first_name,
          label: r.label,
          remindersEnabled: r.reminders_enabled,
          digestEnabled: r.digest_enabled,
          ...(joined.has(`${r.wedding_id}:${r.user_id}`)
            ? { joinedOn: joined.get(`${r.wedding_id}:${r.user_id}`)! }
            : {}),
        }));
    },

    async loadWeddingData(weddingId, now) {
      return loadWeddingData(client, weddingId, now);
    },

    async doneItemKeys(userId, exceptBatchKey, since) {
      const rows = unwrap(
        await client
          .from("notification_log")
          .select("item_keys")
          .eq("user_id", userId)
          .eq("kind", "reminder")
          .in("status", ["claimed", "sent"])
          .neq("batch_key", exceptBatchKey)
          .gte("claimed_at", since.toISOString())
          .limit(PAGE_LIMIT),
      );
      return rows.flatMap((r) => r.item_keys);
    },

    async claim(request) {
      const data = unwrap(
        await client.rpc("job_claim_notification", {
          p_user_id: request.userId,
          p_wedding_id: request.weddingId,
          p_kind: request.kind,
          p_batch_key: request.batchKey,
          p_item_keys: [...request.itemKeys],
          p_daily_cap: request.dailyCap,
          p_monthly_cap: request.monthlyCap,
          p_now: request.now.toISOString(),
        }),
      );
      const row = asObject(data);
      const status = row["status"];
      if (typeof status !== "string" || !CLAIM_STATUSES.includes(status as ClaimStatus)) {
        throw new JobDbError("bad_claim_status");
      }
      const result: ClaimResult = {
        status: status as ClaimStatus,
        ...(typeof row["id"] === "number" ? { id: row["id"] } : {}),
        ...(row["reason"] === "daily" || row["reason"] === "monthly"
          ? { reason: row["reason"] }
          : {}),
      };
      return result;
    },

    async markSent(id, now) {
      unwrap(
        await client.rpc("job_mark_notification_sent", { p_id: id, p_now: now.toISOString() }),
      );
    },

    async fail(id, error) {
      unwrap(await client.rpc("job_fail_notification", { p_id: id, p_error: error }));
    },

    async quotaStatus(now) {
      const row = asObject(
        unwrap(await client.rpc("job_quota_status", { p_now: now.toISOString() })),
      );
      const status: QuotaStatus = {
        sentToday: num(row["sent_today"]),
        sentMonth: num(row["sent_month"]),
        skippedToday: num(row["skipped_today"]),
        skippedMonth: num(row["skipped_month"]),
      };
      return status;
    },
  };
}

async function loadWeddingData(
  client: SupabaseClient<Database>,
  weddingId: string,
  now: Date,
): Promise<WeddingJobData> {
  const since = new Date(now.getTime() - AUDIT_DAYS * DAY_MS).toISOString();

  const [taskRows, paymentRows, decisionRows, partnerRows, auditRows, eventRows] =
    await Promise.all([
      client
        .from("tasks")
        .select("id, title, due_date, status, assignee, reminders_enabled, deleted_at")
        .eq("wedding_id", weddingId)
        .is("deleted_at", null)
        .eq("status", "todo")
        .not("due_date", "is", null)
        .limit(PAGE_LIMIT),
      client
        .from("payments")
        .select("id, item_id, amount_cents, due_date, paid, deleted_at")
        .eq("wedding_id", weddingId)
        .is("deleted_at", null)
        .eq("paid", false)
        .not("due_date", "is", null)
        .limit(PAGE_LIMIT),
      client
        .from("decisions")
        .select("status")
        .eq("wedding_id", weddingId)
        .eq("key", "date")
        .maybeSingle(),
      client
        .from("wedding_partners")
        .select("user_id, first_name, last_name, label")
        .eq("wedding_id", weddingId),
      client
        .from("audit_log")
        .select("id, at, actor_id, table_name, op, old_data, new_data")
        .eq("wedding_id", weddingId)
        .in("table_name", [...AUDIT_TABLES])
        .gte("at", since)
        .order("at", { ascending: false })
        .limit(PAGE_LIMIT),
      client
        .from("decision_events")
        .select("id, at, kind, actor_id, decision_id, option_id, payload")
        .eq("wedding_id", weddingId)
        .gte("at", since)
        .order("at", { ascending: false })
        .limit(PAGE_LIMIT),
    ]);

  const tasks = unwrap(taskRows).map((t): PlanTask => ({
    id: t.id,
    title: t.title,
    dueDate: t.due_date,
    status: t.status === "done" ? "done" : "todo",
    assignee: t.assignee === "A" || t.assignee === "B" ? t.assignee : "both",
    remindersEnabled: t.reminders_enabled,
    deletedAt: t.deleted_at,
  }));

  const rawPayments = unwrap(paymentRows);
  const itemIds = [...new Set(rawPayments.map((p) => p.item_id))];
  const items = new Map<string, { description: string; deleted: boolean }>();
  if (itemIds.length > 0) {
    const rows = unwrap(
      await client
        .from("budget_items")
        .select("id, description, deleted_at")
        .eq("wedding_id", weddingId)
        .in("id", itemIds),
    );
    for (const r of rows)
      items.set(r.id, { description: r.description, deleted: r.deleted_at !== null });
  }
  const payments = rawPayments.map((p): PlanPayment => ({
    id: p.id,
    description: items.get(p.item_id)?.description ?? "Pagamento",
    amountCents: p.amount_cents,
    dueDate: p.due_date,
    paid: p.paid,
    deletedAt: p.deleted_at,
    itemDeleted: items.get(p.item_id)?.deleted ?? true,
  }));

  const decision = decisionRows.error ? null : decisionRows.data;
  if (decisionRows.error) throw new JobDbError(decisionRows.error.code);
  const dateDecided = decision?.status === "taken";

  const people = unwrap(partnerRows)
    .filter((p): p is typeof p & { user_id: string } => p.user_id !== null)
    .map((p) => ({
      userId: p.user_id,
      firstName: p.first_name,
      lastName: p.last_name,
      label: p.label,
    }));

  const audit: AuditEntry[] = unwrap(auditRows).map((a) => ({
    id: a.id,
    at: a.at,
    actorId: a.actor_id,
    tableName: a.table_name,
    op: a.op as AuditEntry["op"],
    oldData: a.old_data as Record<string, unknown> | null,
    newData: a.new_data as Record<string, unknown> | null,
  }));

  return {
    tasks,
    payments,
    dateDecided,
    dueChangedOn: dueChanges(audit),
    people,
    audit,
    decisionEvents: await decisionEvents(client, weddingId, unwrap(eventRows)),
  };
}

/** Rome date of the latest set/change of `due_date` per task (INSERT with a date, or UPDATE that moves it). */
export function dueChanges(audit: readonly AuditEntry[]): Map<string, PlainDate> {
  const latest = new Map<string, { at: number; date: PlainDate }>();
  for (const entry of audit) {
    if (entry.tableName !== "tasks") continue;
    const next = entry.newData?.["due_date"];
    const prev = entry.oldData?.["due_date"];
    const taskId = entry.newData?.["id"];
    if (typeof taskId !== "string" || typeof next !== "string") continue;
    const changed = entry.op === "INSERT" || (entry.op === "UPDATE" && next !== prev);
    if (!changed) continue;
    const at = new Date(entry.at).getTime();
    if (at > (latest.get(taskId)?.at ?? -Infinity)) {
      latest.set(taskId, { at, date: todayInRome(new Date(entry.at)) });
    }
  }
  return new Map([...latest].map(([id, v]) => [id, v.date]));
}

async function decisionEvents(
  client: SupabaseClient<Database>,
  weddingId: string,
  events: readonly {
    id: number;
    at: string;
    kind: string;
    actor_id: string | null;
    decision_id: string;
    option_id: string | null;
    payload: Json;
  }[],
): Promise<DecisionEventEntry[]> {
  if (events.length === 0) return [];
  const decisionIds = [...new Set(events.map((e) => e.decision_id))];
  const optionIds = [...new Set(events.flatMap((e) => (e.option_id ? [e.option_id] : [])))];
  const [decisions, options] = await Promise.all([
    client.from("decisions").select("id, key").eq("wedding_id", weddingId).in("id", decisionIds),
    optionIds.length > 0
      ? client
          .from("decision_options")
          .select("id, title")
          .eq("wedding_id", weddingId)
          .in("id", optionIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
  ]);
  const keys = new Map(unwrap(decisions).map((d) => [d.id, d.key]));
  const titles = new Map(unwrap(options).map((o) => [o.id, o.title]));
  return events.map((e) => {
    const referenceDate = asObject(e.payload)["reference_date"];
    return {
      id: e.id,
      at: e.at,
      kind: e.kind as DecisionEventKind,
      actorId: e.actor_id,
      decisionKey: keys.get(e.decision_id) ?? "",
      optionTitle: e.option_id ? (titles.get(e.option_id) ?? null) : null,
      referenceDate: typeof referenceDate === "string" ? referenceDate : null,
    };
  });
}
