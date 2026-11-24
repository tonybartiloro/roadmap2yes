import type { PlainDate } from "@/lib/dates/plain-date";
import type { AuditEntry, DecisionEventEntry, NewsPerson } from "@/domain/news";
import type { PlanPayment, PlanRecipient, PlanTask } from "@/domain/reminders";

/** Ports of the daily job (plan §1.1): the job never touches Supabase directly. */

export interface JobRecipient extends PlanRecipient {
  readonly weddingId: string;
  readonly email: string;
}

export type ClaimStatus =
  | "claimed"
  | "resumed"
  | "in_progress"
  | "already_sent"
  | "skipped_quota"
  | "opted_out"
  | "failed_final";

export interface ClaimResult {
  readonly status: ClaimStatus;
  readonly id?: number;
  readonly reason?: "daily" | "monthly";
}

export interface ClaimRequest {
  readonly userId: string;
  readonly weddingId: string;
  readonly kind: "reminder" | "digest";
  readonly batchKey: string;
  readonly itemKeys: readonly string[];
  readonly dailyCap: number;
  readonly monthlyCap: number;
  readonly now: Date;
}

export interface QuotaStatus {
  readonly sentToday: number;
  readonly sentMonth: number;
  readonly skippedToday: number;
  readonly skippedMonth: number;
}

/** Everything the planner needs about one wedding. */
export interface WeddingJobData {
  readonly tasks: readonly PlanTask[];
  readonly payments: readonly PlanPayment[];
  /** The "date" decision is taken: reference dates are definitive, otherwise "data provvisoria". */
  readonly dateDecided: boolean;
  /** Rome date of the last due-date change per task (D38). */
  readonly dueChangedOn: ReadonlyMap<string, PlainDate>;
  readonly people: readonly NewsPerson[];
  readonly audit: readonly AuditEntry[];
  readonly decisionEvents: readonly DecisionEventEntry[];
}

export interface JobDb {
  /** Recomputes the automatic references (`sync_timeline`, secret key). Returns weddings handled. */
  syncTimeline(): Promise<number>;
  recordHeartbeat(details: Record<string, unknown>): Promise<void>;
  /** Members with their switches (D44 is enforced by the database). */
  recipients(): Promise<JobRecipient[]>;
  loadWeddingData(weddingId: string, now: Date): Promise<WeddingJobData>;
  /** Item keys of OTHER reminder batches (claimed or sent) since `since`: never remind twice. */
  doneItemKeys(userId: string, exceptBatchKey: string, since: Date): Promise<string[]>;
  claim(request: ClaimRequest): Promise<ClaimResult>;
  markSent(id: number, now: Date): Promise<void>;
  fail(id: number, error: string): Promise<void>;
  quotaStatus(now: Date): Promise<QuotaStatus>;
}

export interface JobClock {
  now(): Date;
}

export interface JobCaps {
  readonly daily: number;
  readonly monthly: number;
}

export interface BatchCounters {
  sent: number;
  /** Cap reached: not sent, re-evaluated at the next run (AC53). */
  skippedQuota: number;
  /** Somebody else holds the claim, already delivered, opted out or too many attempts. */
  skippedOther: number;
  failed: number;
}

export interface JobSummary {
  ranAt: string;
  today: PlainDate;
  emailEnabled: boolean;
  weddingsSynced: number;
  reminders: BatchCounters;
  digests: BatchCounters;
  /** Users whose email could not even be prepared (never claimed). */
  errors: number;
  quota: QuotaStatus | null;
  /** AC53: a cap was hit in this run, or sends were skipped for quota today. */
  overQuota: boolean;
  /** At least one send or step failed: the route answers 500 so the scheduler reports it. */
  ok: boolean;
}
