import "server-only";
import { readEmailConfig, type EmailConfig, type Env } from "@/lib/app-config";
import { createSmtpSender } from "./smtp";
import { ResendSender } from "./resend";
import type { EmailSender, EmailSendResult } from "./types";

export type {
  EmailMessage,
  EmailSender,
  EmailSendResult,
  RenderedEmail,
  UnsubscribableKind,
} from "./types";

/**
 * The single email switch (plan §7, AC59): true only for `resend` with key and sender, or `smtp`
 * (local/CI) with a host. Absent / `none` / incomplete means NO email. Never throws.
 */
export function emailEnabled(env: Env = process.env): boolean {
  return resolveConfig(env).enabled;
}

/** `smtp` (clear text, local catcher) is refused on Vercel Production: it is local/CI only. */
function resolveConfig(env: Env): EmailConfig {
  const config = readEmailConfig(env);
  if (config.transport === "smtp" && env["VERCEL_ENV"] === "production") {
    return { transport: "none", enabled: false, reason: "smtp not allowed in production" };
  }
  return config;
}

/** Used when emails are off. The callers check `emailEnabled()` first, so it is never reached. */
export class NullSender implements EmailSender {
  readonly transport = "none" as const;
  async send(): Promise<EmailSendResult> {
    return { ok: false, error: "email_disabled", retryable: false };
  }
}

const LOCAL_FROM = "roadmap2yes <noreply@example.test>";

/** Sender for the current runtime configuration; `NullSender` when emails are off. */
export function getEmailSender(env: Env = process.env): EmailSender {
  const config = resolveConfig(env);
  switch (config.transport) {
    case "resend":
      return new ResendSender(config.apiKey, config.from);
    case "smtp":
      return createSmtpSender(config, env["EMAIL_FROM"]?.trim() || LOCAL_FROM);
    default:
      return new NullSender();
  }
}
