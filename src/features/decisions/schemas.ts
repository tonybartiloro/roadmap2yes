import { z } from "zod";
import { isPlainDate } from "@/lib/dates/plain-date";

/**
 * Shape of what the client sends to the server actions. The database checks stay the real
 * guard (RLS, constraints, RPC rules); this only rejects garbage early with a clean error.
 */
const uuid = z.string().uuid();
const version = z.number().int().min(1);
const plainDate = z.string().refine(isPlainDate, "data non valida");

export const optionInputSchema = z.object({
  title: z.string().trim().max(120),
  comune: z.string().trim().max(80).nullable(),
  link: z
    .string()
    .max(600)
    .regex(/^https?:\/\/[^\s]+$/i)
    .nullable(),
  notes: z.string().trim().max(2000).nullable(),
  pros: z.array(z.string().trim().min(1).max(500)).max(20),
  cons: z.array(z.string().trim().min(1).max(500)).max(20),
  costCents: z.number().int().min(0).max(100_000_000_000).nullable(),
});

export const scenarioInputSchema = z.object({
  kind: z.enum(["fixed", "period"]),
  dateFrom: plainDate,
  dateTo: plainDate.nullable(),
  locationOptionId: uuid.nullable(),
});

export const schemas = {
  choose: z.object({
    decisionId: uuid,
    optionId: uuid,
    expectedVersion: version,
    exactDate: plainDate.nullable().optional(),
  }),
  reopen: z.object({ decisionId: uuid, reason: z.string().max(5000), expectedVersion: version }),
  note: z.object({ decisionId: uuid, note: z.string().max(5000) }),
  reference: z.object({ optionId: uuid.nullable() }),
  addOption: z.object({
    decisionId: uuid,
    option: optionInputSchema,
    scenario: scenarioInputSchema.nullable().optional(),
  }),
  updateOption: z.object({ optionId: uuid, version, option: optionInputSchema }),
  updateScenario: z.object({
    scenarioId: uuid,
    version,
    scenario: scenarioInputSchema,
    locationOnly: z.boolean().optional(),
  }),
  versioned: z.object({ optionId: uuid, version }),
  reaction: z.object({ optionId: uuid, reaction: z.enum(["prefer", "doubt"]).nullable() }),
};
