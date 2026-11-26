import { randomUUID } from "node:crypto";
import { stackEnv } from "../../support/supabase";

/**
 * ORACLE of the PostgREST-level matrix (plan 3.1) and the CATALOG it is checked against.
 *
 * The catalog is read from PostgREST's own OpenAPI document served to the SECRET key (it lists every
 * table and every function of `public`, nothing else): `GET /rest/v1/`. The same oracle exists in SQL
 * (`supabase/tests/qa_catalog_matrix.test.sql`, which reads pg_catalog). Rule: a table or function
 * in `public` without an entry here fails `rls-api.test.ts` / `grants.test.ts`, so a new entity can
 * never ship without someone deciding what a user may do with it.
 */

export type Tenancy = "wedding" | "own" | "service";

export type TableSpec = {
  tenancy: Tenancy;
  /** Column holding the wedding id (`id` for weddings, `source` for the system table). */
  key: string;
  /** Can an authenticated member of the wedding read it (with the right permission)? */
  select: boolean;
  /** Columns that must NOT be selectable. */
  hidden?: readonly string[];
  /** Columns a user may INSERT / UPDATE (exactly). */
  insert: readonly string[];
  update: readonly string[];
  /**
   * DELETE allowed for authenticated: `true` = own rows (option_reactions), `"soft_deleted"` = the
   * wedding's rows, but ONLY the ones already soft-deleted (`deleted_at is not null`, with the
   * `guests/delete` permission: ADR-0002); on a live row the DELETE removes nothing.
   */
  delete: boolean | "soft_deleted";
  /** Patch for a granted column, used to attack foreign rows (never applied to a row we own). */
  patch?: Record<string, unknown>;
};

