import { describe, expect, it } from "vitest";
import {
  finishOnboarding,
  loadOnboarding,
  saveStep,
  savePersonRow,
  type Db,
} from "@/features/onboarding/data";
import { DEFAULT_SCENARIO_DATE, parseScenario } from "@/features/onboarding/model";
import { addPartnerB, createWedding, serviceClient, type TestWedding } from "../support/supabase";

/**
 * T10: the onboarding data layer against the local stack, with the users' own clients (RLS and the
 * RPCs are the only authorization). Steps are saved as they are confirmed and resumable (AC12), every
 * step accepts "Non lo so ancora" (AC13), completion creates everything in one go (AC14) and works
 * with partial answers (AC15). Nothing here imports Next.js.
 */

const asDb = (wedding: TestWedding) => wedding.founderClient as unknown as Db;
const scenario = (id: string, dateFrom: string, extra: Record<string, unknown> = {}) =>
  parseScenario({ id, kind: "fixed", dateFrom, dateTo: null, label: null, ...extra })!;

async function load(wedding: TestWedding) {
  const state = await loadOnboarding(asDb(wedding), wedding.founder.id);
  if (!state) throw new Error("no wedding");
  return state;
}

describe("steps are saved when confirmed and resumed (AC12, AC13)", () => {
  it("starts empty, as partner A, with the label of the bootstrap role", async () => {
    const w = await createWedding("sposa");
    const state = await load(w);
    expect(state.completed).toBe(false);
    expect(state.selfSlot).toBe("A");
    expect(state.answers.lastStep).toBe(0);
    expect(state.you).toMatchObject({ slot: "A", label: "sposa", email: w.founder.email });
    expect(state.partner).toBeNull();
    expect(state.themeId).toBe("giardino");
  });

  it("saves name, label and every answer, and remembers the last confirmed step", async () => {
    const w = await createWedding();
    const db = asDb(w);
    const person = await savePersonRow(db, "A", {
      firstName: "Anna",
      lastName: "Verdi",
      label: "sposa",
    });
    expect(person.ok).toBe(true);
    expect((await saveStep(db, w.founder.id, { step: "you", unknown: false })).ok).toBe(true);

    const rite = await saveStep(db, w.founder.id, {
      step: "rite",
      unknown: false,
      columns: { rite: "civile" },
    });
    expect(rite.ok && rite.state.answers.lastStep).toBe(3);

    const dates = await saveStep(db, w.founder.id, {
      step: "dates",
      unknown: false,
      answers: { scenarios: [scenario("a", DEFAULT_SCENARIO_DATE, { label: "Prima scelta" })] },
    });
    expect(dates.ok && dates.state.answers.scenarios).toHaveLength(1);

    await saveStep(db, w.founder.id, {
      step: "guests",
      unknown: false,
      columns: { guest_band: "50_80" },
    });
    await saveStep(db, w.founder.id, {
      step: "budget",
      unknown: false,
      answers: { budgetCents: 2_500_000 },
    });
    await saveStep(db, w.founder.id, {
      step: "style",
      unknown: false,
      columns: {
        style_label: "Boho",
        style_note: "Fiori di campo",
        region: "Toscana",
        comune: "Lucca",
      },
    });

    const state = await load(w);
    expect(state).toMatchObject({
      rite: "civile",
      guestBand: "50_80",
      styleLabel: "Boho",
      styleNote: "Fiori di campo",
      region: "Toscana",
      comune: "Lucca",
      completed: false,
    });
    expect(state.you).toMatchObject({ firstName: "Anna", lastName: "Verdi", label: "sposa" });
    expect(state.answers.lastStep).toBe(7);
    expect(state.answers.budgetCents).toBe(2_500_000);
    expect(state.unknown).toEqual([]);
  });

  it("'Non lo so ancora' is valid on a step and is remembered; confirming again with an answer clears it", async () => {
    const w = await createWedding();
    const db = asDb(w);
    const skipped = await saveStep(db, w.founder.id, {
      step: "budget",
      unknown: true,
      answers: { budgetCents: null },
    });
    expect(skipped.ok && skipped.state.unknown).toEqual(["budget"]);
    const answered = await saveStep(db, w.founder.id, {
      step: "budget",
      unknown: false,
      answers: { budgetCents: 100_000 },
    });
    expect(answered.ok && answered.state.unknown).toEqual([]);
    // Going back to an earlier step never rewinds the resume point.
    await saveStep(db, w.founder.id, { step: "style", unknown: true });
    await saveStep(db, w.founder.id, {
      step: "rite",
      unknown: false,
      columns: { rite: "unknown" },
    });
    expect((await load(w)).answers.lastStep).toBe(7);
  });

  it("the other partner's write in between is merged, not overwritten", async () => {
    const w = await createWedding();
    const b = await addPartnerB(w);
    // B edits a wedding answer through Impostazioni while A is in the middle of the wizard.
    const edited = await b.client.from("weddings").update({ comune: "Pisa" }).eq("id", w.weddingId);
    expect(edited.error).toBeNull();
    const result = await saveStep(asDb(w), w.founder.id, {
      step: "rite",
      unknown: false,
      columns: { rite: "religioso" },
    });
    expect(result.ok && result.state.comune).toBe("Pisa");
    expect(result.ok && result.state.rite).toBe("religioso");
  });
});

