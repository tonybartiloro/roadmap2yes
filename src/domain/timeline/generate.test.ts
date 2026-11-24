import { describe, expect, it } from "vitest";
import { MILESTONES, getMilestone } from "@/content/milestones";
import {
  generateTasks,
  previewDueDates,
  recalculateDueDates,
} from "./generate";
import { asTasks, tasksFor } from "./test-helpers";

const due = (rite: Parameters<typeof generateTasks>[0], ref: string | null) =>
  Object.fromEntries(generateTasks(rite, ref).map((t) => [t.templateKey, t.dueDate]));

describe("generateTasks per rite (AC24, AC25, AC63)", () => {
  it("civile: 43 tasks, copies with template key/version", () => {
    const tasks = generateTasks("civile", "2027-09-03");
    expect(tasks).toHaveLength(43);
    expect(tasks.every((t) => t.templateVersion === 1)).toBe(true);
    expect(tasks.find((t) => t.templateKey === "contatta-comune-celebrazione")).toBeDefined();
  });

  it("religioso 47, simbolico 41", () => {
    expect(generateTasks("religioso", null)).toHaveLength(47);
    expect(generateTasks("simbolico", null)).toHaveLength(41);
  });

  it("unknown: 38 tasks, only common + choose-rite", () => {
    const tasks = generateTasks("unknown", "2027-09-03");
    expect(tasks).toHaveLength(38);
    const keys = tasks.map((t) => t.templateKey);
    expect(keys).toContain("scegli-il-rito");
    for (const k of ["richiedi-pubblicazioni", "corso-prematrimoniale", "contatta-parrocchia", "scegli-celebrante"]) {
      expect(keys).not.toContain(k);
    }
  });

  it("without a reference only date-independent milestones have a date (null for all)", () => {
    const d = due("civile", null);
    expect(Object.values(d).every((v) => v === null)).toBe(true);
  });
});

describe("spec §5.1: civile, reference 2027-09-03", () => {
  const d = due("civile", "2027-09-03");
  it.each([
    ["conferma-location-e-caparra", "2026-09-03"],
    ["scegli-catering", "2026-10-03"],
    ["prenota-foto-e-video", "2026-11-03"],
    ["contatta-comune-celebrazione", "2026-11-03"],
    ["scegli-abiti", "2026-12-03"],
    ["scegli-musica", "2026-12-03"],
    ["scegli-testimoni", "2027-01-03"],
    ["apri-lista-nozze", "2027-02-03"],
    ["scegli-fedi", "2027-03-03"],
    ["documenti-pubblicazioni", "2027-04-03"],
    ["richiedi-pubblicazioni", "2027-05-03"],
    ["letture-musica-cerimonia", "2027-06-03"],
    ["invia-partecipazioni", "2027-06-19"],
    ["regime-patrimoniale", "2027-07-03"],
    ["riconferma-fornitori", "2027-07-23"],
    ["raccogli-conferme", "2027-07-30"],
    ["documenti-testimoni", "2027-08-03"],
    ["numero-finale-e-menu", "2027-08-06"],
    ["programma-giornata", "2027-08-13"],
    ["ritira-abiti-fedi", "2027-08-27"],
    ["kit-emergenza", "2027-08-31"],
    ["biglietti-ringraziamento", "2027-09-17"],
    ["chiudi-conti-budget-finale", "2027-10-01"],
  ])("%s -> %s", (key, expected) => {
    expect(d[key]).toBe(expected);
  });

  it("the 4 date-independent civil milestones have no date", () => {
    for (const k of ["scegli-data-e-location", "definisci-budget-iniziale", "lista-invitati-preliminare", "decidi-stile-e-priorita"]) {
      expect(d[k]).toBeNull();
    }
  });
});

describe("spec §5.2-5.4 through the catalogue", () => {
  it("2027-08-31: end-of-month, discriminating 2m+2w and post-event", () => {
    const d = due("civile", "2027-08-31");
    expect(d["conferma-location-e-caparra"]).toBe("2026-08-31");
    expect(d["scegli-catering"]).toBe("2026-09-30");
    expect(d["scegli-fiori-allestimento"]).toBe("2027-02-28");
    expect(d["invia-partecipazioni"]).toBe("2027-06-16");
    expect(d["ritira-abiti-fedi"]).toBe("2027-08-24");
    expect(d["kit-emergenza"]).toBe("2027-08-28");
    expect(d["biglietti-ringraziamento"]).toBe("2027-09-14");
  });

  it("2028-08-31: leap year", () => {
    const d = due("civile", "2028-08-31");
    for (const k of ["scegli-fiori-allestimento", "scegli-fedi", "alloggi-invitati"]) {
      expect(d[k]).toBe("2028-02-29");
    }
    expect(d["conferma-location-e-caparra"]).toBe("2027-08-31");
    expect(d["scegli-catering"]).toBe("2027-09-30");
    expect(d["invia-partecipazioni"]).toBe("2028-06-16");
  });

  it("period 2028-05-01 (first day)", () => {
    const d = due("civile", "2028-05-01");
    expect(d["conferma-location-e-caparra"]).toBe("2027-05-01");
    expect(d["scegli-abiti"]).toBe("2027-08-01");
    expect(d["scegli-fiori-allestimento"]).toBe("2027-11-01");
    expect(d["piano-b-imprevisti"]).toBe("2028-02-01");
    expect(d["ritira-abiti-fedi"]).toBe("2028-04-24");
  });
});

