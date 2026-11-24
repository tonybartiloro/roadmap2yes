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

export async function seedWedding(
  options: {
    rite?: Rite;
    scenarios?: SeedScenario[];
    budgetCents?: number | null;
    names?: { a: string; b: string };
    withPartnerB?: boolean;
    role?: "sposo" | "sposa";
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

  const tasks = generateTasks(rite, null).map((task) => {
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