export const TABLES: Record<string, TableSpec> = {
  weddings: {
    tenancy: "wedding",
    key: "id",
    select: true,
    insert: [],
    delete: false,
    update: [
      "comune",
      "guest_band",
      "onboarding_answers",
      "onboarding_unknown",
      "region",
      "rite",
      "style_label",
      "style_note",
      "theme_id",
    ],
    patch: { comune: "Hacked" },
  },
  wedding_partners: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    insert: [],
    update: ["first_name", "label", "last_name"],
    delete: false,
    patch: { label: "Hacked" },
  },
  memberships: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    insert: [],
    update: [],
    delete: false,
  },
  user_wedding_state: {
    tenancy: "own",
    key: "wedding_id",
    select: true,
    insert: [],
    update: [],
    delete: false,
  },
  account_events: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    insert: [],
    update: [],
    delete: false,
  },
  invitations: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    hidden: ["token_hash"],
    insert: [],
    update: [],
    delete: false,
  },
  audit_log: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    insert: [],
    update: [],
    delete: false,
  },
  heartbeats: {
    tenancy: "service",
    key: "source",
    select: false,
    insert: [],
    update: [],
    delete: false,
  },
  notification_log: {
    tenancy: "service",
    key: "wedding_id",
    select: false,
    insert: [],
    update: [],
    delete: false,
  },
  decisions: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    insert: [],
    update: ["question"],
    delete: false,
    patch: { question: "Hacked" },
  },
  decision_options: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    delete: false,
    insert: [
      "comune",
      "cons",
      "cost_cents",
      "decision_id",
      "link",
      "notes",
      "pros",
      "title",
      "wedding_id",
    ],
    update: ["comune", "cons", "cost_cents", "deleted_at", "link", "notes", "pros", "title"],
    patch: { title: "Hacked" },
  },
  date_scenarios: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    delete: false,
    insert: ["date_from", "date_to", "kind", "location_option_id", "option_id", "wedding_id"],
    update: ["date_from", "date_to", "kind", "location_option_id"],
    patch: { date_from: "2039-01-01" },
  },
  decision_events: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    insert: [],
    update: [],
    delete: false,
  },
  option_reactions: {
    tenancy: "own",
    key: "wedding_id",
    select: true,
    delete: true,
    insert: ["option_id", "reaction", "user_id", "wedding_id"],
    update: ["reaction"],
    patch: { reaction: "doubt" },
  },
  task_suggestion_dismissals: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    insert: ["kind", "template_key", "wedding_id"],
    update: [],
    delete: false,
  },
  tasks: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    delete: false,
    insert: [
      "assignee",
      "category",
      "due_date",
      "notes",
      "reminders_enabled",
      "title",
      "wedding_id",
    ],
    update: [
      "assignee",
      "category",
      "deleted_at",
      "due_date",
      "notes",
      "reminders_enabled",
      "status",
      "title",
    ],
    patch: { title: "Hacked" },
  },
  budget_versions: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    insert: ["reason", "total_cents", "wedding_id"],
    update: [],
    delete: false,
  },
  budget_categories: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    delete: false,
    insert: ["assigned_cents", "default_key", "name", "sort_order", "wedding_id"],
    update: ["assigned_cents", "deleted_at", "name", "sort_order"],
    patch: { name: "Hacked" },
  },
  budget_items: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    delete: false,
    insert: ["agreed_cents", "category_id", "description", "planned_cents", "status", "wedding_id"],
    update: ["agreed_cents", "deleted_at", "description", "planned_cents", "status"],
    patch: { description: "Hacked" },
  },
  payments: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    delete: false,
    insert: ["amount_cents", "due_date", "item_id", "kind", "paid", "paid_on", "wedding_id"],
    update: ["amount_cents", "deleted_at", "due_date", "kind", "paid", "paid_on"],
    patch: { kind: "other" },
  },
  notification_preferences: {
    tenancy: "own",
    key: "wedding_id",
    select: true,
    delete: false,
    insert: ["digest_enabled", "reminders_enabled", "user_id", "wedding_id"],
    update: ["digest_enabled", "reminders_enabled"],
    patch: { digest_enabled: false },
  },
  guest_groups: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    delete: "soft_deleted",
    insert: ["name", "wedding_id"],
    update: ["deleted_at", "name", "rsvp_mode"],
    patch: { name: "Hacked" },
  },
  guest_tables: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    delete: "soft_deleted",
    insert: ["capacity", "name", "pos_x", "pos_y", "shape", "wedding_id"],
    update: ["capacity", "deleted_at", "name", "pos_x", "pos_y", "shape"],
    patch: { name: "Hacked" },
  },
  guests: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    delete: "soft_deleted",
    insert: [
      "category",
      "email",
      "first_name",
      "group_id",
      "last_name",
      "notes",
      "phone",
      "side",
      "table_id",
      "wedding_id",
    ],
    update: [
      "category",
      "deleted_at",
      "email",
      "first_name",
      "group_id",
      "last_name",
      "notes",
      "phone",
      "side",
      "table_id",
    ],
    patch: { first_name: "Hacked" },
  },
  // FEAT-2026-004: SELECT-only (every write goes through the RPCs); token_hash is never readable.
  rsvp_links: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    hidden: ["token_hash"],
    insert: [],
    update: [],
    delete: false,
  },
  rsvp_link_people: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    insert: [],
    update: [],
    delete: false,
  },
  rsvp_responses: {
    tenancy: "wedding",
    key: "wedding_id",
    select: true,
    insert: [],
    update: [],
    delete: false,
  },
};

/**
 * 'user'    = EXECUTE for `authenticated` (plan 3.1 allowlist; `has_permission` and `move_budget_items`
 *             were added and accepted in the T2/T9 reviews).
 * 'service' = the secret key only.
 */
export const FUNCTIONS: Record<string, "user" | "service"> = {
  create_wedding: "user",
  complete_onboarding: "user",
  accept_pending_invitation: "user",
  create_invitation: "user",
  rotate_invitation: "user",
  revoke_invitation: "user",
  upsert_partner_b: "user",
  update_partner_email: "user",
  sync_my_email: "user",
  authorize_account_op: "user",
  choose_option: "user",
  reopen_decision: "user",
  add_decision_note: "user",
  set_reference_scenario: "user",
  acknowledge_task_review: "user",
  insert_template_tasks: "user",
  record_seen: "user",
  record_export: "user",
  dismiss_welcome: "user",
  last_heartbeat: "user",
  has_permission: "user",
  move_budget_items: "user",
  create_guest_family: "user",
  guests_bulk: "user",
  guests_bulk_undo: "user",
  import_guests: "user",
  undo_guest_import: "user",
  rsvp_status: "user",
  rsvp_create_links: "user",
  rsvp_rotate_link: "user",
  rsvp_revoke_link: "user",
  rsvp_mark_shared: "user",
  rsvp_unmark_shared: "user",
  record_heartbeat: "service",
  login_gate: "service",
  login_record: "service",
  auth_user_id_by_email: "service",
  invitation_by_token: "service",
  sync_timeline: "service",
  job_claim_notification: "service",
  job_fail_notification: "service",
  job_mark_notification_sent: "service",
  job_quota_status: "service",
  job_recipients: "service",
  job_sent_item_keys: "service",
  job_unsubscribe: "service",
};