describe("recalculateDueDates (AC28, spec §5.7)", () => {
  const tasks = tasksFor("civile", "2027-09-03");

  it("moves every dependent todo task and nothing else", () => {
    const changes = recalculateDueDates(tasks, "2028-05-01");
    expect(changes).toHaveLength(43 - 4);
    expect(changes.find((c) => c.taskId === "scegli-abiti")).toEqual({
      taskId: "scegli-abiti",
      from: "2026-12-03",
      to: "2027-08-01",
    });
    const touched = new Set(changes.map((c) => c.taskId));
    for (const k of ["scegli-data-e-location", "definisci-budget-iniziale", "lista-invitati-preliminare", "decidi-stile-e-priorita"]) {
      expect(touched.has(k)).toBe(false);
    }
  });

  it("leaves overridden, completed, deleted and user tasks alone", () => {
    const t = asTasks(generateTasks("civile", "2027-09-03"), {
      "scegli-abiti": { dueOverridden: true },
      "scegli-musica": { status: "done" },
      "scegli-catering": { deleted: true },
    });
    t.push({ ...t[0]!, id: "mine", source: "user", templateKey: null, templateVersion: null, dueDate: "2027-01-01" });
    const touched = new Set(recalculateDueDates(t, "2028-05-01").map((c) => c.taskId));
    for (const k of ["scegli-abiti", "scegli-musica", "scegli-catering", "mine"]) {
      expect(touched.has(k)).toBe(false);
    }
    expect(touched.has("scegli-testimoni")).toBe(true);
  });

  it("returns nothing when the reference does not move", () => {
    expect(recalculateDueDates(tasks, "2027-09-03")).toEqual([]);
  });

  it("a null reference clears the dates of dependent tasks (AC15)", () => {
    const changes = recalculateDueDates(tasks, null);
    expect(changes).toHaveLength(39);
    expect(changes.every((c) => c.to === null)).toBe(true);
  });

  it("is idempotent when applied", () => {
    const first = recalculateDueDates(tasks, "2028-05-01");
    const applied = tasks.map((t) => {
      const c = first.find((x) => x.taskId === t.id);
      return c ? { ...t, dueDate: c.to } : t;
    });
    expect(recalculateDueDates(applied, "2028-05-01")).toEqual([]);
  });
});

describe("previewDueDates (AC32): pure, with count", () => {
  const tasks = tasksFor("civile", "2027-09-03", {
    "scegli-abiti": { dueOverridden: true },
    "scegli-musica": { status: "done" },
  });

  it("counts changing deadlines and does not mutate the input", () => {
    const snapshot = JSON.stringify(tasks);
    const result = previewDueDates(tasks, "2028-05-01");
    expect(result.changedCount).toBe(43 - 4 - 2);
    expect(result.rows).toHaveLength(43);
    expect(result.rows.find((r) => r.taskId === "scegli-abiti")).toMatchObject({ changed: false });
    expect(result.rows.find((r) => r.taskId === "scegli-testimoni")).toEqual({
      taskId: "scegli-testimoni",
      current: "2027-01-03",
      preview: "2027-09-01" > "" ? "2027-09-01" : "",
      changed: true,
    });
    expect(JSON.stringify(tasks)).toBe(snapshot);
  });

  it("previewing the current reference changes nothing", () => {
    expect(previewDueDates(tasks, "2027-09-03").changedCount).toBe(0);
  });

  it("every catalogue milestone with an offset agrees with the preview", () => {
    const rows = previewDueDates(tasksFor("religioso", "2027-09-03"), "2028-05-01").rows;
    expect(rows.filter((r) => r.changed)).toHaveLength(
      MILESTONES.filter((m) => m.rites.includes("religioso") && m.offset).length,
    );
    expect(getMilestone("scegli-testimoni")?.offset).toEqual({ months: 8 });
  });
});
