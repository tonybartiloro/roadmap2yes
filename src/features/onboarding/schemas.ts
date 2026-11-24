import { z } from "zod";
import { RITES } from "@/content/milestones";
import { STYLE_LABELS } from "@/content/style-tips";
import { normalizeEmail } from "@/lib/app-config";
import {
  GUEST_BANDS,
  MAX_BUDGET_CENTS,
  MAX_SCENARIOS,
  PARTNER_MODES,
  REGIONS,
  parseScenario,
  type ScenarioDraft,
} from "./model";

/** Shape checks of the onboarding actions (the trust boundary: nothing else validates the input). */

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => {
      const trimmed = (value ?? "").trim();
      return trimmed === "" ? null : trimmed;
    });

const email = z.string().max(254).transform(normalizeEmail).pipe(z.email());

const scenario = z
  .custom<ScenarioDraft>((value) => parseScenario(value) !== null)
  .transform((value) => parseScenario(value) as ScenarioDraft);

const you = z.object({
  step: z.literal("you"),
  firstName: z.string().trim().min(1).max(80),
  lastName: optionalText(80),
  label: optionalText(40),
});

const partner = z
  .object({
    step: z.literal("partner"),
    /** "Non lo so ancora": no partner row yet, the invite comes later. */
    skip: z.boolean(),
    email: z.string().max(254).optional(),
    firstName: optionalText(80),
    lastName: optionalText(80),
    label: optionalText(40),
    mode: z.enum(PARTNER_MODES).optional(),
    inviteAtEnd: z.boolean().optional(),
    /** Initial code (only for the mode "code"): used once, never stored, never echoed. */
    code: z.string().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.skip) return;
    if (!email.safeParse(value.email ?? "").success) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "email" });
    }
    if (!value.mode) ctx.addIssue({ code: "custom", path: ["mode"], message: "mode" });
  });

const rite = z.object({ step: z.literal("rite"), rite: z.enum(RITES) });

const dates = z.object({
  step: z.literal("dates"),
  skip: z.boolean(),
  scenarios: z.array(scenario).max(MAX_SCENARIOS),
});

const guests = z.object({ step: z.literal("guests"), band: z.enum(GUEST_BANDS) });

const budget = z.object({
  step: z.literal("budget"),
  skip: z.boolean(),
  totalCents: z.number().int().min(0).max(MAX_BUDGET_CENTS).nullable(),
});

const style = z.object({
  step: z.literal("style"),
  skip: z.boolean(),
  styleLabel: z
    .string()
    .refine((value) => STYLE_LABELS.includes(value))
    .nullable(),
  styleNote: optionalText(500),
  region: z
    .string()
    .refine((value) => (REGIONS as readonly string[]).includes(value))
    .nullable(),
  comune: optionalText(80),
});

export const stepSchema = z.discriminatedUnion("step", [
  you,
  partner,
  rite,
  dates,
  guests,
  budget,
  style,
]);

export const finishSchema = z.object({ skipTheme: z.boolean() });

export type StepInput = z.infer<typeof stepSchema>;
export type PartnerInput = z.infer<typeof partner>;
