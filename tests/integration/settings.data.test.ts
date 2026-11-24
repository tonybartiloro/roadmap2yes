import { beforeAll, describe, expect, it } from "vitest";
import { diffSuggestions, type TimelineTask } from "@/domain/timeline";
import { finishOnboarding, saveStep, type Db as OnboardingDb } from "@/features/onboarding/data";
import { parseScenario } from "@/features/onboarding/model";
import {
  loadProfiles,
  loadSettings,
  savePerson,
  saveSettings,
  type Db,
} from "@/features/settings/data";
import {
  addPartnerB,
  createWedding,
  serviceClient,
  type TestPartnerB,
  type TestWedding,
} from "../support/supabase";

/**
 * T10: Impostazioni nozze and Profili against the local stack, with the users' own clients. A changed
 * answer never adds or deletes a task: the Percorso derives "Suggerimenti da rivedere" from the saved
 * rite (AC16, AC48). Names are editable by both partners; the email is not part of this write (AC58).
 */

let wedding: TestWedding;
let partnerB: TestPartnerB;
const dbA = () => wedding.founderClient as unknown as Db;
const dbB = () => partnerB.client as unknown as Db;

async function tasksOf(weddingId: string): Promise<TimelineTask[]> {
  const { data } = await serviceClient().from("tasks").select("*").eq("wedding_id", weddingId);
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status === "done" ? "done" : "todo",
    dueDate: row.due_date,
    dueOverridden: row.due_overridden,
    source: row.source === "user" ? "user" : "template",
    templateKey: row.template_key,
    templateVersion: row.template_version,
    category: row.category,
    deleted: row.deleted_at !== null,
  }));
}

beforeAll(async () => {
  wedding = await createWedding("sposo");
  partnerB = await addPartnerB(wedding);
  const db = wedding.founderClient as unknown as OnboardingDb;
  await saveStep(db, wedding.founder.id, {
    step: "rite",
    unknown: true,
    columns: { rite: "unknown" },
  });
  await saveStep(db, wedding.founder.id, {
    step: "dates",
    unknown: false,
    answers: {
      scenarios: [
        parseScenario({
          id: "a",
          kind: "fixed",
          dateFrom: "2027-09-03",
          dateTo: null,
          label: "Prima",
        })!,
      ],
    },
  });
  const done = await finishOnboarding(db, wedding.founder.id);
  if (!done.ok) throw new Error(done.message);
});

