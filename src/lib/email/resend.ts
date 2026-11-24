import "server-only";
import { cleanHeaders } from "./smtp";
import { singleLine } from "./escape";
import type { EmailMessage, EmailSender, EmailSendResult } from "./types";

export const RESEND_API_URL = "https://api.resend.com/emails";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Production sender: plain `fetch` to the Resend REST API (no SDK, plan §7). The API key is only
 * placed in the Authorization header; it is never logged or put in a returned error.
 */
export class ResendSender implements EmailSender {
  readonly transport = "resend" as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly doFetch: FetchLike = fetch,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (message.idempotencyKey) headers["Idempotency-Key"] = singleLine(message.idempotencyKey);

    const body = {
      from: this.from,
      to: [singleLine(message.to)],
      subject: singleLine(message.subject),
      html: message.html,
      text: message.text,
      headers: cleanHeaders(message.headers),
    };

    let response: Response;
    try {
      response = await this.doFetch(RESEND_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { ok: false, error: "resend_network_error", retryable: true };
    }

    if (response.ok) {
      try {
        const json = (await response.json()) as { id?: unknown };
        return typeof json.id === "string" ? { ok: true, id: json.id } : { ok: true };
      } catch {
        return { ok: true };
      }
    }
    const retryable = response.status === 429 || response.status >= 500 || response.status === 409;
    return { ok: false, error: `resend_http_${response.status}`, retryable };
  }
}
