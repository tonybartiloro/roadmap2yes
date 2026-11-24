import { z } from "zod";
import { normalizeEmail } from "@/lib/app-config";

/** Shape checks only: the access-code POLICY is `lib/access-code.ts`, never applied at login. */
const email = z.string().max(254).transform(normalizeEmail).pipe(z.email());

/** Login: any non-empty code up to a sane size (an old/weak code must fail as "incorrect", not as "invalid"). */
export const signInSchema = z.object({
  email,
  code: z.string().min(1).max(200),
});

export const recoveryRequestSchema = z.object({ email });

export const changeCodeSchema = z.object({
  currentCode: z.string().min(1).max(200),
  newCode: z.string().min(1).max(200),
});

export const changeEmailSchema = z.object({
  newEmail: email,
  newEmailConfirm: email,
  currentCode: z.string().min(1).max(200),
});

export const recoveryConfirmSchema = z.object({
  tokenHash: z.string().min(8).max(200),
  newCode: z.string().min(1).max(200),
});

/** Plain text fields of a form as a record (never the whole FormData into a log). */
export function formFields(data: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of data.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