describe("Impostazioni nozze (AC16, AC48)", () => {
  it("shows what the onboarding saved, with the dates and their linked location", async () => {
    const view = await loadSettings(dbA(), wedding.founder.id);
    expect(view.completed).toBe(true);
    expect(view.rite).toBe("unknown");
    // Only the step the couple actually skipped is remembered (steps never visited are not "unknown").
    expect(view.unknown).toEqual(["rite"]);
    expect(view.scenarios).toHaveLength(1);
    expect(view.scenarios[0]).toMatchObject({
      title: "Prima",
      kind: "fixed",
      dateFrom: "2027-09-03",
      status: "candidate",
      locationName: null,
    });
    expect(view.partnerName).toBe("il tuo partner");

    // A location candidate linked to the date shows up next to it (AC60).
    const service = serviceClient();
    const decision = await service
      .from("decisions")
      .select("id")
      .eq("wedding_id", wedding.weddingId)
      .eq("key", "location")
      .single();
    const location = await service
      .from("decision_options")
      .insert({
        decision_id: decision.data!.id,
        wedding_id: wedding.weddingId,
        title: "Villa Rossi",
      })
      .select("id")
      .single();
    expect(location.error).toBeNull();
    await service
      .from("date_scenarios")
      .update({ location_option_id: location.data!.id })
      .eq("id", view.scenarios[0]!.id);
    const linked = await loadSettings(dbA(), wedding.founder.id);
    expect(linked.scenarios[0]?.locationName).toBe("Villa Rossi");
  });

  it("changing the rite saves it and adds/deletes NOTHING; the suggestions follow from the rite", async () => {
    const before = await tasksOf(wedding.weddingId);
    const view = await loadSettings(dbA(), wedding.founder.id);
    const saved = await saveSettings(dbA(), {
      version: view.version,
      id: view.weddingId,
      rite: "civile",
      guestBand: "50_80",
      styleLabel: "Classico",
      styleNote: null,
      region: "Lazio",
      comune: "Roma",
      hasBudget: false,
      currentUnknown: view.unknown,
    });
    expect(saved).toMatchObject({ ok: true });

    const after = await tasksOf(wedding.weddingId);
    expect(after.map((t) => t.id).toSorted()).toEqual(before.map((t) => t.id).toSorted());
    expect(after.every((t) => !t.deleted)).toBe(true);

    const updated = await loadSettings(dbB(), partnerB.user.id);
    expect(updated).toMatchObject({
      rite: "civile",
      guestBand: "50_80",
      styleLabel: "Classico",
      region: "Lazio",
      comune: "Roma",
    });
    // 'rite', 'guests' and 'style' are answered now; the budget is still missing.
    expect(updated.unknown).toEqual(expect.arrayContaining(["budget"]));
    expect(updated.unknown).not.toContain("rite");
    expect(updated.unknown).not.toContain("guests");
    expect(updated.unknown).not.toContain("style");

    // The Percorso's own derivation: "Scegli il rito" goes, the civil milestones come, as SUGGESTIONS.
    const diff = diffSuggestions("civile", after, []);
    expect(diff.removals.map((t) => t.templateKey)).toContain("scegli-il-rito");
    expect(diff.additions.length).toBeGreaterThan(0);
  });

  it("a deleted task is never offered again after the rite changes (BR6)", async () => {
    const tasks = await tasksOf(wedding.weddingId);
    const diff = diffSuggestions("civile", tasks, []);
    const target = diff.additions[0];
    expect(target).toBeDefined();
    // The couple deleted it earlier: a deleted task still counts as present.
    const withDeleted: TimelineTask[] = [
      ...tasks,
      {
        id: "gone",
        title: target!.title,
        status: "todo",
        dueDate: null,
        dueOverridden: false,
        source: "template",
        templateKey: target!.key,
        templateVersion: 1,
        category: null,
        deleted: true,
      },
    ];
    expect(diffSuggestions("civile", withDeleted, []).additions.map((m) => m.key)).not.toContain(
      target!.key,
    );
  });

  it("a stale version is a conflict, never an overwrite; 'Salva comunque' uses the fresh version", async () => {
    const stale = await loadSettings(dbA(), wedding.founder.id);
    // B saves first.
    const firstName = await savePerson(dbB(), {
      partnerId: (await loadProfiles(dbB(), partnerB.user.id)).me.id,
      version: (await loadProfiles(dbB(), partnerB.user.id)).me.version,
      firstName: "Luca",
      lastName: null,
      label: null,
    });
    expect(firstName.ok).toBe(true);
    const bSaved = await saveSettings(dbB(), {
      version: stale.version,
      id: stale.weddingId,
      rite: "religioso",
      guestBand: stale.guestBand,
      styleLabel: stale.styleLabel,
      styleNote: stale.styleNote,
      region: stale.region,
      comune: stale.comune,
      hasBudget: false,
      currentUnknown: stale.unknown,
    });
    expect(bSaved.ok).toBe(true);

    const mine = {
      version: stale.version,
      id: stale.weddingId,
      rite: "simbolico" as const,
      guestBand: stale.guestBand,
      styleLabel: stale.styleLabel,
      styleNote: stale.styleNote,
      region: stale.region,
      comune: "Firenze",
      hasBudget: false,
      currentUnknown: stale.unknown,
    };
    const result = await saveSettings(dbA(), mine);
    expect(result).toMatchObject({ ok: false, code: "conflict" });
    if (result.ok || result.code !== "conflict" || !("conflict" in result)) return;
    expect(result.conflict.changedByName).toBe("Luca");
    expect(result.conflict.current).toMatchObject({ rite: "religioso", comune: "Roma" });
    // Nothing of A's was written.
    expect((await loadSettings(dbA(), wedding.founder.id)).rite).toBe("religioso");

    // "Salva comunque" retries with the version the conflict carries.
    const fresh = result.conflict.current?.["version"];
    expect(fresh).toBe((await loadSettings(dbA(), wedding.founder.id)).version);
    const forced = await saveSettings(dbA(), { ...mine, version: fresh as number });
    expect(forced.ok).toBe(true);
    expect(await loadSettings(dbA(), wedding.founder.id)).toMatchObject({
      rite: "simbolico",
      comune: "Firenze",
    });
  });
});

