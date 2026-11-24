import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateTasks } from "@/domain/timeline";
import { todayInRome } from "@/lib/dates/plain-date";
import {
  addPartnerB,
  createWedding,
  type TestClient,
  type TestPartnerB,
  type TestWedding,
} from "../support/supabase";

/**
 * Percorso server logic against the real local stack (T11): the loader, the server actions and the
 * agreement between the T4 reference rule and the DB. The actions run with a signed-in client
 * injected in place of the cookie-based server client, exactly the user JWT the app would use.
 */

const session = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => session.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  acceptSuggestedTaskAction,
  acknowledgeReviewAction,
  createTaskAction,
  deleteTaskAction,
  dismissSuggestionAction,
  restoreTaskAction,
  setReferenceAction,
  setTaskStatusAction,
  updateTaskAction,
} from "@/features/timeline/actions";
import { loadPercorsoData } from "@/features/timeline/queries";
import { buildPercorsoView, resolveDataReference } from "@/features/timeline/view";
import { DEFAULT_FILTERS } from "@/features/timeline/filters";

const as = (client: TestClient) => {
  session.client = client;
};

describe("Percorso (T11) on the local stack", () => {
  let wedding: TestWedding;
  let partnerB: TestPartnerB;
  let today: string;
  let nearId: string;
  let farId: string;
  let dateDecisionId: string;

  beforeAll(async () => {
    today = todayInRome(new Date());
    wedding = await createWedding("sposo");
    partnerB = await addPartnerB(wedding);
    const a = wedding.founderClient;
    await a.from("weddings").update({ rite: "unknown" }).eq("id", wedding.weddingId);
    await a.from("wedding_partners").update({ first_name: "Tony" }).eq("slot", "A");
    await a.from("wedding_partners").update({ first_name: "Jessica" }).eq("slot", "B");

    const year = Number(today.slice(0, 4));
    const tasks = generateTasks("unknown", null).map((g) => ({
      template_key: g.templateKey,
      template_version: g.templateVersion,
      title: g.title,
      advice: g.advice,
      category: g.category,
      offset: null as unknown,
    }));
    // Real offsets come from the catalogue through the action; onboarding here only needs rows.
    const scenarios = [
      { kind: "fixed", date_from: `${year + 1}-03-12`, label: "Primavera" },
      { kind: "fixed", date_from: `${year + 1}-09-03`, label: "Mamma Rosa" },
    ];
    const done = await a.rpc("complete_onboarding", {
      p_scenarios: scenarios,
      p_tasks: tasks.slice(0, 4) as never,
    });
    expect(done.error).toBeNull();
  });

  beforeEach(() => as(wedding.founderClient));

  async function load(client: TestClient = wedding.founderClient, userId = wedding.founder.id) {
    const data = await loadPercorsoData(client, userId);
    if (!data) throw new Error("no data");
    return data;
  }

  it("the loader returns the wedding as the user sees it, with names, slot, scenarios and decisions", async () => {
    const data = await load();
    expect(data.weddingId).toBe(wedding.weddingId);
    expect(data.mySlot).toBe("A");
    expect(data.partners.map((p) => p.name).sort()).toEqual(["Jessica", "Tony"]);
    expect(data.dateDecision?.status).toBe("open");
    expect(data.scenarios).toHaveLength(2);
    expect(data.tasks.length).toBeGreaterThanOrEqual(4);
    const near = data.scenarios.find((s) => s.label === "Primavera")!;
    const far = data.scenarios.find((s) => s.label === "Mamma Rosa")!;
    nearId = near.optionId;
    farId = far.optionId;
    dateDecisionId = data.dateDecision!.id;

    const other = await load(partnerB.client, partnerB.user.id);
    expect(other.mySlot).toBe("B");
    expect(other.weddingId).toBe(data.weddingId);
  });

  it("the reference resolved in TypeScript equals the one the DB applied (AC24, same rule)", async () => {
    const data = await load();
    const resolved = resolveDataReference(data, today);
    const { data: row } = await wedding.founderClient
      .from("weddings")
      .select("applied_reference_date")
      .single();
    expect(resolved?.scenarioId).toBe(nearId);
    expect(resolved?.date).toBe(row?.applied_reference_date);
  });

  it("another wedding's data is never loaded (RLS)", async () => {
    const stranger = await createWedding("sposa");
    const data = await load(stranger.founderClient, stranger.founder.id);
    expect(data.weddingId).toBe(stranger.weddingId);
    expect(data.tasks).toHaveLength(0);
    expect(data.scenarios).toHaveLength(0);
  });

  describe("task writes", () => {
    it("creates a user task with assignee and reminder; invalid input is refused", async () => {
      const bad = await createTaskAction({
        title: "  ",
        dueDate: null,
        category: null,
        notes: null,
        assignee: "both",
        remindersEnabled: true,
      });
      expect(bad).toMatchObject({ ok: false, code: "invalid" });
      const badDate = await createTaskAction({
        title: "x",
        dueDate: "2027-02-31",
        category: null,
        notes: null,
        assignee: "both",
        remindersEnabled: true,
      });
      expect(badDate).toMatchObject({ ok: false, code: "invalid" });

      const result = await createTaskAction({
        title: "Provare l'abito",
        dueDate: `${today.slice(0, 4)}-12-20`,
        category: "abiti",
        notes: "  con la sarta ",
        assignee: "B",
        remindersEnabled: false,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const { data: row } = await wedding.founderClient
        .from("tasks")
        .select("*")
        .eq("id", result.data.id)
        .single();
      expect(row).toMatchObject({
        source: "user",
        assignee: "B",
        reminders_enabled: false,
        notes: "con la sarta",
        category: "abiti",
        created_by: wedding.founder.id,
        due_overridden: false,
      });
    });

    it("update with the current version works; changing the date marks it as overridden (AC28)", async () => {
      const created = await createTaskAction({
        title: "Fiori",
        dueDate: null,
        category: null,
        notes: null,
        assignee: "both",
        remindersEnabled: true,
      });
      if (!created.ok) throw new Error("create");
      const updated = await updateTaskAction({
        id: created.data.id,
        expectedVersion: created.data.version,
        fields: {
          title: "Fiori e candele",
          dueDate: `${today.slice(0, 4)}-12-30`,
          category: null,
          notes: null,
          assignee: "A",
          remindersEnabled: true,
        },
      });
      expect(updated.ok).toBe(true);
      const { data: row } = await wedding.founderClient
        .from("tasks")
        .select("*")
        .eq("id", created.data.id)
        .single();
      expect(row).toMatchObject({ title: "Fiori e candele", assignee: "A", due_overridden: true });
    });

    it("a stale version is a conflict with the partner's name and version, never an overwrite (AC40)", async () => {
      const created = await createTaskAction({
        title: "Musica",
        dueDate: null,
        category: null,
        notes: null,
        assignee: "both",
        remindersEnabled: true,
      });
      if (!created.ok) throw new Error("create");
      const seen = created.data.version;

      as(partnerB.client);
      const b = await updateTaskAction({
        id: created.data.id,
        expectedVersion: seen,
        fields: {
          title: "Musica dal vivo",
          dueDate: null,
          category: null,
          notes: null,
          assignee: "both",
          remindersEnabled: true,
        },
      });
      expect(b.ok).toBe(true);

      as(wedding.founderClient);
      const stale = await updateTaskAction({
        id: created.data.id,
        expectedVersion: seen,
        fields: {
          title: "Musica DJ",
          dueDate: null,
          category: null,
          notes: null,
          assignee: "both",
          remindersEnabled: true,
        },
      });
      expect(stale.ok).toBe(false);
      if (stale.ok) return;
      expect(stale.conflict?.changedByName).toBe("Jessica");
      expect(stale.conflict?.theirs.title).toBe("Musica dal vivo");
      const { data: row } = await wedding.founderClient
        .from("tasks")
        .select("title")
        .eq("id", created.data.id)
        .single();
      expect(row?.title).toBe("Musica dal vivo");

      // "Salva comunque": retry on the version the other partner left.
      const forced = await updateTaskAction({
        id: created.data.id,
        expectedVersion: stale.conflict!.currentVersion,
        fields: {
          title: "Musica DJ",
          dueDate: null,
          category: null,
          notes: null,
          assignee: "both",
          remindersEnabled: true,
        },
      });
      expect(forced.ok).toBe(true);
    });

    it("complete, reopen, delete and restore (AC31); a deleted task keeps its key and is never re-suggested", async () => {
      const created = await createTaskAction({
        title: "Inviti",
        dueDate: null,
        category: null,
        notes: null,
        assignee: "both",
        remindersEnabled: true,
      });
      if (!created.ok) throw new Error("create");
      const done = await setTaskStatusAction({
        id: created.data.id,
        expectedVersion: created.data.version,
        done: true,
      });
      expect(done.ok).toBe(true);
      if (!done.ok) return;
      const { data: row } = await wedding.founderClient
        .from("tasks")
        .select("status, completed_by")
        .eq("id", created.data.id)
        .single();
      expect(row).toMatchObject({ status: "done", completed_by: wedding.founder.id });

      const reopened = await setTaskStatusAction({
        id: created.data.id,
        expectedVersion: done.data.version,
        done: false,
      });
      expect(reopened.ok).toBe(true);
      if (!reopened.ok) return;
      const removed = await deleteTaskAction({
        id: created.data.id,
        expectedVersion: reopened.data.version,
      });
      expect(removed.ok).toBe(true);
      if (!removed.ok) return;
      const data = await load();
      expect(data.tasks.find((t) => t.id === created.data.id)?.deleted).toBe(true);
      const restored = await restoreTaskAction({
        id: created.data.id,
        expectedVersion: removed.data.version,
      });
      expect(restored.ok).toBe(true);
      const after = await load();
      expect(after.tasks.find((t) => t.id === created.data.id)?.deleted).toBe(false);
    });

    it("a task that does not exist or is stale on delete reports not_found / conflict", async () => {
      const ghost = await deleteTaskAction({
        id: "11111111-1111-4111-8111-111111111111",
        expectedVersion: 1,
      });
      expect(ghost).toMatchObject({ ok: false, code: "not_found" });
      expect(await deleteTaskAction({ id: "nope", expectedVersion: 1 })).toMatchObject({
        ok: false,
        code: "invalid",
      });
    });
  });

  describe("reference and preview", () => {
    it("preview is pure: the view for another scenario writes nothing and the DB reference does not move", async () => {
      const before = await wedding.founderClient
        .from("weddings")
        .select("applied_reference_date, version")
        .single();
      const data = await load();
      const view = buildPercorsoView({ data, today, previewId: farId, filters: DEFAULT_FILTERS });
      expect(view.preview?.scenario.optionId).toBe(farId);
      const after = await wedding.founderClient
        .from("weddings")
        .select("applied_reference_date, version")
        .single();
      expect(after.data).toEqual(before.data);
    });

    it("sets a manual reference, returns the previous one for 'Annulla', and undoes it", async () => {
      const set = await setReferenceAction({ optionId: farId });
      expect(set.ok).toBe(true);
      if (!set.ok) return;
      expect(set.data.previousOptionId).toBeNull();
      let data = await load();
      expect(data.manualReferenceId).toBe(farId);
      expect(resolveDataReference(data, today)?.scenarioId).toBe(farId);
      expect(resolveDataReference(data, today)?.source).toBe("manual");
      // the strip and the "scelto da" name come from the decision events
      const view = buildPercorsoView({ data, today, previewId: null, filters: DEFAULT_FILTERS });
      expect(view.reference?.setByName).toBe("Tony");

      const undone = await setReferenceAction({ optionId: set.data.previousOptionId });
      expect(undone.ok).toBe(true);
      data = await load();
      expect(data.manualReferenceId).toBeNull();
      expect(resolveDataReference(data, today)?.scenarioId).toBe(nearId);
    });

    it("an unknown scenario is refused with a clear code", async () => {
      const result = await setReferenceAction({ optionId: "22222222-2222-4222-8222-222222222222" });
      expect(result).toMatchObject({ ok: false, code: "invalid_option" });
    });

    it("the partner sees the strip 'Scadenze ricalcolate' after changing the reference (DES-19)", async () => {
      as(partnerB.client);
      const set = await setReferenceAction({ optionId: farId });
      expect(set.ok).toBe(true);
      const data = await load();
      const sinceYesterday = new Date(Date.now() - 86_400_000).toISOString();
      const view = buildPercorsoView({
        data: { ...data, previousSeenAt: sinceYesterday },
        today,
        previewId: null,
        filters: DEFAULT_FILTERS,
      });
      expect(view.recalculated).toEqual({ byName: "Jessica" });
      as(wedding.founderClient);
      await setReferenceAction({ optionId: null });
    });

    it("once the decision is taken the reference cannot be changed and the picker is gone", async () => {
      const choose = await wedding.founderClient.rpc("choose_option", {
        p_decision_id: dateDecisionId,
        p_option_id: farId,
      });
      expect(choose.error).toBeNull();
      const refused = await setReferenceAction({ optionId: nearId });
      expect(refused).toMatchObject({ ok: false, code: "decision_taken" });
      const data = await load();
      const view = buildPercorsoView({ data, today, previewId: nearId, filters: DEFAULT_FILTERS });
      expect(view.reference?.status).toBe("definitive");
      expect(view.pickerAvailable).toBe(false);
      expect(view.previewClosed).toBe("taken");
    });

    it("reopening flags dependent tasks 'Da rivedere'; 'Va bene così' clears them (AC20)", async () => {
      // give the wedding a date-dependent generated task, then reopen
      const accepted = await acceptSuggestedTaskAction({ templateKey: "scegli-catering" });
      expect(accepted.ok).toBe(true);
      const reopen = await wedding.founderClient.rpc("reopen_decision", {
        p_decision_id: dateDecisionId,
        p_reason: "Vogliamo rivedere la data",
      });
      expect(reopen.error).toBeNull();
      let data = await load();
      let view = buildPercorsoView({ data, today, previewId: null, filters: DEFAULT_FILTERS });
      expect(view.reopened).toBe(true);
      expect(view.reference?.status).toBe("provisional");
      expect(view.reviewCount).toBeGreaterThan(0);

      const ack = await acknowledgeReviewAction({ taskId: null });
      expect(ack.ok).toBe(true);
      data = await load();
      view = buildPercorsoView({ data, today, previewId: null, filters: DEFAULT_FILTERS });
      expect(view.reviewCount).toBe(0);
    });
  });

  describe("suggestions (AC16)", () => {
    it("accepting inserts a copy of the milestone with the DB-computed due date; ignoring is remembered", async () => {
      const data = await load();
      const view = buildPercorsoView({
        data: { ...data, rite: "civile" },
        today,
        previewId: null,
        filters: DEFAULT_FILTERS,
      });
      const addition = view.suggestions.additions.find((m) => m.offset !== null);
      const another = view.suggestions.additions.find((m) => m.key !== addition?.key);
      expect(addition && another).toBeTruthy();

      const accepted = await acceptSuggestedTaskAction({ templateKey: addition!.key });
      expect(accepted).toMatchObject({ ok: true, data: 1 });
      const { data: row } = await wedding.founderClient
        .from("tasks")
        .select("source, template_key, title, due_date, template_offset")
        .eq("template_key", addition!.key)
        .single();
      expect(row).toMatchObject({ source: "template", title: addition!.title });
      expect(row?.template_offset).toEqual(addition!.offset);
      expect(row?.due_date).not.toBeNull();
      // idempotent: the same key again inserts nothing
      expect(await acceptSuggestedTaskAction({ templateKey: addition!.key })).toMatchObject({
        ok: true,
        data: 0,
      });
      expect(await acceptSuggestedTaskAction({ templateKey: "not-a-milestone" })).toMatchObject({
        ok: false,
        code: "invalid",
      });

      expect((await dismissSuggestionAction({ templateKey: another!.key, kind: "add" })).ok).toBe(
        true,
      );
      expect((await dismissSuggestionAction({ templateKey: another!.key, kind: "add" })).ok).toBe(
        true,
      );
      const after = await load();
      const next = buildPercorsoView({
        data: { ...after, rite: "civile" },
        today,
        previewId: null,
        filters: DEFAULT_FILTERS,
      });
      expect(next.suggestions.additions.map((m) => m.key)).not.toContain(another!.key);
      expect(next.suggestions.additions.map((m) => m.key)).not.toContain(addition!.key);
    });
  });
});
