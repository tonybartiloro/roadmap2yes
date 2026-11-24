/** Email layer contracts (plan §7). Pure types: safe to import anywhere. */

/** Email that a user can switch off (AC52). Invite, security and reset emails are NOT listed. */
export type UnsubscribableKind = "reminders" | "digest";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative (always present). */
  text: string;
  /** Extra headers (`List-Unsubscribe`...). CR/LF are stripped by the senders. */
  headers?: Readonly<Record<string, string>>;
  /** Passed to Resend as `Idempotency-Key` (e.g. the reminder `batch_key`). */
  idempotencyKey?: string;
}

export type EmailSendResult =
  | { ok: true; id?: string }
  /** `retryable`: a later attempt may succeed (network, 429, 5xx). Never contains secrets. */
  | { ok: false; error: string; retryable: boolean };

/** The single sending interface. `send` never throws: failures come back as a result. */
export interface EmailSender {
  readonly transport: "smtp" | "resend" | "none";
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/** What every template returns: ready for `EmailSender.send` once `to` is added. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}