type OpenApiProperty = { format?: string; type?: string; items?: { type?: string } };
type OpenApi = {
  paths: Record<
    string,
    {
      post?: {
        parameters?: {
          in?: string;
          schema?: { properties?: Record<string, OpenApiProperty>; required?: string[] };
        }[];
      };
    }
  >;
  definitions?: Record<string, { properties?: Record<string, unknown> }>;
};

export type Catalog = {
  tables: string[];
  functions: string[];
  columns: Record<string, string[]>;
  /** Required arguments (with a dummy value each) per function, from the OpenAPI body schema. */
  args: Record<string, Record<string, unknown>>;
  raw: OpenApi;
};

/** OpenAPI document as seen by `key` (publishable/secret key as apikey, optional user JWT). */
export async function fetchOpenApi(apikey: string, jwt?: string): Promise<OpenApi> {
  const { url } = stackEnv();
  const response = await fetch(`${url}/rest/v1/`, {
    headers: { apikey, ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
  });
  if (!response.ok) throw new Error(`OpenAPI request failed: ${response.status}`);
  return (await response.json()) as OpenApi;
}

function dummyValue(property: OpenApiProperty): unknown {
  switch (property.format) {
    case "uuid":
      return randomUUID();
    case "bytea":
      return `\\x${"00".repeat(32)}`;
    case "int32":
    case "int64":
    case "integer":
    case "bigint":
      return 1;
    case "boolean":
      return true;
    case "date":
      return "2030-01-01";
    case "timestamp with time zone":
      return new Date().toISOString();
    case "jsonb":
    case "json":
      return [];
    case "text[]":
      return [];
    default:
      return property.type === "array" ? [] : "probe";
  }
}

export function catalogFromOpenApi(raw: OpenApi): Catalog {
  const tables: string[] = [];
  const functions: string[] = [];
  const args: Catalog["args"] = {};
  for (const [path, item] of Object.entries(raw.paths)) {
    if (path === "/") continue;
    if (path.startsWith("/rpc/")) {
      const name = path.slice(5);
      functions.push(name);
      const schema = item.post?.parameters?.find((p) => p.in === "body")?.schema;
      args[name] = Object.fromEntries(
        (schema?.required ?? []).map((arg) => [arg, dummyValue(schema?.properties?.[arg] ?? {})]),
      );
    } else {
      tables.push(path.slice(1));
    }
  }
  const columns = Object.fromEntries(
    Object.entries(raw.definitions ?? {}).map(([name, def]) => [
      name,
      Object.keys(def.properties ?? {}),
    ]),
  );
  return { tables: tables.sort(), functions: functions.sort(), columns, args, raw };
}

/** Catalog of `public` as the secret key sees it. */
export async function loadCatalog(): Promise<Catalog> {
  return catalogFromOpenApi(await fetchOpenApi(stackEnv().secretKey));
}

/** supabase-js cannot type a table name known only at runtime: this is the narrow loose shape. */
export type LooseResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
  status: number;
};
export type LooseBuilder = PromiseLike<LooseResult> & {
  select: (columns?: string) => LooseBuilder;
  eq: (column: string, value: unknown) => LooseBuilder;
  neq: (column: string, value: unknown) => LooseBuilder;
  limit: (n: number) => LooseBuilder;
  maybeSingle: () => LooseBuilder;
};
export type LooseClient = {
  from: (table: string) => LooseBuilder & {
    insert: (row: unknown) => LooseBuilder;
    update: (patch: unknown) => LooseBuilder;
    delete: () => LooseBuilder;
  };
  rpc: (fn: string, args?: unknown) => PromiseLike<LooseResult>;
  schema: (name: string) => LooseClient;
};

export const loose = (client: unknown): LooseClient => client as LooseClient;

export const rows = (result: LooseResult): Record<string, unknown>[] =>
  (result.data as Record<string, unknown>[] | null) ?? [];
