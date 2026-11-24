import type { NameParts } from "@/lib/display-name";

/** `audit_log` row (camelCase). Only whitelisted tables/columns are turned into news. */
export interface AuditEntry {
  readonly id: string | number;
  /** ISO timestamp. */
  readonly at: string;
  readonly actorId: string | null;
  readonly tableName: string;
  readonly op: "INSERT" | "UPDATE" | "DELETE";
  readonly oldData?: Readonly<Record<string, unknown>> | null;
  readonly newData?: Readonly<Record<string, unknown>> | null;
}

export type AccountEventKind =
  "partner_account_created" | "temp_code_set" | "code_changed" | "email_changed" | "invite_revoked";

export interface AccountEventEntry {
  readonly id: string | number;
  readonly at: string;
  readonly kind: AccountEventKind;
  readonly actorId: string;
  readonly targetUserId: string | null;
}

export type DecisionEventKind =
  | "option_added"
  | "option_updated"
  | "option_removed"
  | "chosen"
  | "reopened"
  | "note"
  | "reference_set"
  | "reference_auto";

/** `decision_events` row joined with its decision key and the option title. */
export interface DecisionEventEntry {
  readonly id: string | number;
  readonly at: string;
  readonly kind: DecisionEventKind;
  /** `null` = system event (e.g. automatic reference), shown with a neutral phrase. */
  readonly actorId: string | null;
  /** `decisions.key`, e.g. "date" or "location"; other keys fall back to a generic phrase. */
  readonly decisionKey: string;
  readonly optionTitle?: string | null;
  /** For `reference_set` / `reference_auto`: the date the deadlines now follow. */
  readonly referenceDate?: string | null;
}

export interface NewsPerson extends NameParts {
  readonly userId: string;
}

export interface NewsInput {
  /** The user who is looking: their own actions never appear. */
  readonly viewerId: string;
  /** `user_wedding_state.previous_seen_at`; `null` = first visit (welcome card instead, DES-20). */
  readonly since: string | null;
  readonly audit?: readonly AuditEntry[];
  readonly accountEvents?: readonly AccountEventEntry[];
  readonly decisionEvents?: readonly DecisionEventEntry[];
  readonly people: readonly NewsPerson[];
  readonly limit?: number;
}

export interface NewsItem {
  readonly id: string;
  readonly at: string;
  readonly actorId: string | null;
  readonly source: "audit" | "account" | "decision";
  /** Full sentence, "Jessica ha scelto la location". */
  readonly text: string;
}
