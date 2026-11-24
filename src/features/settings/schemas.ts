import { z } from "zod";
import { RITES } from "@/content/milestones";
import { STYLE_LABELS } from "@/content/style-tips";
import { GUEST_BANDS, REGIONS } from "@/features/onboarding/model";

/** Shape checks of the settings actions (the trust boundary). */

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => {
      const trimmed = (value ?? "").trim();
      return trimmed === "" ? null : trimmed;
    });

const version = z.number().int().min(1);

export const settingsSchema = z.object({
  version,
  rite: z.enum(RITES).nullable(),
  guestBand: z.enum(GUEST_BANDS).nullable(),
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

export const personSchema = z.object({
  partnerId: z.uuid(),
  version,
  firstName: optionalText(80),
  lastName: optionalText(80),
  label: optionalText(40),
});
