import { randomBytes, randomUUID } from "node:crypto";
import { DEFAULT_BUDGET_CATEGORIES } from "@/content/budget-categories";
import { getMilestone, type Rite } from "@/content/milestones";
import { generateTasks } from "@/domain/timeline";
import { deriveRsvpToken, hashRsvpToken } from "@/features/rsvp/token";
import {
  addPartnerB,
  createUser,
  createWedding,
  serviceClient,
  signInAs,
  type TestClient,
  type TestPartnerB,
  type TestUser,
  type TestWedding,
} from "../../tests/support/supabase";

/**
 * Seeds a COMPLETED wedding through the same RPCs the app uses (complete_onboarding with the real
 * milestone catalogue, the 11 default budget categories, the first budget version), so the e2e
 * specs can test one screen without driving the 8-step onboarding each time (that one has its own
 * spec). Fake `@example.test` data only.
 */
export type SeedScenario = {
  kind: "fixed" | "period";
  date_from: string;
  date_to?: string;
  label?: string;
};

export type SeededWedding = {
  wedding: TestWedding;
  partnerB: TestPartnerB | null;
  weddingId: string;
};

/** A date `days` from today in Europe/Rome (YYYY-MM-DD), never time-zone dependent. */
export function romeDate(offsetDays = 0, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const base = new Date(`${parts}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

/** The id of the standard decision of a wedding (`date` or `location`). */
export async function decisionId(w: SeededWedding, type: "date" | "location"): Promise<string> {
  const row = await w.wedding.founderClient
    .from("decisions")
    .select("id")
    .eq("wedding_id", w.weddingId)
    .eq("type", type)
    .single();
  if (row.error || !row.data) throw new Error(`seed: decision ${type}: ${row.error?.message}`);
  return row.data.id;
}

/** A candidate location (name, comune, pros/cons, rough cost) as the Scelte UI would add it. */
export async function addLocation(
  w: SeededWedding,
  title: string,
  extra: { comune?: string; pros?: string[]; cons?: string[]; costCents?: number } = {},
): Promise<string> {
  const inserted = await w.wedding.founderClient
    .from("decision_options")
    .insert({
      wedding_id: w.weddingId,
      decision_id: await decisionId(w, "location"),
      title,
      comune: extra.comune ?? null,
      pros: extra.pros ?? [],
      cons: extra.cons ?? [],
      cost_cents: extra.costCents ?? null,
    })
    .select("id")
    .single();
  if (inserted.error) throw new Error(`seed: location: ${inserted.error.message}`);
  return inserted.data.id;
}

/** A user task (title, optional due date in YYYY-MM-DD, assignee `both` | `A` | `B`). */
export async function addTask(
  w: SeededWedding,
  task: {
    title: string;
    due?: string | null;
    assignee?: string;
    category?: string | null;
    done?: boolean;
  },
): Promise<string> {
  const inserted = await w.wedding.founderClient
    .from("tasks")
    .insert({
      wedding_id: w.weddingId,
      title: task.title,
      due_date: task.due ?? null,
      assignee: task.assignee ?? "both",
      category: task.category ?? null,
    })
    .select("id")
    .single();
  if (inserted.error) throw new Error(`seed: task: ${inserted.error.message}`);
  if (task.done) {
    const done = await w.wedding.founderClient
      .from("tasks")
      .update({ status: "done" })
      .eq("id", inserted.data.id);
    if (done.error) throw new Error(`seed: task done: ${done.error.message}`);
  }
  return inserted.data.id;
}

export type SeededGuests = {
  ids: string[];
  /** counts of the rows THIS call inserted (the deterministic pattern below) */
  total: number;
  adults: number;
  children: number;
  infants: number;
  /** the `first_name` of every inserted guest, in order */
  firstNames: string[];
};

const GUEST_SIDES = ["A", "B", "both", null] as const;
const GUEST_BATCH = 500;

/**
 * Guests of the wedding, inserted straight through the founder's JWT in batches of 500 (QA-9: never
 * through the UI nor `import_guests`; an insert is not capped by `max_rows`). Names are invented and
 * unique ("Prova<n> Esempio<n>", n = 1-based and continuing after the guests the wedding already
 * has, so `seedGuests(w, 500)` then `seedGuests(w, 700)` gives 1200 distinct people). Pattern:
 * every 10th is a child, every 25th an infant, the sides cycle A / B / both / not set. Fake data only
 * (`@example.test`, phones `+39 000 000123`, not assignable numbers).
 */
export async function seedGuests(
  w: SeededWedding,
  count: number,
  options: { groupId?: string } = {},
): Promise<SeededGuests> {
  const db = w.wedding.founderClient;
  const existing = await db
    .from("guests")
    .select("id", { count: "exact", head: true })
    .eq("wedding_id", w.weddingId);
  if (existing.error) throw new Error(`seed: guests count: ${existing.error.message}`);
  const first = (existing.count ?? 0) + 1;
  const rows = Array.from({ length: count }, (_, i) => {
    const n = first + i;
    return {
      wedding_id: w.weddingId,
      first_name: `Prova${n}`,
      last_name: `Esempio${n}`,
      category: n % 25 === 0 ? "infant" : n % 10 === 0 ? "child" : "adult",
      side: GUEST_SIDES[n % GUEST_SIDES.length] ?? null,
      email: `prova${n}@example.test`,
      phone: `+39 000 ${String(n).padStart(6, "0")}`,
      group_id: options.groupId ?? null,
    };
  });
  const ids: string[] = [];
  for (let at = 0; at < rows.length; at += GUEST_BATCH) {
    const inserted = await db
      .from("guests")
      .insert(rows.slice(at, at + GUEST_BATCH))
      .select("id");
    if (inserted.error) throw new Error(`seed: guests: ${inserted.error.message}`);
    ids.push(...inserted.data.map((r) => r.id));
  }
  const of = (category: string) => rows.filter((r) => r.category === category).length;
  return {
    ids,
    total: rows.length,
    adults: of("adult"),
    children: of("child"),
    infants: of("infant"),
    firstNames: rows.map((r) => r.first_name),
  };
}

/** A guest group (family), inserted directly; returns its id. */
export async function addGuestGroup(w: SeededWedding, name: string): Promise<string> {
  const inserted = await w.wedding.founderClient
    .from("guest_groups")
    .insert({ wedding_id: w.weddingId, name })
    .select("id")
    .single();
  if (inserted.error) throw new Error(`seed: guest group: ${inserted.error.message}`);
  return inserted.data.id;
}

/** A guest with chosen fields (for named flows: duplicates, soft delete, search). Returns its id. */
export async function addGuest(
  w: SeededWedding,
  guest: {
    firstName: string;
    lastName?: string;
    category?: "adult" | "child" | "infant";
    side?: "A" | "B" | "both" | null;
    groupId?: string | null;
    tableId?: string | null;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
    deleted?: boolean;
  },
): Promise<string> {
  const inserted = await w.wedding.founderClient
    .from("guests")
    .insert({
      wedding_id: w.weddingId,
      first_name: guest.firstName,
      last_name: guest.lastName ?? null,
      category: guest.category ?? "adult",
      side: guest.side ?? null,
      group_id: guest.groupId ?? null,
      table_id: guest.tableId ?? null,
      phone: guest.phone ?? null,
      email: guest.email ?? null,
      notes: guest.notes ?? null,
    })
    .select("id")
    .single();
  if (inserted.error) throw new Error(`seed: guest: ${inserted.error.message}`);
  if (guest.deleted) {
    const gone = await w.wedding.founderClient
      .from("guests")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", inserted.data.id);
    if (gone.error) throw new Error(`seed: guest deleted: ${gone.error.message}`);
  }
  return inserted.data.id;
}

/** A guest table (name, optional capacity 1-50, `deleted` = already in "Eliminati di recente"). */
export async function addGuestTable(
  w: SeededWedding,
  name: string,
  options: { capacity?: number | null; deleted?: boolean } = {},
): Promise<string> {
  const inserted = await w.wedding.founderClient
    .from("guest_tables")
    .insert({ wedding_id: w.weddingId, name, capacity: options.capacity ?? null })
    .select("id")
    .single();
  if (inserted.error) throw new Error(`seed: guest table: ${inserted.error.message}`);
  if (options.deleted) {
    const gone = await w.wedding.founderClient
      .from("guest_tables")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", inserted.data.id);
    if (gone.error) throw new Error(`seed: guest table deleted: ${gone.error.message}`);
  }
  return inserted.data.id;
}

/** Seats guests at a table (or removes them with `null`), straight in the database. */
export async function seatGuests(
  w: SeededWedding,
  guestIds: string[],
  tableId: string | null,
): Promise<void> {
  const updated = await w.wedding.founderClient
    .from("guests")
    .update({ table_id: tableId })
    .in("id", guestIds);
  if (updated.error) throw new Error(`seed: seat guests: ${updated.error.message}`);
}

export type TestFamilyMember = { user: TestUser; client: TestClient };

/**
 * A `family` member of the wedding (a role with no `guests` permission): the same pattern as
 * tests/acceptance/rls-api.test.ts. The membership is written with the secret key, as there is no
 * invitation flow for this role yet. Log in with `loginAs(page, member.user, ip)`.
 */
export async function addFamilyMember(w: SeededWedding): Promise<TestFamilyMember> {
  const user = await createUser();
  const { error } = await serviceClient()
    .from("memberships")
    .insert({ wedding_id: w.weddingId, user_id: user.id, role: "family" });
  if (error) throw new Error(`seed: family membership: ${error.message}`);
  return { user, client: await signInAs(user) };
}

// ------------------------------------------------------------------------------------------ RSVP

/**
 * Same secret as the e2e server (`playwright.config.ts`). The links are made ONLY through
 * `token.ts` and the RPC `rsvp_create_links`, never with the token of `supabase/seeds/05_rsvp.sql`
 * (QA-6: that one is a public constant). Fake data only.
 */
export const RSVP_SECRET =
  process.env["RSVP_LINK_SECRET"] ?? "local-fake-rsvp-secret-0123456789abcdef";

export type SeededLink = { linkId: string; token: string; path: string };
export type RsvpTarget = { groupId: string } | { guestId: string };
export type RsvpSeedAnswer = {
  id: string;
  status: "yes" | "no" | null;
  diet?: string[];
  diet_note?: string | null;
  seen_at?: string | null;
};

/** The link of a group or of a person, as "Crea link" makes it. `shared` = "Condiviso il" today. */
export async function addRsvpLink(
  w: SeededWedding,
  target: RsvpTarget,
  options: { shared?: boolean } = {},
): Promise<SeededLink> {
  const linkId = randomUUID();
  const token = deriveRsvpToken(RSVP_SECRET, linkId);
  const created = await w.wedding.founderClient.rpc("rsvp_create_links", {
    p_items: [
      {
        link_id: linkId,
        token_hash: hashRsvpToken(token),
        ...("groupId" in target ? { group_id: target.groupId } : { guest_id: target.guestId }),
      },
    ] as never,
  });
  const body = created.data as { created?: unknown } | null;
  if (created.error || !Array.isArray(body?.created) || !body.created.includes(linkId)) {
    throw new Error(`seed: rsvp link: ${created.error?.message ?? "not created"}`);
  }
  if (options.shared) {
    const marked = await w.wedding.founderClient.rpc("rsvp_mark_shared", { p_link_id: linkId });
    if (marked.error) throw new Error(`seed: rsvp shared: ${marked.error.message}`);
  }
  return { linkId, token, path: `/rsvp/${token}` };
}

/** The link as the UI would copy it, from its id (the token is derived, never stored). */
export function rsvpLinkOf(linkId: string): SeededLink {
  const token = deriveRsvpToken(RSVP_SECRET, linkId);
  return { linkId, token, path: `/rsvp/${token}` };
}

/** The non-revoked link of a group or person (it was made through the UI), or `null`. */
export async function currentRsvpLink(
  w: SeededWedding,
  target: RsvpTarget,
): Promise<SeededLink | null> {
  const query = serviceClient()
    .from("rsvp_links")
    .select("id")
    .eq("wedding_id", w.weddingId)
    .is("revoked_at", null);
  const rows = await ("groupId" in target
    ? query.eq("group_id", target.groupId)
    : query.eq("guest_id", target.guestId));
  if (rows.error) throw new Error(`seed: current link: ${rows.error.message}`);
  const id = rows.data[0]?.id;
  return id ? rsvpLinkOf(id) : null;
}

export async function revokeRsvpLink(w: SeededWedding, linkId: string): Promise<void> {
  const revoked = await w.wedding.founderClient.rpc("rsvp_revoke_link", { p_link_id: linkId });
  if (revoked.error) throw new Error(`seed: revoke link: ${revoked.error.message}`);
}

/** A guest answer as the public page would save it (the secret-key RPC, no IP key). */
export async function submitRsvp(link: SeededLink, answers: RsvpSeedAnswer[]): Promise<void> {
  const result = await serviceClient().rpc("rsvp_submit", {
    p_token_hash: hashRsvpToken(link.token),
    p_ip_key: null as never,
    p_answers: answers as never,
  });
  const body = result.data as { ok?: unknown } | null;
  if (result.error || body?.ok !== true) {
    throw new Error(`seed: rsvp submit: ${result.error?.message ?? "not saved"}`);
  }
}

/**
 * Locks an IP out of the public RSVP page (BR9: 10 dead links in 15 minutes): the server reads the
 * address from `x-forwarded-for`, so a distinct fake `ip` per test never touches another test.
 */
export async function blockRsvpIp(baseURL: string, ip: string): Promise<void> {
  for (let n = 0; n < 11; n += 1) {
    const token = randomBytes(32).toString("base64url");
    const response = await fetch(new URL(`/rsvp/${token}`, baseURL), {
      headers: { "x-forwarded-for": ip },
      redirect: "manual",
    });
    await response.arrayBuffer();
    if (response.status === 429) return;
  }
  throw new Error("seed: the IP was not locked after 11 dead links");
}

/**
 * Takes the date decision: on its only scenario, or on the one that starts on `dateFrom` when the
 * wedding has several (the page and the expiry then know the date).
 */
export async function chooseDate(w: SeededWedding, dateFrom?: string): Promise<void> {
  const decision = await decisionId(w, "date");
  const scenarios = w.wedding.founderClient
    .from("date_scenarios")
    .select("option_id")
    .eq("wedding_id", w.weddingId);
  const option = await (dateFrom ? scenarios.eq("date_from", dateFrom) : scenarios).single();
  if (option.error) throw new Error(`seed: date option: ${option.error.message}`);
  const chosen = await w.wedding.founderClient.rpc("choose_option", {
    p_decision_id: decision,
    p_option_id: option.data.option_id,
  });
  if (chosen.error) throw new Error(`seed: choose date: ${chosen.error.message}`);
}

/** "Se sposti la data": the decision is reopened and taken again on another scenario. */
export async function moveDate(w: SeededWedding, dateFrom: string): Promise<void> {
  const reopened = await w.wedding.founderClient.rpc("reopen_decision", {
    p_decision_id: await decisionId(w, "date"),
    p_reason: "Prova",
  });
  if (reopened.error) throw new Error(`seed: reopen date: ${reopened.error.message}`);
  await chooseDate(w, dateFrom);
}

/** A candidate location, taken as the chosen one. */
export async function chooseLocation(
  w: SeededWedding,
  title: string,
  comune?: string,
): Promise<void> {
  const option = await addLocation(w, title, comune ? { comune } : {});
  const chosen = await w.wedding.founderClient.rpc("choose_option", {
    p_decision_id: await decisionId(w, "location"),
    p_option_id: option,
  });
  if (chosen.error) throw new Error(`seed: choose location: ${chosen.error.message}`);
}

export async function seedWedding(
  options: {
    rite?: Rite;
    scenarios?: SeedScenario[];
    budgetCents?: number | null;
    names?: { a: string; b: string };
    withPartnerB?: boolean;
    role?: "sposo" | "sposa";
    /** `false`: no milestone tasks (only what the test adds), to test phases deterministically. */
    templateTasks?: boolean;
  } = {},
): Promise<SeededWedding> {
  const wedding = await createWedding(options.role ?? "sposo");
  const a = wedding.founderClient;
  const names = options.names ?? { a: "Tony", b: "Jessica" };
  const withB = options.withPartnerB ?? true;
  const partnerB = withB ? await addPartnerB(wedding) : null;

  const rite = options.rite ?? "civile";
  const rows = await a.from("weddings").update({ rite }).eq("id", wedding.weddingId);
  if (rows.error) throw new Error(`seed: rite: ${rows.error.message}`);
  await a.from("wedding_partners").update({ first_name: names.a }).eq("slot", "A");
  if (withB) await a.from("wedding_partners").update({ first_name: names.b }).eq("slot", "B");

  const tasks = (options.templateTasks === false ? [] : generateTasks(rite, null)).map((task) => {
    const offset = getMilestone(task.templateKey)?.offset ?? null;
    return {
      template_key: task.templateKey,
      template_version: task.templateVersion,
      title: task.title,
      advice: task.advice,
      category: task.category,
      offset: offset ? { ...offset } : null,
    };
  });
  const done = await a.rpc("complete_onboarding", {
    p_scenarios: (options.scenarios ?? []) as never,
    p_tasks: tasks as never,
  });
  if (done.error) throw new Error(`seed: complete_onboarding: ${done.error.message}`);

  const categories = await a.from("budget_categories").insert(
    DEFAULT_BUDGET_CATEGORIES.map((c) => ({
      wedding_id: wedding.weddingId,
      name: c.name,
      default_key: c.key,
      sort_order: c.sortOrder,
    })),
  );
  if (categories.error) throw new Error(`seed: categories: ${categories.error.message}`);
  if (options.budgetCents) {
    const total = await a.from("budget_versions").insert({
      wedding_id: wedding.weddingId,
      total_cents: options.budgetCents,
      reason: "Budget iniziale",
    });
    if (total.error) throw new Error(`seed: total: ${total.error.message}`);
  }
  return { wedding, partnerB, weddingId: wedding.weddingId };
}
