import { beforeAll, describe, expect, it } from "vitest";
import { getMilestone } from "@/content/milestones";
import { generateTasks } from "@/domain/timeline";
import {
  addPartnerB,
  createWedding,
  serviceClient,
  type TestClient,
  type TestPartnerB,
  type TestWedding,
} from "../support/supabase";

/**
 * QA T17b: Percorso and Scelte rules through the API a client really has (JWT of the partner),
 * against the real local stack. The e2e specs prove the screens; this proves the rules.
 *
 * AC map
 *  - AC18/AC19/AC21  choose and reopen are atomic and append events; reopening needs a reason and
 *                    restores the discarded options as candidates; events cannot be changed
 *  - AC24            exactly one reference: nearest open by default ("provvisorio"); a manual one;
 *                    "torna automatico"; chosen -> "definitivo"; reopened -> same one, provisional;
 *                    a period counts from its first day
 *  - AC28            a recalculation touches only template, open, non-overridden tasks
 *  - AC20            reopening marks date-dependent tasks "needs review"; "Va bene così" clears it
 *  - AC60/BR22       a date links only to a candidate location of the SAME wedding; deleting the
 *                    location unlinks it; choosing the date never chooses the location
 *  - AC64            a period is chosen with an exact day inside it; outside -> error; the
 *                    scenario becomes a fixed date and the event keeps the period
 *  - AC48            a rite change never deletes tasks by itself (suggestions only): see e2e
 */

