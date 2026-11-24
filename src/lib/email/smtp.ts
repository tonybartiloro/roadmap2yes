import "server-only";
import nodemailer from "nodemailer";
import { singleLine } from "./escape";
import type { EmailMessage, EmailSender, EmailSendResult } from "./types";

/** Minimal slice of a nodemailer transport (lets tests inject a mock). */
export interface MailTransport {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    headers?: Record<string, string>;
  }): Promise<{ messageId?: string }>;
}

export function cleanHeaders(headers: EmailMessage["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    out[singleLine(name)] = singleLine(value);
  }
  return out;
}

/** Local/CI sender (Mailpit catcher). Never used in production. */
export class SmtpSender implements EmailSender {
  readonly transport = "smtp" as const;

  constructor(
    private readonly mail: MailTransport,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const info = await this.mail.sendMail({
        from: this.from,
        to: singleLine(message.to),
        subject: singleLine(message.subject),
        html: message.html,
        text: message.text,
        headers: cleanHeaders(message.headers),
      });
      return info.messageId ? { ok: true, id: info.messageId } : { ok: true };
    } catch {
      // The error may embed the connection string: report a fixed, value-free message.
      return { ok: false, error: "smtp_send_failed", retryable: true };
    }
  }
}

export function createSmtpSender(config: { host: string; port: number }, from: string): SmtpSender {
  const mail = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: false,
    ignoreTLS: true, // local catcher only
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });
  return new SmtpSender(mail, from);
}