describe("completion (AC14, AC15)", () => {
  it("creates scenarios, the Percorso, the budget categories and the total; a second call finishes nothing twice", async () => {
    const w = await createWedding();
    const db = asDb(w);
    await saveStep(db, w.founder.id, { step: "rite", unknown: false, columns: { rite: "civile" } });
    await saveStep(db, w.founder.id, {
      step: "dates",
      unknown: false,
      answers: {
        scenarios: [
          scenario("a", "2027-09-03"),
          parseScenario({
            id: "b",
            kind: "period",
            dateFrom: "2028-05-01",
            dateTo: "2028-06-30",
            label: "Primavera 2028",
          })!,
        ],
      },
    });
    await saveStep(db, w.founder.id, {
      step: "budget",
      unknown: false,
      answers: { budgetCents: 3_000_000 },
    });

    const done = await finishOnboarding(db, w.founder.id);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.alreadyCompleted).toBe(false);
    expect(done.warnings).toEqual([]);
    expect(done.tasksCreated).toBeGreaterThan(10);
    expect(done.referenceDate).toBe("2027-09-03");
    expect(done.referenceStatus).toBe("provisional");
    expect(done.state.completed).toBe(true);

    const service = serviceClient();
    const options = await service
      .from("decision_options")
      .select("title")
      .eq("wedding_id", w.weddingId);
    expect(options.data?.map((o) => o.title).toSorted()).toEqual(["03/09/2027", "Primavera 2028"]);
    const tasks = await service.from("tasks").select("id,due_date").eq("wedding_id", w.weddingId);
    expect(tasks.data?.length).toBe(done.tasksCreated);
    expect(tasks.data?.some((t) => t.due_date !== null)).toBe(true);
    const categories = await service
      .from("budget_categories")
      .select("id")
      .eq("wedding_id", w.weddingId);
    expect(categories.data).toHaveLength(11);
    const versions = await service
      .from("budget_versions")
      .select("total_cents,reason")
      .eq("wedding_id", w.weddingId);
    expect(versions.data).toEqual([{ total_cents: 3_000_000, reason: "Budget iniziale" }]);

    // A retry (double click, reload) is not an error and creates nothing twice.
    const again = await finishOnboarding(db, w.founder.id);
    expect(again.ok && again.alreadyCompleted).toBe(true);
    const versionsAfter = await service
      .from("budget_versions")
      .select("id")
      .eq("wedding_id", w.weddingId);
    expect(versionsAfter.data).toHaveLength(1);
    const tasksAfter = await service.from("tasks").select("id").eq("wedding_id", w.weddingId);
    expect(tasksAfter.data).toHaveLength(tasks.data?.length ?? -1);
    const categoriesAfter = await service
      .from("budget_categories")
      .select("id")
      .eq("wedding_id", w.weddingId);
    expect(categoriesAfter.data).toHaveLength(11);

    // After completion the wizard refuses further steps.
    const late = await saveStep(db, w.founder.id, { step: "guests", unknown: false });
    expect(late).toMatchObject({ ok: false, code: "completed" });
  });

  it("works with partial answers: no date, no budget, rite 'non lo so' (AC15, AC63)", async () => {
    const w = await createWedding();
    const db = asDb(w);
    await saveStep(db, w.founder.id, {
      step: "rite",
      unknown: true,
      columns: { rite: "unknown" },
    });
    const done = await finishOnboarding(db, w.founder.id);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.referenceDate).toBeNull();
    expect(done.referenceStatus).toBeNull();

    const service = serviceClient();
    const tasks = await service
      .from("tasks")
      .select("template_key,due_date")
      .eq("wedding_id", w.weddingId);
    const keys = tasks.data?.map((t) => t.template_key) ?? [];
    expect(keys).toContain("scegli-il-rito");
    // Without a reference nothing date-dependent has a date.
    expect(tasks.data?.filter((t) => t.due_date !== null)).toEqual([]);
    // Categories are there; with no total answered there is no budget version.
    expect(
      (await service.from("budget_categories").select("id").eq("wedding_id", w.weddingId)).data,
    ).toHaveLength(11);
    expect(
      (await service.from("budget_versions").select("id").eq("wedding_id", w.weddingId)).data,
    ).toEqual([]);
  });

  it("only partner A can close the onboarding", async () => {
    const w = await createWedding();
    const b = await addPartnerB(w);
    const refused = await finishOnboarding(b.client as unknown as Db, b.user.id);
    expect(refused).toMatchObject({ ok: false, code: "forbidden" });
    expect((await load(w)).completed).toBe(false);
  });
});
