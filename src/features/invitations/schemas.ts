import { z } from "zod";
import { normalizeEmail } from "@/lib/app-config";

/** Shape checks of the partner forms. The code POLICY is `lib/access-code.ts` (run by the service). */

const email = z.string().max(254).transform(normalizeEmail).pipe(z.email());

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => {
      const trimmed = (value ?? "").trim();
      return trimmed === "" ? null : trimmed;
    });

export const partnerSchema = z.object({
  email,
  firstName: optionalText(80),
  lastName: optionalText(80),
  label: optionalText(40),
});

export const partnerWithCodeSchema = partnerSchema.extend({
  code: z.string().min(1).max(200),
});

export const emailOnlySchema = z.object({ email });

export const invitationIdSchema = z.object({ invitationId: z.uuid() });

export const temporaryCodeSchema = z.object({ code: z.string().min(1).max(200) });

export const acceptInviteSchema = z.object({
  token: z.string().min(1).max(200),
  code: z.string().min(1).max(200),
});
