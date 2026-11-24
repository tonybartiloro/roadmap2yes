/**
 * Mailpit API helper for e2e/QA (plan §2, §12). Test-only: no secrets, no `server-only`.
 *
 * - App emails (invite, notices, reminders) go to the app's own Mailpit (`MAILPIT_API_URL`,
 *   default http://127.0.0.1:54426).
 * - Supabase Auth recovery emails go to the CLI Mailpit (default http://127.0.0.1:54424);
 *   use `CLI_MAILPIT_URL` as `baseUrl` for those.
 */
export const APP_MAILPIT_URL = process.env["MAILPIT_API_URL"] ?? "http://127.0.0.1:54426";
export const CLI_MAILPIT_URL = process.env["CLI_MAILPIT_API_URL"] ?? "http://127.0.0.1:54424";

export interface MailboxOptions {
  baseUrl?: string;
}

export interface MailAddress {
  Address: string;
  Name: string;
}

export interface MailSummary {
  ID: string;
  Subject: string;
  To: MailAddress[];
  Created: string;
}

export interface MailMessage extends MailSummary {
  HTML: string;
  Text: string;
}

async function api<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, init);
  if (!response.ok)
    throw new Error(`Mailpit ${init?.method ?? "GET"} ${path} -> ${response.status}`);
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T; // e.g. DELETE answers with the plain text "ok"
  }
}

/** Deletes every message of the catcher (call in `beforeEach` of email specs). */
export async function clearMailbox(options: MailboxOptions = {}): Promise<void> {
  await api(options.baseUrl ?? APP_MAILPIT_URL, "/api/v1/messages", { method: "DELETE" });
}

/** Messages sent to `to` (newest first). */
export async function listMessagesTo(
  to: string,
  options: MailboxOptions = {},
): Promise<MailSummary[]> {
  const base = options.baseUrl ?? APP_MAILPIT_URL;
  const result = await api<{ messages?: MailSummary[] }>(
    base,
    `/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
  );
  return result.messages ?? [];
}

export async function getMessage(id: string, options: MailboxOptions = {}): Promise<MailMessage> {
  return api<MailMessage>(
    options.baseUrl ?? APP_MAILPIT_URL,
    `/api/v1/message/${encodeURIComponent(id)}`,
  );
}

/** Polls until a message to `to` (optionally with `subject` containing a substring) arrives. */
export async function waitForMessage(
  to: string,
  options: MailboxOptions & {
    subjectContains?: string;
    timeoutMs?: number;
    intervalMs?: number;
  } = {},
): Promise<MailMessage> {
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  for (;;) {
    const found = (await listMessagesTo(to, options)).find((m) =>
      options.subjectContains ? m.Subject.includes(options.subjectContains) : true,
    );
    if (found) return getMessage(found.ID, options);
    if (Date.now() > deadline) throw new Error("No email arrived in time");
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? 250));
  }
}

/** All http(s) links of the plain-text body, in order (HTML entities are not involved). */
export function extractLinks(message: Pick<MailMessage, "Text">): string[] {
  return [...message.Text.matchAll(/https?:\/\/[^\s<>"')]+/g)].map((m) => m[0]);
}
