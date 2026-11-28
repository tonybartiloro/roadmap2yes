import { createHash, randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { buildExportJson, type ExportInput } from "@/domain/export";
import {
  addPartnerB,
  anonClient,
  createUser,
  createWedding,
  serviceClient,
  signInAs,
  type TestClient,
  type TestPartnerB,
  type TestWedding,
} from "../support/supabase";
import { loadCatalog, loose, rows, TABLES, FUNCTIONS, type Catalog } from "./support/matrix";

/**
 * QA T17a: the forbidden-writes matrix THROUGH THE API (PostgREST + real JWTs), generated from the
 * catalog (OpenAPI served to the secret key) and checked against the oracle in support/matrix.ts.
 * SQL twin: supabase/tests/qa_catalog_matrix.test.sql + qa_cross_wedding.test.sql (pg_catalog level).
 * AC1, AC10, AC11, AC21. All emails are fake (@example.test).
 */

type Ids = {
  decision: string;
  optionFree: string;
  optionLoc: string;
  category: string;
  item: string;
  task: string;
  /** guests module (FEAT-2026-003): live and soft-deleted rows of each table */
  group: string;
  gtable: string;
  guest: string;
  deletedGroup: string;
  deletedTable: string;
  deletedGuest: string;
  /** a live guest whose group and table are soft-deleted (the pointer is kept) */
  memberOfDeleted: string;
};

const HASH_HEX = createHash("sha256").update(randomBytes(32)).digest("hex");
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const INSERT_ROWS: Record<string, (w: string, p: Ids, user: string) => Record<string, unknown>> = {
  decision_options: (w, p) => ({ decision_id: p.decision, wedding_id: w, title: "Extra" }),
  date_scenarios: (w, p) => ({
    option_id: p.optionFree,
    wedding_id: w,
    kind: "fixed",
    date_from: "2031-06-01",
  }),
  option_reactions: (w, p, u) => ({
    option_id: p.optionFree,
    wedding_id: w,
    user_id: u,
    reaction: "doubt",
  }),
  task_suggestion_dismissals: (w) => ({ wedding_id: w, template_key: "zzz-extra", kind: "add" }),
  tasks: (w) => ({ wedding_id: w, title: "Extra" }),
  budget_versions: (w) => ({ wedding_id: w, total_cents: 1 }),
  budget_categories: (w) => ({ wedding_id: w, name: "Extra" }),
  budget_items: (w, p) => ({ wedding_id: w, category_id: p.category, description: "Extra" }),
  payments: (w, p) => ({ wedding_id: w, item_id: p.item, amount_cents: 1 }),
  notification_preferences: (w, _p, u) => ({ user_id: u, wedding_id: w }),
  guest_groups: (w) => ({ wedding_id: w, name: "Extra" }),
  guest_tables: (w) => ({ wedding_id: w, name: "Extra" }),
  guests: (w) => ({ wedding_id: w, first_name: "Extra" }),
};
/** Parent column and parent id of each insertable child, to hang a W1 row from a W2 parent. */
const PARENT: Record<string, { column: string; pick: (ids: Ids) => string }> = {
  decision_options: { column: "decision_id", pick: (i) => i.decision },
  date_scenarios: { column: "option_id", pick: (i) => i.optionFree },
  option_reactions: { column: "option_id", pick: (i) => i.optionFree },
  budget_items: { column: "category_id", pick: (i) => i.category },
  payments: { column: "item_id", pick: (i) => i.item },
  guests: { column: "group_id", pick: (i) => i.group },
};

/**
 * One row in EVERY table of one wedding, as the real RPCs and (for system tables) the owner write it.
 * With `invite`, the wedding also holds a pending e-mail invitation carrying HASH_HEX (the secret).
 */
async function seed(w: TestWedding, label: string, invite: boolean): Promise<Ids> {
  const service = loose(serviceClient());
  const done = await w.founderClient.rpc("complete_onboarding", {
    p_scenarios: [{ kind: "fixed", date_from: day(200), label: "Settembre" }],
    p_tasks: [
      {
        template_key: "scegli-data-e-location",
        template_version: 1,
        title: "Scegliere data e location",
        offset: null,
      },
    ],
  });
  if (done.error) throw new Error(`complete_onboarding: ${done.error.message}`);
  await w.founderClient.rpc("record_seen");
  await w.founderClient.rpc("authorize_account_op", { p_op: "change_own_code" });
  if (invite) {
    const inviteeEmail = `${label}.invitee.${randomBytes(4).toString("hex")}@example.test`;
    await w.founderClient.rpc("upsert_partner_b", { p_email: inviteeEmail });
    const created = await w.founderClient.rpc("create_invitation", {
      p_email: inviteeEmail,
      p_method: "email",
      p_token_hash: `\\x${HASH_HEX}`,
    });
    if (created.error) throw new Error(`create_invitation: ${created.error.message}`);
  }

  const decisions = rows(
    await service.from("decisions").select("id,key").eq("wedding_id", w.weddingId),
  );
  const date = decisions.find((d) => d["key"] === "date")!["id"] as string;
  const location = decisions.find((d) => d["key"] === "location")!["id"] as string;
  const insertOne = async (table: string, row: Record<string, unknown>) => {
    const result = await service.from(table).insert(row).select();
    if (result.error) throw new Error(`seed ${table}: ${result.error.message}`);
    return rows(result)[0]!["id"] as string;
  };
  const optionLoc = await insertOne("decision_options", {
    decision_id: location,
    wedding_id: w.weddingId,
    title: "Villa Esempio",
  });
  const optionFree = await insertOne("decision_options", {
    decision_id: date,
    wedding_id: w.weddingId,
    title: "Libera",
  });
  await service
    .from("date_scenarios")
    .update({ location_option_id: optionLoc })
    .eq("wedding_id", w.weddingId);
  await insertOne("budget_versions", { wedding_id: w.weddingId, total_cents: 1_000_000 });
  const category = await insertOne("budget_categories", {
    wedding_id: w.weddingId,
    name: "Location",
    assigned_cents: 500_000,
  });
  const item = await insertOne("budget_items", {
    wedding_id: w.weddingId,
    category_id: category,
    description: "Villa",
    planned_cents: 400_000,
  });
  await insertOne("payments", {
    wedding_id: w.weddingId,
    item_id: item,
    kind: "deposit",
    amount_cents: 100_000,
  });
  await insertOne("option_reactions", {
    option_id: optionLoc,
    wedding_id: w.weddingId,
    user_id: w.founder.id,
    reaction: "prefer",
  });
  await service
    .from("notification_preferences")
    .insert({ user_id: w.founder.id, wedding_id: w.weddingId });
  await insertOne("task_suggestion_dismissals", {
    wedding_id: w.weddingId,
    template_key: "scegli-catering",
    kind: "add",
  });
  await service.from("notification_log").insert({
    wedding_id: w.weddingId,
    user_id: w.founder.id,
    kind: "reminder",
    batch_key: `qa-${w.weddingId}`,
    status: "sent",
    sent_at: new Date().toISOString(),
    claimed_at: new Date().toISOString(),
  });
  await service.from("heartbeats").insert({ source: `qa-rls-${label}` });
  // Guests: a live and a soft-deleted row per table (all invented). The member of the deleted group
  // and table is inserted while both are live, then they are deleted: the pointer stays.
  const group = await insertOne("guest_groups", {
    wedding_id: w.weddingId,
    name: "Famiglia Prova",
  });
  const deletedGroup = await insertOne("guest_groups", {
    wedding_id: w.weddingId,
    name: "Gruppo eliminato",
  });
  const gtable = await insertOne("guest_tables", {
    wedding_id: w.weddingId,
    name: "Tavolo 1",
    capacity: 8,
  });
  const deletedTable = await insertOne("guest_tables", {
    wedding_id: w.weddingId,
    name: "Tavolo eliminato",
  });
  const guest = await insertOne("guests", {
    wedding_id: w.weddingId,
    first_name: "Mario",
    group_id: group,
    table_id: gtable,
  });
  const memberOfDeleted = await insertOne("guests", {
    wedding_id: w.weddingId,
    first_name: "Membro",
    group_id: deletedGroup,
    table_id: deletedTable,
  });
  const deletedGuest = await insertOne("guests", {
    wedding_id: w.weddingId,
    first_name: "Eliminato",
  });
  // RSVP (FEAT-2026-004): a shared group link with its snapshot, and one answer (fake hash, fake values)
  const rsvpLinkId = randomUUID();
  const rsvpHash = `\\x${createHash("sha256").update(`qa-rls-rsvp-${label}-${rsvpLinkId}`).digest("hex")}`;
  for (const [table, row] of [
    [
      "rsvp_links",
      {
        id: rsvpLinkId,
        wedding_id: w.weddingId,
        group_id: group,
        shared_at: new Date().toISOString(),
        token_hash: rsvpHash,
      },
    ],
    [
      "rsvp_link_people",
      { link_id: rsvpLinkId, guest_id: guest, wedding_id: w.weddingId },
    ],
    [
      "rsvp_responses",
      { id: guest, wedding_id: w.weddingId, status: "yes", diet: ["vegan"], diet_note: "Nota finta" },
    ],
  ] as const) {
    const result = await service.from(table).insert(row);
    if (result.error) throw new Error(`seed ${table}: ${result.error.message}`);
  }
  for (const [table, id] of [
    ["guest_groups", deletedGroup],
    ["guest_tables", deletedTable],
    ["guests", deletedGuest],
  ] as const) {
    const removed = await service
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (removed.error) throw new Error(`seed soft delete ${table}: ${removed.error.message}`);
  }
  const task = rows(
    await service.from("tasks").select("id").eq("wedding_id", w.weddingId).limit(1),
  )[0]!["id"] as string;
  return {
    decision: date,
    optionFree,
    optionLoc,
    category,
    item,
    task,
    group,
    gtable,
    guest,
    deletedGroup,
    deletedTable,
    deletedGuest,
    memberOfDeleted,
  };
}

async function snapshot(wedding: string, label: string): Promise<Record<string, unknown>> {
  const service = loose(serviceClient());
  const out: Record<string, unknown> = {};
  for (const [table, spec] of Object.entries(TABLES)) {
    const key = table === "heartbeats" ? `qa-rls-${label}` : wedding;
    const result = await service.from(table).select("*").eq(spec.key, key);
    out[table] = rows(result).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return out;
}

describe("catalog matrix through the API (AC1, AC10, AC11, AC21)", () => {
  let catalog: Catalog;
  let w1: TestWedding;
  let w2: TestWedding;
  let b1: TestPartnerB;
  let stranger: { client: TestClient; id: string };
  let family: { client: TestClient; id: string };
  let ids1: Ids;
  let ids2: Ids;
  let before: Record<string, unknown>;
  /** Columns a user may read: every column except the hidden ones (`select *` on invitations is refused on purpose). */
  const readable = (table: string) =>
    (catalog.columns[table] ?? [])
      .filter((c) => !(TABLES[table]?.hidden ?? []).includes(c))
      .join(",");

  beforeAll(async () => {
    catalog = await loadCatalog();
    w1 = await createWedding("sposo");
    w2 = await createWedding("sposa");
    // W1 is a full two-partner wedding (B accepted); W2 holds a pending e-mail invitation with a secret hash
    b1 = await addPartnerB(w1);
    ids1 = await seed(w1, "w1", false);
    ids2 = await seed(w2, "w2", true);
    const outsider = await createUser();
    stranger = { client: await signInAs(outsider), id: outsider.id };
    const fam = await createUser();
    const { error } = await serviceClient()
      .from("memberships")
      .insert({ wedding_id: w1.weddingId, user_id: fam.id, role: "family" });
    if (error) throw new Error(`family membership: ${error.message}`);
    family = { client: await signInAs(fam), id: fam.id };
    before = await snapshot(w1.weddingId, "w1");
  }, 90_000);

  describe("completeness: nothing in public escapes the matrix", () => {
    it("every table exposed by PostgREST has a matrix entry, and every entry exists", () => {
      expect(catalog.tables).toEqual(Object.keys(TABLES).sort());
    });
    it("every function exposed by PostgREST has a matrix entry, and every entry exists", () => {
      expect(catalog.functions).toEqual(Object.keys(FUNCTIONS).sort());
    });
    it("`hidden` columns exist and the oracle's grant columns are real columns", () => {
      for (const [table, spec] of Object.entries(TABLES)) {
        const columns = catalog.columns[table] ?? [];
        for (const column of [...(spec.hidden ?? []), ...spec.insert, ...spec.update]) {
          expect(columns, `${table}.${column}`).toContain(column);
        }
        expect(columns, `${table} key column ${spec.key}`).toContain(spec.key);
      }
    });
  });

  describe("fixtures are not vacuous", () => {
    it.each(Object.entries(TABLES).filter(([, s]) => s.select))(
      "W1 founder sees rows of %s",
      async (table, spec) => {
        const result = await loose(w1.founderClient)
          .from(table)
          .select(readable(table))
          .eq(spec.key, w1.weddingId)
          .limit(1);
        expect(result.error, table).toBeNull();
        expect(rows(result).length, table).toBeGreaterThan(0);
      },
    );
  });

  describe("anonymous visitor (publishable key, no session)", () => {
    it.each(Object.entries(TABLES))(
      "%s: no SELECT / INSERT / UPDATE / DELETE",
      async (table, spec) => {
        const anon = loose(anonClient());
        const select = await anon.from(table).select("*").limit(1);
        expect(select.error?.code, `${table} select`).toBe("42501");
        expect(rows(select)).toEqual([]);
        expect(
          (await anon.from(table).insert({ [spec.key]: w1.weddingId })).error?.code,
          `${table} insert`,
        ).toBe("42501");
        expect(
          (
            await anon
              .from(table)
              .update({ [spec.key]: w1.weddingId })
              .eq(spec.key, w1.weddingId)
          ).error?.code,
          `${table} update`,
        ).toBe("42501");
        expect(
          (await anon.from(table).delete().eq(spec.key, w1.weddingId)).error?.code,
          `${table} delete`,
        ).toBe("42501");
      },
    );
  });

  describe.each([
    [
      "a member of another wedding (W2 founder)",
      () => ({ client: w2.founderClient, id: w2.founder.id }),
    ],
    ["a signed-in user with no membership", () => stranger],
    ["a `family` member of W1 (no permissions)", () => family],
  ])("%s attacks W1", (_label, actor) => {
    it.each(Object.entries(TABLES))(
      "%s: reads nothing; writes touch nothing",
      async (table, spec) => {
        const client = loose(actor().client);
        const select = await client.from(table).select(readable(table)).eq(spec.key, w1.weddingId);
        if (spec.tenancy === "service") {
          expect(select.error?.code, `${table} select`).toBe("42501");
        } else {
          expect(select.error, `${table} select`).toBeNull();
          expect(rows(select), `${table} select`).toEqual([]);
        }
        // UPDATE
        const patch = spec.update.length > 0 ? (spec.patch ?? {}) : { [spec.key]: w2.weddingId };
        const update = await client.from(table).update(patch).eq(spec.key, w1.weddingId).select();
        if (spec.update.length > 0) {
          expect(update.error, `${table} update`).toBeNull();
          expect(rows(update), `${table} update`).toEqual([]);
        } else {
          expect(update.error?.code, `${table} update`).toBe("42501");
        }
        // DELETE
        const del = await client.from(table).delete().eq(spec.key, w1.weddingId).select();
        if (spec.delete) {
          expect(del.error, `${table} delete`).toBeNull();
          expect(rows(del), `${table} delete`).toEqual([]);
        } else {
          expect(del.error?.code, `${table} delete`).toBe("42501");
        }
        // INSERT naming W1 (valid parents of W1, so the only reason to refuse is the wedding)
        const factory = INSERT_ROWS[table];
        const row = factory
          ? factory(w1.weddingId, ids1, actor().id)
          : { [spec.key]: w1.weddingId };
        const insert = await client.from(table).insert(row);
        expect(insert.error?.code, `${table} insert`).toBe("42501");
      },
    );
  });

  it("nothing of W1 changed under all those attacks (service-key snapshot, every table)", async () => {
    expect(await snapshot(w1.weddingId, "w1")).toEqual(before);
  });

  describe("a member (partner B of W1) and the matrix 3.1 columns", () => {
    it.each(Object.entries(TABLES).filter(([t]) => INSERT_ROWS[t]))(
      "%s: can INSERT the matrix columns into W1 (the payload is valid)",
      async (table) => {
        const result = await loose(b1.client)
          .from(table)
          .insert(INSERT_ROWS[table]!(w1.weddingId, ids1, b1.user.id));
        expect(result.error, table).toBeNull();
      },
    );

    it.each(Object.entries(TABLES).filter(([t]) => INSERT_ROWS[t]))(
      "%s: cannot INSERT a row naming wedding W2",
      async (table) => {
        const result = await loose(b1.client)
          .from(table)
          .insert(INSERT_ROWS[table]!(w2.weddingId, ids2, b1.user.id));
        expect(result.error?.code, table).toBe("42501");
      },
    );

    it.each(Object.keys(PARENT))(
      "%s: a row of W1 cannot hang from a parent of W2",
      async (table) => {
        const row = { ...INSERT_ROWS[table]!(w1.weddingId, ids1, b1.user.id) };
        row[PARENT[table]!.column] = PARENT[table]!.pick(ids2);
        const result = await loose(b1.client).from(table).insert(row);
        // composite FK (23503); date_scenarios' own trigger answers first (P0001)
        expect(result.error?.code, table).toBe(table === "date_scenarios" ? "P0001" : "23503");
      },
    );

    it("a date of W1 cannot link a location option of W2", async () => {
      const result = await loose(w1.founderClient)
        .from("date_scenarios")
        .update({ location_option_id: ids2.optionLoc })
        .eq("wedding_id", w1.weddingId);
      expect(result.error?.message).toBe("invalid_location");
    });

    it.each(Object.entries(TABLES))(
      "%s: the tenant key can never be changed (a row never moves between weddings)",
      async (table, spec) => {
        const result = await loose(w1.founderClient)
          .from(table)
          .update({ [spec.key]: w2.weddingId })
          .eq(spec.key, w1.weddingId);
        expect(result.error?.code, table).toBe("42501");
      },
    );

    it.each(Object.entries(TABLES).filter(([, s]) => s.update.length > 0))(
      "%s: version and created_by are not writable",
      async (table, spec) => {
        const columns = catalog.columns[table] ?? [];
        for (const column of [
          "version",
          "created_by",
          "created_at",
          "updated_by",
          "updated_at",
          "id",
        ]) {
          if (!columns.includes(column)) continue;
          const result = await loose(w1.founderClient)
            .from(table)
            .update({ [column]: column === "version" ? 99 : null })
            .eq(spec.key, w1.weddingId);
          expect(result.error?.code, `${table}.${column}`).toBe("42501");
        }
      },
    );

    it.each(Object.entries(TABLES).filter(([, s]) => !s.delete))(
      "%s: no hard DELETE even in the own wedding",
      async (table, spec) => {
        const result = await loose(w1.founderClient)
          .from(table)
          .delete()
          .eq(spec.key, w1.weddingId);
        expect(result.error?.code, table).toBe("42501");
      },
    );
  });

  describe("forbidden direct writes of plan 3.1 (own wedding)", () => {
    const direct: [
      string,
      string,
      "update" | "insert" | "delete",
      () => Record<string, unknown>,
    ][] = [
      ["decision_options.status", "decision_options", "update", () => ({ status: "chosen" })],
      ["decisions.status", "decisions", "update", () => ({ status: "taken" })],
      ["decisions.chosen_option_id", "decisions", "update", () => ({ chosen_option_id: null })],
      [
        "decision_events insert",
        "decision_events",
        "insert",
        () => ({ decision_id: ids1.decision, wedding_id: w1.weddingId, kind: "note" }),
      ],
      ["decision_events update", "decision_events", "update", () => ({ reason: "x" })],
      [
        "memberships insert",
        "memberships",
        "insert",
        () => ({
          wedding_id: w1.weddingId,
          user_id: b1.user.id,
          role: "partner",
          partner_slot: "B",
        }),
      ],
      ["memberships update", "memberships", "update", () => ({ role: "planner" })],
      [
        "account_events insert",
        "account_events",
        "insert",
        () => ({ wedding_id: w1.weddingId, kind: "temp_code_set", actor_id: w1.founder.id }),
      ],
      [
        "invitations insert",
        "invitations",
        "insert",
        () => ({ wedding_id: w1.weddingId, email: "x@example.test", method: "code" }),
      ],
      [
        "invitations update",
        "invitations",
        "update",
        () => ({ accepted_at: new Date().toISOString() }),
      ],
      [
        "wedding_partners.email",
        "wedding_partners",
        "update",
        () => ({ email: "someone.else@example.test" }),
      ],
      ["wedding_partners.user_id", "wedding_partners", "update", () => ({ user_id: b1.user.id })],
      [
        "weddings.applied_reference_date",
        "weddings",
        "update",
        () => ({ applied_reference_date: "2030-01-01" }),
      ],
      [
        "weddings.onboarding_completed_at",
        "weddings",
        "update",
        () => ({ onboarding_completed_at: new Date().toISOString() }),
      ],
      [
        "weddings.manual_reference_option_id",
        "weddings",
        "update",
        () => ({ manual_reference_option_id: ids1.optionLoc }),
      ],
      ["budget_versions update", "budget_versions", "update", () => ({ total_cents: 1 })],
      ["tasks.source", "tasks", "update", () => ({ source: "user" })],
      ["tasks.template_key", "tasks", "update", () => ({ template_key: "x" })],
      ["tasks.template_version", "tasks", "update", () => ({ template_version: 9 })],
      ["tasks.template_offset", "tasks", "update", () => ({ template_offset: null })],
      ["tasks.needs_review", "tasks", "update", () => ({ needs_review: true })],
      ["tasks.completed_at", "tasks", "update", () => ({ completed_at: new Date().toISOString() })],
      ["tasks.completed_by", "tasks", "update", () => ({ completed_by: null })],
      ["tasks.due_overridden", "tasks", "update", () => ({ due_overridden: true })],
      ["tasks.deleted_by", "tasks", "update", () => ({ deleted_by: null })],
      [
        "tasks insert template",
        "tasks",
        "insert",
        () => ({ wedding_id: w1.weddingId, title: "T", source: "template" }),
      ],
      [
        "tasks insert needs_review",
        "tasks",
        "insert",
        () => ({ wedding_id: w1.weddingId, title: "T", needs_review: true }),
      ],
      [
        "decision_options insert status",
        "decision_options",
        "insert",
        () => ({
          decision_id: ids1.decision,
          wedding_id: w1.weddingId,
          title: "T",
          status: "chosen",
        }),
      ],
      [
        "option_reactions.user_id update",
        "option_reactions",
        "update",
        () => ({ user_id: b1.user.id }),
      ],
      [
        "option_reactions insert for the other partner",
        "option_reactions",
        "insert",
        () => ({
          option_id: ids1.optionFree,
          wedding_id: w1.weddingId,
          user_id: w1.founder.id,
          reaction: "prefer",
        }),
      ],
    ];

    it.each(direct)("%s is refused (42501)", async (_name, table, op, payload) => {
      const client = loose(
        table === "option_reactions" && op === "insert" ? b1.client : w1.founderClient,
      );
      const spec = TABLES[table]!;
      const result =
        op === "insert"
          ? await client.from(table).insert(payload())
          : op === "update"
            ? await client.from(table).update(payload()).eq(spec.key, w1.weddingId)
            : await client.from(table).delete().eq(spec.key, w1.weddingId);
      expect(result.error?.code).toBe("42501");
    });

    it("tasks: editing due_date stamps due_overridden (the trigger, not the client)", async () => {
      const result = await loose(w1.founderClient)
        .from("tasks")
        .update({ due_date: "2031-01-15" })
        .eq("id", ids1.task)
        .select("due_date,due_overridden,version");
      expect(result.error).toBeNull();
      expect(rows(result)[0]).toMatchObject({ due_date: "2031-01-15", due_overridden: true });
    });

    it("tasks: status=done stamps completed_by/completed_at and deleted_at stamps deleted_by", async () => {
      const done = await loose(w1.founderClient)
        .from("tasks")
        .update({ status: "done" })
        .eq("id", ids1.task)
        .select("completed_by,completed_at");
      expect(rows(done)[0]).toMatchObject({ completed_by: w1.founder.id });
      expect(rows(done)[0]!["completed_at"]).not.toBeNull();
      const removed = await loose(w1.founderClient)
        .from("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", ids1.task)
        .select("deleted_by");
      expect(rows(removed)[0]).toMatchObject({ deleted_by: w1.founder.id });
    });

    it("a partner cannot change or delete the other partner's reaction, nor read the other's own-row state", async () => {
      const reactions = rows(
        await loose(b1.client)
          .from("option_reactions")
          .select("id,user_id")
          .eq("user_id", w1.founder.id),
      );
      expect(reactions.length).toBeGreaterThan(0); // reactions are shared by design
      const update = await loose(b1.client)
        .from("option_reactions")
        .update({ reaction: "doubt" })
        .eq("user_id", w1.founder.id)
        .select();
      expect(rows(update)).toEqual([]);
      const del = await loose(b1.client)
        .from("option_reactions")
        .delete()
        .eq("user_id", w1.founder.id)
        .select();
      expect(rows(del)).toEqual([]);
      // record_seen made a user_wedding_state row for the founder only
      expect(
        rows(
          await loose(b1.client)
            .from("user_wedding_state")
            .select("user_id")
            .eq("user_id", w1.founder.id),
        ),
      ).toEqual([]);
      expect(
        rows(
          await loose(b1.client)
            .from("notification_preferences")
            .select("user_id")
            .eq("user_id", w1.founder.id),
        ),
      ).toEqual([]);
    });

    it("a `family` member cannot use the partner RPCs either", async () => {
      const op = await family.client.rpc("authorize_account_op", {
        p_op: "set_temp_code",
        p_target_slot: "B",
      });
      expect(op.data).toMatchObject({ allowed: false, error: "not_partner" });
      expect(
        (
          await family.client.rpc("create_invitation", {
            p_email: "qa.family@example.test",
            p_method: "code",
          })
        ).error,
      ).not.toBeNull();
      expect(
        (await family.client.rpc("upsert_partner_b", { p_email: "qa.family@example.test" })).error,
      ).not.toBeNull();
    });
  });

  describe("secrets: token_hash never leaves the database", () => {
    it("`select *` on invitations and an explicit token_hash select are refused; the safe columns work", async () => {
      expect((await w1.founderClient.from("invitations").select("*")).error?.code).toBe("42501");
      expect((await w1.founderClient.from("invitations").select("token_hash")).error?.code).toBe(
        "42501",
      );
      expect(
        (await w1.founderClient.from("invitations").select("id,email,method,accepted_at")).error,
      ).toBeNull();
    });

    it("audit_log (invitations audited, not vacuous) carries neither the key nor the hash value", async () => {
      // W2 holds the pending e-mail invitation whose token_hash is HASH_HEX
      const { data } = await serviceClient()
        .from("audit_log")
        .select("old_data,new_data")
        .eq("table_name", "invitations")
        .eq("wedding_id", w2.weddingId);
      expect(data?.length).toBeGreaterThan(0);
      const text = JSON.stringify(data);
      expect(text).not.toMatch(/token_hash/i);
      expect(text).not.toContain(HASH_HEX);
    });

    it("the export built from what a partner can read has no token_hash, not even from a poisoned event payload", async () => {
      // A hostile/buggy writer puts a token_hash in an event payload: the export must still drop it.
      await serviceClient()
        .from("decision_events")
        .insert({
          decision_id: ids1.decision,
          wedding_id: w1.weddingId,
          kind: "note",
          payload: { token_hash: HASH_HEX, note: "ok" },
        });
      const read = async (table: string) =>
        rows(
          await loose(b1.client)
            .from(table)
            .select(readable(table))
            .eq(TABLES[table]!.key, w1.weddingId),
        );
      const input: ExportInput = {
        wedding: (await read("weddings"))[0]!,
        partners: await read("wedding_partners"),
        decisions: await read("decisions"),
        decisionOptions: [],
        decisionEvents: await read("decision_events"),
        dateScenarios: [],
        tasks: [],
        budgetVersions: [],
        budgetCategories: [],
        budgetItems: [],
        payments: [],
        guests: [],
        guestGroups: [],
        guestTables: [],
      };
      const json = buildExportJson(input, new Date("2026-11-25T10:00:00Z"));
      expect(json).not.toMatch(/token_hash/i);
      expect(json).not.toContain(HASH_HEX);
      expect(json).toContain('"note": "ok"'); // the rest of the payload survives
    });
  });

  describe("guests: hard DELETE only on soft-deleted rows, with guests/delete (ADR-0002, AC11, AC13)", () => {
    const soft = Object.entries(TABLES).filter(([, s]) => s.delete === "soft_deleted");
    const liveOf = (t: string) =>
      ({ guests: ids1.guest, guest_groups: ids1.group, guest_tables: ids1.gtable })[t]!;
    const deletedOf = (t: string) =>
      ({
        guests: ids1.deletedGuest,
        guest_groups: ids1.deletedGroup,
        guest_tables: ids1.deletedTable,
      })[t]!;
    const survives = async (table: string, id: string) =>
      rows(await loose(serviceClient()).from(table).select("id").eq("id", id)).length === 1;

    it("the oracle lists the three guests tables as soft_deleted", () => {
      expect(soft.map(([t]) => t).sort()).toEqual(["guest_groups", "guest_tables", "guests"]);
    });

    it.each(soft)(
      "%s: DELETE on a live row removes nothing (even for the partner)",
      async (table) => {
        const result = await loose(w1.founderClient)
          .from(table)
          .delete()
          .eq("id", liveOf(table))
          .select();
        expect(result.error, table).toBeNull();
        expect(rows(result), table).toEqual([]);
        expect(await survives(table, liveOf(table)), table).toBe(true);
      },
    );

    it.each(soft)(
      "%s: a family member and another wedding cannot delete a soft-deleted row",
      async (table) => {
        for (const client of [family.client, w2.founderClient, stranger.client]) {
          const result = await loose(client)
            .from(table)
            .delete()
            .eq("id", deletedOf(table))
            .select();
          expect(rows(result), table).toEqual([]);
        }
        expect(await survives(table, deletedOf(table)), table).toBe(true);
      },
    );

    it("restoring a deleted guest makes it undeletable again", async () => {
      const mine = loose(w1.founderClient);
      const created = rows(
        await mine
          .from("guests")
          .insert({ wedding_id: w1.weddingId, first_name: "Ripensato" })
          .select("id"),
      )[0]!["id"] as string;
      const stamp = new Date().toISOString();
      await mine.from("guests").update({ deleted_at: stamp }).eq("id", created);
      await mine.from("guests").update({ deleted_at: null }).eq("id", created);
      const result = await mine.from("guests").delete().eq("id", created).select();
      expect(rows(result)).toEqual([]);
      expect(await survives("guests", created)).toBe(true);
    });

    it.each(soft)("%s: the partner deletes a soft-deleted row for good", async (table) => {
      const result = await loose(w1.founderClient)
        .from(table)
        .delete()
        .eq("id", deletedOf(table))
        .select("id");
      expect(result.error, table).toBeNull();
      expect(rows(result), table).toHaveLength(1);
      expect(await survives(table, deletedOf(table)), table).toBe(false);
    });

    it("deleting a group or a table for good frees its members and nothing else", async () => {
      const member = rows(
        await loose(serviceClient())
          .from("guests")
          .select("id,wedding_id,group_id,table_id,deleted_at")
          .eq("id", ids1.memberOfDeleted),
      )[0]!;
      expect(member["group_id"]).toBeNull();
      expect(member["table_id"]).toBeNull();
      expect(member["wedding_id"]).toBe(w1.weddingId);
      expect(member["deleted_at"]).toBeNull();
    });
  });
});
