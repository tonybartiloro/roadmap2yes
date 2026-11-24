import { DEFAULT_BUDGET_CATEGORIES } from "@/content/budget-categories";
import { getMilestone, type Rite } from "@/content/milestones";
import { generateTasks } from "@/domain/timeline";
import {
  addPartnerB,
  createWedding,
  type TestPartnerB,
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
