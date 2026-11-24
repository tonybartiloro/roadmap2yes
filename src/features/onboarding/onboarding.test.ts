import { describe, expect, it } from "vitest";
import { STYLE_TIPS, STYLE_LABELS, STYLE_TIP_UNKNOWN, styleTipFor } from "@/content/style-tips";
import { getMilestone } from "@/content/milestones";
import {
  EMPTY_ANSWERS,
  STEP_COUNT,
  STEP_IDS,
  advanceLastStep,
  labelChoiceOf,
  labelFromChoice,
  parseAnswers,
  parseScenario,
  parseUnknown,
  periodBounds,
  resumeStep,
  scenarioProblem,
  stepAt,
  stepNumber,
  toRpcScenario,
  withUnknown,
} from "./model";
import { finishSchema, stepSchema } from "./schemas";
import { buildTaskPayload } from "./tasks";

const scenario = {
  id: "s-1",
  kind: "fixed",
  dateFrom: "2027-09-03",
  dateTo: null,
  label: null,
};

describe("steps and resume (AC12)", () => {
  it("has the eight steps in the order of AC12", () => {
    expect(STEP_IDS).toEqual([
      "you",
      "partner",
      "rite",
      "dates",
      "guests",
      "budget",
      "style",
      "theme",
    ]);
    expect(STEP_COUNT).toBe(8);
    expect(stepNumber("dates")).toBe(4);
    expect(stepAt(0)).toBe("you");
    expect(stepAt(99)).toBe("theme");
  });

  it("resumes after the last confirmed step", () => {
    expect(resumeStep(EMPTY_ANSWERS)).toBe("you");
    expect(resumeStep({ ...EMPTY_ANSWERS, lastStep: 3 })).toBe("dates");
    expect(resumeStep({ ...EMPTY_ANSWERS, lastStep: 8 })).toBe("theme");
  });

  it("never rewinds when an earlier step is confirmed again", () => {
    expect(advanceLastStep({ ...EMPTY_ANSWERS, lastStep: 5 }, "rite")).toBe(5);
    expect(advanceLastStep({ ...EMPTY_ANSWERS, lastStep: 2 }, "dates")).toBe(4);
  });

  it("keeps the skipped steps without duplicates", () => {
    const once = withUnknown([], "budget", true);
    expect(withUnknown(once, "budget", true)).toEqual(["budget"]);
    expect(withUnknown(once, "budget", false)).toEqual([]);
    expect(parseUnknown(["style", "nope", "budget"])).toEqual(["budget", "style"]);
    expect(parseUnknown("x")).toEqual([]);
  });
});

describe("saved answers", () => {
  it("reads garbage as the empty answers and drops invalid scenarios", () => {
    expect(parseAnswers(null)).toEqual(EMPTY_ANSWERS);
    expect(parseAnswers([])).toEqual(EMPTY_ANSWERS);
    const parsed = parseAnswers({
      lastStep: 99,
      partnerMode: "email",
      inviteAtEnd: false,
      budgetCents: -5,
      scenarios: [
        scenario,
        { ...scenario, id: "s-2", kind: "period", dateTo: null },
        { ...scenario, id: "s-3", dateFrom: "1999-01-01" },
        "x",
      ],
    });
    expect(parsed.lastStep).toBe(8);
    expect(parsed.partnerMode).toBe("email");
    expect(parsed.inviteAtEnd).toBe(false);
    expect(parsed.budgetCents).toBeNull();
    expect(parsed.scenarios.map((s) => s.id)).toEqual(["s-1"]);
  });

  it("never stores a code: the answers have no field for it", () => {
    const keys = Object.keys(parseAnswers({ code: "Secret12345", lastStep: 2 }));
    expect(keys.join(",")).not.toMatch(/code|codice|password/i);
  });
});

describe("date scenarios (AC12)", () => {
  it("a period runs from the first day of a month to the last day of another", () => {
    expect(periodBounds({ year: 2028, month: 5 }, { year: 2028, month: 6 })).toEqual({
      dateFrom: "2028-05-01",
      dateTo: "2028-06-30",
    });
    expect(periodBounds({ year: 2028, month: 2 }, { year: 2028, month: 2 }).dateTo).toBe(
      "2028-02-29",
    );
  });

  it("validates fixed dates and periods", () => {
    expect(parseScenario(scenario)).not.toBeNull();
    expect(parseScenario({ ...scenario, kind: "period", dateTo: "2027-09-01" })).toBeNull();
    expect(parseScenario({ ...scenario, dateFrom: "2101-01-01" })).toBeNull();
    expect(scenarioProblem({ ...scenario, dateFrom: "" } as never)).toBe("Scegli la data.");
    expect(scenarioProblem({ ...scenario, kind: "period", dateTo: null } as never)).toBe(
      "Scegli fino a quando.",
    );
  });

  it("maps to the complete_onboarding shape", () => {
    expect(toRpcScenario(parseScenario(scenario)!)).toEqual({
      kind: "fixed",
      date_from: "2027-09-03",
    });
    const period = parseScenario({
      ...scenario,
      kind: "period",
      dateFrom: "2028-05-01",
      dateTo: "2028-06-30",
      label: "Se la location è libera",
    })!;
    expect(toRpcScenario(period)).toEqual({
      kind: "period",
      date_from: "2028-05-01",
      date_to: "2028-06-30",
      label: "Se la location è libera",
    });
  });
});

