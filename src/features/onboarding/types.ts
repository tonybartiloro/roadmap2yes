import type { Failure, OnboardingState, Warning } from "./data";

/** Plain, serializable results of the onboarding server actions. */

export type StepActionResult = { readonly ok: true; readonly state: OnboardingState } | Failure;

/** What happened to the invitation of the partner when the onboarding closed. */
export type InviteOutcome =
  | { readonly kind: "none" }
  | { readonly kind: "joined" }
  | { readonly kind: "later" }
  | { readonly kind: "code_ready" }
  /** The email invitation was already made (a retry): nothing is sent twice. */
  | { readonly kind: "email_pending" }
  /** The couple chose the email invite but the emails are off: nothing was sent. */
  | { readonly kind: "email_off" }
  | { readonly kind: "sent"; readonly link: string }
  | { readonly kind: "not_sent"; readonly link: string }
  | { readonly kind: "failed"; readonly message: string };

export interface OnboardingSummary {
  readonly state: OnboardingState;
  readonly tasksCreated: number;
  readonly referenceDate: string | null;
  readonly referenceStatus: "provisional" | "definitive" | null;
  readonly warnings: readonly Warning[];
  readonly invite: InviteOutcome;
}

export type FinishActionResult =
  { readonly ok: true; readonly summary: OnboardingSummary } | Failure;