describe("Profili (AC46, AC58)", () => {
  it("shows both people, me first; names show up where the partner is named", async () => {
    const asA = await loadProfiles(dbA(), wedding.founder.id);
    expect(asA.me).toMatchObject({ slot: "A", isMe: true, email: wedding.founder.email });
    expect(asA.other).toMatchObject({ slot: "B", isMe: false, joined: true });
    const asB = await loadProfiles(dbB(), partnerB.user.id);
    expect(asB.me.slot).toBe("B");
    expect(asB.other?.slot).toBe("A");
    expect((await loadSettings(dbA(), wedding.founder.id)).partnerName).toBe("Luca");
  });

  it("either partner edits the name, surname and label of BOTH; the email is not writable", async () => {
    const profiles = await loadProfiles(dbA(), wedding.founder.id);
    const other = profiles.other!;
    const edited = await savePerson(dbA(), {
      partnerId: other.id,
      version: other.version,
      firstName: "Luca",
      lastName: "Bianchi",
      label: "sposo",
    });
    expect(edited).toMatchObject({ ok: true });
    expect((await loadProfiles(dbB(), partnerB.user.id)).me).toMatchObject({
      lastName: "Bianchi",
      label: "sposo",
    });

    // The email column has no grant: neither partner can change it with a direct write.
    const direct = await wedding.founderClient
      .from("wedding_partners")
      .update({ email: "altro@example.test" })
      .eq("id", other.id);
    expect(direct.error).not.toBeNull();
    expect((await loadProfiles(dbA(), wedding.founder.id)).other?.email).toBe(partnerB.user.email);
  });

  it("two edits of the same person: the second one is a conflict with the first one's values", async () => {
    const profiles = await loadProfiles(dbA(), wedding.founder.id);
    const me = profiles.me;
    const first = await savePerson(dbB(), {
      partnerId: me.id,
      version: me.version,
      firstName: "Anna",
      lastName: "Verdi",
      label: "sposa",
    });
    expect(first.ok).toBe(true);
    const second = await savePerson(dbA(), {
      partnerId: me.id,
      version: me.version,
      firstName: "Annalisa",
      lastName: null,
      label: null,
    });
    expect(second).toMatchObject({ ok: false, code: "conflict" });
    if (second.ok || second.code !== "conflict" || !("conflict" in second)) return;
    expect(second.conflict.current).toMatchObject({
      firstName: "Anna",
      lastName: "Verdi",
      label: "sposa",
    });
    expect(typeof second.conflict.current?.["version"]).toBe("number");
    expect(second.conflict.changedByName).toBe("Luca");
  });

  it("a partner row that is not the caller's wedding is refused by RLS", async () => {
    const stranger = await createWedding();
    const strangerRow = (
      await loadProfiles(stranger.founderClient as unknown as Db, stranger.founder.id)
    ).me;
    const attempt = await savePerson(dbA(), {
      partnerId: strangerRow.id,
      version: strangerRow.version,
      firstName: "Intruso",
      lastName: null,
      label: null,
    });
    expect(attempt.ok).toBe(false);
    expect(
      (await loadProfiles(stranger.founderClient as unknown as Db, stranger.founder.id)).me
        .firstName,
    ).toBeNull();
  });
});