describe("partner label", () => {
  it("round-trips sposo / sposa / free text / none", () => {
    expect(labelChoiceOf("sposo")).toBe("sposo");
    expect(labelChoiceOf("sposa")).toBe("sposa");
    expect(labelChoiceOf("sposina")).toBe("custom");
    expect(labelChoiceOf(null)).toBe("none");
    expect(labelFromChoice("sposa", "x")).toBe("sposa");
    expect(labelFromChoice("custom", "  sposina ")).toBe("sposina");
    expect(labelFromChoice("custom", "  ")).toBeNull();
    expect(labelFromChoice("none", "x")).toBeNull();
  });
});

describe("initial Percorso payload (AC14, AC63)", () => {
  it("maps each milestone offset and sends no date", () => {
    const payload = buildTaskPayload("civile");
    expect(payload.length).toBeGreaterThan(10);
    for (const task of payload) {
      expect(task).not.toHaveProperty("due_date");
      expect(task.offset).toEqual(getMilestone(task.template_key)?.offset ?? null);
    }
    expect(payload.some((task) => task.offset !== null)).toBe(true);
  });

  it("rite 'non lo so' gets the common tasks plus 'Scegli il rito'; a missing rite is the same", () => {
    const unknown = buildTaskPayload("unknown").map((task) => task.template_key);
    expect(unknown).toContain("scegli-il-rito");
    expect(buildTaskPayload(null).map((task) => task.template_key)).toEqual(unknown);
    expect(buildTaskPayload("civile").map((task) => task.template_key)).not.toContain(
      "scegli-il-rito",
    );
  });
});

describe("style tips (D18)", () => {
  it("has one tip per label, short headlines, no emoji", () => {
    expect(STYLE_LABELS).toEqual([
      "Classico",
      "Rustico",
      "Boho",
      "Moderno",
      "Intimo",
      "Festa grande",
      "Destination",
      "Altro",
    ]);
    for (const tip of STYLE_TIPS) {
      expect(tip.headline.length).toBeLessThanOrEqual(40);
      expect(tip.tip).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    expect(styleTipFor("Rustico").id).toBe("rustico");
    expect(styleTipFor(null)).toBe(STYLE_TIP_UNKNOWN);
    expect(styleTipFor("Inventato")).toBe(STYLE_TIP_UNKNOWN);
  });
});

describe("step schema (the trust boundary)", () => {
  it("needs a first name for step 1", () => {
    expect(stepSchema.safeParse({ step: "you", firstName: "  " }).success).toBe(false);
    expect(stepSchema.safeParse({ step: "you", firstName: "Anna", lastName: "" }).success).toBe(
      true,
    );
  });

  it("step 2 needs a valid email and a mode unless skipped", () => {
    expect(stepSchema.safeParse({ step: "partner", skip: true }).success).toBe(true);
    expect(stepSchema.safeParse({ step: "partner", skip: false, mode: "code" }).success).toBe(
      false,
    );
    expect(
      stepSchema.safeParse({ step: "partner", skip: false, email: "no", mode: "code" }).success,
    ).toBe(false);
    const ok = stepSchema.safeParse({
      step: "partner",
      skip: false,
      email: " Luca@Example.TEST ",
      mode: "later",
    });
    expect(ok.success && ok.data.step === "partner" && ok.data.email).toBe(" Luca@Example.TEST ");
  });

  it("refuses unknown steps, bad enums and too many scenarios", () => {
    expect(stepSchema.safeParse({ step: "rite", rite: "pagano" }).success).toBe(false);
    expect(stepSchema.safeParse({ step: "nope" }).success).toBe(false);
    expect(stepSchema.safeParse({ step: "guests", band: "tanti" }).success).toBe(false);
    expect(
      stepSchema.safeParse({
        step: "dates",
        skip: false,
        scenarios: Array.from({ length: 11 }, (_, i) => ({ ...scenario, id: `s-${i}` })),
      }).success,
    ).toBe(false);
    expect(
      stepSchema.safeParse({
        step: "style",
        skip: false,
        styleLabel: "Gotico",
        styleNote: null,
        region: null,
        comune: null,
      }).success,
    ).toBe(false);
    expect(stepSchema.safeParse({ step: "budget", skip: false, totalCents: 12.5 }).success).toBe(
      false,
    );
    expect(finishSchema.safeParse({ skipTheme: "yes" }).success).toBe(false);
  });
});