const day = (offset: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

function payload() {
  return generateTasks("civile", null).map((task) => {
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
}

type Ids = { date: string; location: string; near: string; far: string; period: string };

async function seed(): Promise<{
  w: TestWedding;
  b: TestPartnerB;
  ids: Ids;
  near: string;
  far: string;
}> {
  const w = await createWedding();
  const b = await addPartnerB(w);
  const near = day(400);
  const far = day(800);
  const done = await w.founderClient.rpc("complete_onboarding", {
    p_scenarios: [
      { kind: "fixed", date_from: near, label: "Vicina" },
      { kind: "fixed", date_from: far, label: "Lontana" },
      { kind: "period", date_from: day(1000), date_to: day(1060), label: "Periodo" },
    ],
    p_tasks: payload() as never,
  });
  expect(done.error).toBeNull();
  const decisions = await w.founderClient
    .from("decisions")
    .select("id,type")
    .eq("wedding_id", w.weddingId);
  const idOf = (type: string) => decisions.data!.find((d) => d.type === type)!.id;
  const options = await w.founderClient.from("decision_options").select("id,title,decision_id");
  const opt = (title: string) => options.data!.find((o) => o.title === title)!.id;
  return {
    w,
    b,
    near,
    far,
    ids: {
      date: idOf("date"),
      location: idOf("location"),
      near: opt("Vicina"),
      far: opt("Lontana"),
      period: opt("Periodo"),
    },
  };
}

const reference = async (c: TestClient, weddingId: string) =>
  (
    await c
      .from("weddings")
      .select("applied_reference_date,manual_reference_option_id")
      .eq("id", weddingId)
      .single()
  ).data!;

describe("reference scenario (AC24)", () => {
  let s: Awaited<ReturnType<typeof seed>>;
  beforeAll(async () => {
    s = await seed();
  });

  it("defaults to the nearest open scenario", async () => {
    expect((await reference(s.w.founderClient, s.w.weddingId)).applied_reference_date).toBe(s.near);
  });

  it("a manual reference replaces it; both partners see it; 'torna automatico' goes back", async () => {
    const set = await s.w.founderClient.rpc("set_reference_scenario", { p_option_id: s.ids.far });
    expect(set.error).toBeNull();
    expect((await reference(s.b.client, s.w.weddingId)).applied_reference_date).toBe(s.far);
    const back = await s.b.client.rpc("set_reference_scenario", {});
    expect(back.error).toBeNull();
    expect((await reference(s.w.founderClient, s.w.weddingId)).applied_reference_date).toBe(s.near);
  });

  it("a period is calculated from its first day", async () => {
    await s.w.founderClient.rpc("set_reference_scenario", { p_option_id: s.ids.period });
    expect((await reference(s.w.founderClient, s.w.weddingId)).applied_reference_date).toBe(
      day(1000),
    );
    await s.w.founderClient.rpc("set_reference_scenario", {});
  });

  it("only a scenario of the same wedding can be the reference", async () => {
    const stranger = await createWedding();
    await stranger.founderClient.rpc("complete_onboarding", {
      p_scenarios: [{ kind: "fixed", date_from: day(300), label: "Estranea" }],
    });
    const foreign = (await stranger.founderClient.from("decision_options").select("id").limit(1))
      .data![0]!.id;
    const attempt = await s.w.founderClient.rpc("set_reference_scenario", { p_option_id: foreign });
    expect(attempt.error).not.toBeNull();
    expect((await reference(s.w.founderClient, s.w.weddingId)).applied_reference_date).toBe(s.near);
  });
});

describe("choose and reopen (AC18, AC19, AC20, AC21)", () => {
  let s: Awaited<ReturnType<typeof seed>>;
  beforeAll(async () => {
    s = await seed();
  });

  it("choosing the date makes the chosen scenario the definitive reference and writes an event", async () => {
    const chosen = await s.w.founderClient.rpc("choose_option", {
      p_decision_id: s.ids.date,
      p_option_id: s.ids.far,
    });
    expect(chosen.error).toBeNull();
    expect((await reference(s.w.founderClient, s.w.weddingId)).applied_reference_date).toBe(s.far);
    const status = await s.w.founderClient
      .from("decisions")
      .select("status")
      .eq("id", s.ids.date)
      .single();
    expect(status.data?.status).toBe("taken");
    const events = await s.w.founderClient
      .from("decision_events")
      .select("kind,actor_id,at")
      .eq("decision_id", s.ids.date);
    expect(events.data?.some((e) => e.kind === "chosen" && e.actor_id === s.w.founder.id)).toBe(
      true,
    );
    // the other options are discarded, still visible
    const others = await s.w.founderClient
      .from("decision_options")
      .select("status")
      .eq("decision_id", s.ids.date)
      .neq("id", s.ids.far);
    expect(others.data?.every((o) => o.status === "discarded")).toBe(true);
  });

  it("reopening needs a reason; with one the options are candidates again and the same scenario stays the (provisional) reference", async () => {
    const noReason = await s.b.client.rpc("reopen_decision", {
      p_decision_id: s.ids.date,
      p_reason: "  ",
    });
    expect(noReason.error).not.toBeNull();
    const reopened = await s.b.client.rpc("reopen_decision", {
      p_decision_id: s.ids.date,
      p_reason: "Cambio di location",
    });
    expect(reopened.error).toBeNull();
    const status = await s.w.founderClient
      .from("decisions")
      .select("status")
      .eq("id", s.ids.date)
      .single();
    expect(status.data?.status).toBe("open");
    const options = await s.w.founderClient
      .from("decision_options")
      .select("status")
      .eq("decision_id", s.ids.date);
    expect(options.data?.every((o) => o.status === "candidate")).toBe(true);
    expect((await reference(s.w.founderClient, s.w.weddingId)).applied_reference_date).toBe(s.far);
    const events = await s.w.founderClient
      .from("decision_events")
      .select("kind,reason,actor_id")
      .eq("decision_id", s.ids.date)
      .eq("kind", "reopened");
    expect(events.data?.[0]).toMatchObject({ reason: "Cambio di location", actor_id: s.b.user.id });
  });

  it("date-dependent tasks are 'needs review' until acknowledged (AC20)", async () => {
    const review = await s.w.founderClient
      .from("tasks")
      .select("id")
      .eq("needs_review", true)
      .is("deleted_at", null);
    expect(review.data!.length).toBeGreaterThan(0);
    const ack = await s.w.founderClient.rpc("acknowledge_task_review", {});
    expect(ack.error).toBeNull();
    const after = await s.w.founderClient.from("tasks").select("id").eq("needs_review", true);
    expect(after.data).toEqual([]);
  });

  it("the history is append-only: nobody can update or delete an event, not even with the secret key (AC21)", async () => {
    const event = (
      await s.w.founderClient
        .from("decision_events")
        .select("id")
        .eq("decision_id", s.ids.date)
        .limit(1)
    ).data![0]!;
    expect(
      (await s.w.founderClient.from("decision_events").update({ reason: "x" }).eq("id", event.id))
        .error,
    ).not.toBeNull();
    expect(
      (await s.w.founderClient.from("decision_events").delete().eq("id", event.id)).error,
    ).not.toBeNull();
    const asService = await serviceClient()
      .from("decision_events")
      .update({ reason: "x" })
      .eq("id", event.id);
    expect(asService.error).not.toBeNull();
    const note = await s.b.client.rpc("add_decision_note", {
      p_decision_id: s.ids.date,
      p_note: "Una nota",
    });
    expect(note.error).toBeNull();
  });
});

describe("recalculation (AC28)", () => {
  it("moves open template tasks, never done, manually dated or deleted ones", async () => {
    const s = await seed();
    const a = s.w.founderClient;
    const tasks = (
      await a
        .from("tasks")
        .select("id,template_key,due_date,template_offset")
        .not("template_offset", "is", null)
        .is("deleted_at", null)
        .order("id")
    ).data!;
    expect(tasks.length).toBeGreaterThan(3);
    const [done, overridden, deleted, plain] = tasks as [
      (typeof tasks)[number],
      (typeof tasks)[number],
      (typeof tasks)[number],
      (typeof tasks)[number],
    ];
    await a.from("tasks").update({ status: "done" }).eq("id", done.id);
    await a
      .from("tasks")
      .update({ due_date: day(9) })
      .eq("id", overridden.id);
    await a.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("id", deleted.id);

    const doneBefore = (await a.from("tasks").select("due_date").eq("id", done.id).single()).data!
      .due_date;
    const plainBefore = plain.due_date;
    const set = await a.rpc("set_reference_scenario", { p_option_id: s.ids.far });
    expect(set.error).toBeNull();

    const after = async (id: string) =>
      (await a.from("tasks").select("due_date,due_overridden,deleted_at").eq("id", id).single())
        .data!;
    expect((await after(done.id)).due_date).toBe(doneBefore);
    expect((await after(overridden.id)).due_date).toBe(day(9));
    expect((await after(overridden.id)).due_overridden).toBe(true);
    expect((await after(deleted.id)).deleted_at).not.toBeNull();
    expect((await after(plain.id)).due_date).not.toBe(plainBefore);
  });

  it.each([
    ["2027-03-31", { months: 1 }, "2027-02-28"],
    ["2028-03-31", { months: 1 }, "2028-02-29"],
    ["2027-10-31", { months: 1, weeks: 1 }, "2027-09-23"],
    ["2027-01-31", { months: -1 }, "2027-02-28"],
  ])(
    "end-of-month arithmetic: %s with offset %j lands on %s (months first, then weeks/days)",
    async (reference, offset, expected) => {
      const w2 = await createWedding();
      const done = await w2.founderClient.rpc("complete_onboarding", {
        p_scenarios: [{ kind: "fixed", date_from: reference, label: "Fine mese" }],
        p_tasks: [
          {
            template_key: "qa-eom",
            template_version: 1,
            title: "QA fine mese",
            advice: "x",
            category: "organizzazione",
            offset,
          },
        ] as never,
      });
      expect(done.error).toBeNull();
      const task = (
        await w2.founderClient
          .from("tasks")
          .select("due_date")
          .eq("template_key", "qa-eom")
          .single()
      ).data!;
      expect(task.due_date).toBe(expected);
    },
  );
});

describe("date linked to a location (AC60, BR22)", () => {
  let s: Awaited<ReturnType<typeof seed>>;
  let villa: string;
  beforeAll(async () => {
    s = await seed();
    const loc = await s.w.founderClient
      .from("decision_options")
      .insert({ wedding_id: s.w.weddingId, decision_id: s.ids.location, title: "Villa Rosa" })
      .select("id")
      .single();
    villa = loc.data!.id;
  });

  it("links only to a location of the same wedding; a date or a foreign location is refused", async () => {
    const ok = await s.w.founderClient
      .from("date_scenarios")
      .update({ location_option_id: villa })
      .eq("option_id", s.ids.near);
    expect(ok.error).toBeNull();
    // another date option is not a location
    const wrongType = await s.w.founderClient
      .from("date_scenarios")
      .update({ location_option_id: s.ids.far })
      .eq("option_id", s.ids.near);
    expect(wrongType.error).not.toBeNull();
    // a location of another wedding
    const stranger = await createWedding();
    await stranger.founderClient.rpc("complete_onboarding", { p_scenarios: [] });
    const foreign = await stranger.founderClient
      .from("decisions")
      .select("id")
      .eq("type", "location")
      .single();
    const foreignOption = await stranger.founderClient
      .from("decision_options")
      .insert({ wedding_id: stranger.weddingId, decision_id: foreign.data!.id, title: "Altrove" })
      .select("id")
      .single();
    const cross = await s.w.founderClient
      .from("date_scenarios")
      .update({ location_option_id: foreignOption.data!.id })
      .eq("option_id", s.ids.near);
    expect(cross.error).not.toBeNull();
  });

  it("choosing the date does not choose the location", async () => {
    await s.w.founderClient.rpc("choose_option", {
      p_decision_id: s.ids.date,
      p_option_id: s.ids.near,
    });
    const loc = await s.w.founderClient
      .from("decisions")
      .select("status")
      .eq("id", s.ids.location)
      .single();
    expect(loc.data?.status).toBe("open");
  });

  it("deleting the location unlinks the date and leaves an event", async () => {
    const del = await s.w.founderClient
      .from("decision_options")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", villa);
    expect(del.error).toBeNull();
    const link = await s.w.founderClient
      .from("date_scenarios")
      .select("location_option_id")
      .eq("option_id", s.ids.near)
      .single();
    expect(link.data?.location_option_id).toBeNull();
    const events = await s.w.founderClient
      .from("decision_events")
      .select("kind")
      .eq("kind", "option_updated");
    expect(events.data!.length).toBeGreaterThan(0);
  });
});

describe("a period chosen as the date (AC64)", () => {
  it("needs an exact day inside the period; the scenario becomes a fixed date; the event keeps the period", async () => {
    const s = await seed();
    const a = s.w.founderClient;
    const outside = await a.rpc("choose_option", {
      p_decision_id: s.ids.date,
      p_option_id: s.ids.period,
      p_exact_date: day(5),
    });
    expect(outside.error).not.toBeNull();
    const missing = await a.rpc("choose_option", {
      p_decision_id: s.ids.date,
      p_option_id: s.ids.period,
    });
    expect(missing.error).not.toBeNull();
    const exact = day(1020);
    const ok = await a.rpc("choose_option", {
      p_decision_id: s.ids.date,
      p_option_id: s.ids.period,
      p_exact_date: exact,
    });
    expect(ok.error).toBeNull();
    const scenario = (
      await a
        .from("date_scenarios")
        .select("kind,date_from,date_to")
        .eq("option_id", s.ids.period)
        .single()
    ).data!;
    expect(scenario).toMatchObject({ kind: "fixed", date_from: exact, date_to: null });
    const events = await a
      .from("decision_events")
      .select("kind,payload")
      .eq("decision_id", s.ids.date)
      .eq("kind", "chosen");
    expect(JSON.stringify(events.data)).toContain(day(1000));
    expect((await reference(a, s.w.weddingId)).applied_reference_date).toBe(exact);
  });
});
