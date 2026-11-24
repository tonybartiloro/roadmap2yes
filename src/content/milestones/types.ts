import { z } from "zod";
import type { DateOffset } from "@/lib/dates/plain-date";

/**
 * Rites, aligned with `weddings.rite` (plan §3): the enum values stored by the DB are exactly these.
 * `unknown` = "Non lo so ancora" (AC63, D36). "religioso" = cattolico con effetti civili (D14).
 */
export const RITES = ["civile", "religioso", "simbolico", "unknown"] as const;
export type Rite = (typeof RITES)[number];

/** Task categories: the 11 budget categories of AC34 plus the task-only `organizzazione`. */
export const MILESTONE_CATEGORIES = [
  "organizzazione",
  "location",
  "catering",
  "abiti",
  "foto-video",
  "musica",
  "fiori-allestimento",
  "fedi",
  "partecipazioni",
  "viaggio-nozze",
  "burocrazia-varie",
  "imprevisti",
] as const;
export type MilestoneCategory = (typeof MILESTONE_CATEGORIES)[number];

export interface Milestone {
  /** Stable kebab-case id, copied to `tasks.template_key`. */
  readonly key: string;
  /** Copied to `tasks.template_version`. */
  readonly version: number;
  readonly title: string;
  readonly advice: string;
  readonly category: MilestoneCategory;
  /** Before the reference date (negative = after); `null` = independent of the date. */
  readonly offset: DateOffset | null;
  readonly rites: readonly Rite[];
  /** Lower = more important. */
  readonly priority: number;
  readonly highlightFirst: boolean;
  readonly bureaucratic: boolean;
}

const offsetSchema = z
  .object({
    months: z.number().int().optional(),
    weeks: z.number().int().optional(),
    days: z.number().int().optional(),
  })
  .strict();

export const milestoneSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    version: z.number().int().min(1),
    title: z.string().min(1).max(60),
    advice: z.string().min(1).max(220),
    category: z.enum(MILESTONE_CATEGORIES),
    offset: offsetSchema.nullable(),
    rites: z.array(z.enum(RITES)).min(1),
    priority: z.number().int(),
    highlightFirst: z.boolean(),
    bureaucratic: z.boolean(),
  })
  .strict();

const POST_EVENT_KEYS = new Set(["biglietti-ringraziamento", "chiudi-conti-budget-finale"]);
const UNKNOWN_ONLY_KEY = "scegli-il-rito";

function isNegative(offset: DateOffset): boolean {
  return (offset.months ?? 0) < 0 || (offset.weeks ?? 0) < 0 || (offset.days ?? 0) < 0;
}

/** Cross-checks of the catalogue (spec §3.8). Returns a list of problems; empty = valid. */
export function validateCatalog(milestones: readonly Milestone[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const m of milestones) {
    const parsed = milestoneSchema.safeParse(m);
    if (!parsed.success) problems.push(`${m.key}: ${parsed.error.message}`);
    if (keys.has(m.key)) problems.push(`${m.key}: duplicate key`);
    keys.add(m.key);
    if (m.offset && isNegative(m.offset) && !POST_EVENT_KEYS.has(m.key)) {
      problems.push(`${m.key}: negative offset only allowed for post-event milestones`);
    }
    if (m.bureaucratic && m.rites.includes("unknown")) {
      problems.push(`${m.key}: bureaucratic milestones are always rite-specific`);
    }
    const unknownOnly = m.rites.length === 1 && m.rites[0] === "unknown";
    if (unknownOnly !== (m.key === UNKNOWN_ONLY_KEY)) {
      problems.push(`${m.key}: only ${UNKNOWN_ONLY_KEY} may be unknown-only`);
    }
  }
  for (const rite of RITES) {
    const seen = new Map<number, string>();
    for (const m of milestones.filter((x) => x.rites.includes(rite))) {
      const other = seen.get(m.priority);
      if (other) problems.push(`${m.key}: priority ${m.priority} also used by ${other} (${rite})`);
      seen.set(m.priority, m.key);
    }
  }
  const commonHighlighted = milestones.filter(
    (m) => m.highlightFirst && RITES.every((r) => m.rites.includes(r)),
  );
  if (commonHighlighted.length > 3) problems.push("more than 3 common highlightFirst milestones");
  return problems;
}
