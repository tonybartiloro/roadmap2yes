import { formatShortDate, plural } from "@/components/format";
import type { NextStep, OpenDecision, PendingPayment } from "@/domain/home";
import { nextSteps, TASK_WINDOW_DAYS } from "@/domain/home";
import type { TimelineTask } from "@/domain/timeline";
import { comparePlainDates, diffDays, type PlainDate } from "@/lib/dates/plain-date";
import type { Slot, StepsData, VisitState } from "./types";

/** Task with who it belongs to (the Home keeps the viewer's and the shared ones by default). */
export interface HomeTask extends TimelineTask {
  readonly assignee: "both" | Slot;
}

// ---------------------------------------------------------------------------------------------
// Visit registration ("Novità dall'ultimo accesso", plan §9)
// ---------------------------------------------------------------------------------------------

/**
 * `record_seen()` moves `last_seen_at` into `previous_seen_at` on EVERY call. Calling it on each
 * render would make a reload erase the news before they were read, so it is called once per
 * "session": only when the last registered visit is older than this gap (or there is none).
 */
export const SESSION_GAP_MS = 30 * 60 * 1000;

/** `user_wedding_state` as the database returns it (snake_case, `record_seen()` shape). */
export interface StateRow {
  readonly last_seen_at: string | null;
  readonly previous_seen_at: string | null;
  readonly last_export_at: string | null;
  readonly welcome_dismissed_at: string | null;
}

export function needsRegister(before: StateRow | null, nowMs: number): boolean {
  if (!before?.last_seen_at) return true;
  const last = Date.parse(before.last_seen_at);
  return !Number.isFinite(last) || nowMs - last >= SESSION_GAP_MS;
}

const sameInstant = (a: string | null, b: string | null): boolean =>
  a === null || b === null ? a === b : Date.parse(a) === Date.parse(b);

/**
 * The state to use after `record_seen()` answered. If another request registered a visit in
 * between (two tabs, a prefetch), the database moved the OTHER request's "now" into
 * `previous_seen_at`; the real "previous session" is the `last_seen_at` that was there before.
 */
export function reconcileVisit(before: StateRow | null, after: StateRow): VisitState {
  const expected = before?.last_seen_at ?? null;
  const previousSeenAt = sameInstant(after.previous_seen_at, expected)
    ? after.previous_seen_at
    : expected;
  return {
    previousSeenAt,
    lastExportAt: after.last_export_at,
    welcomeDismissedAt: after.welcome_dismissed_at,
  };
}

export function visitFromRow(row: StateRow | null): VisitState {
  return {
    previousSeenAt: row?.previous_seen_at ?? null,
    lastExportAt: row?.last_export_at ?? null,
    welcomeDismissedAt: row?.welcome_dismissed_at ?? null,
  };
}

/** The welcome card is for the second partner, on a first visit, until they close it. */
export function showWelcome(visit: VisitState, mySlot: Slot | null): boolean {
  return mySlot === "B" && visit.previousSeenAt === null && visit.welcomeDismissedAt === null;
}

// ---------------------------------------------------------------------------------------------
// Prossimo passo
// ---------------------------------------------------------------------------------------------

/** "Per ora niente di urgente. Il prossimo passo è «…», tra 6 settimane." */
export function quietMessage(tasks: readonly TimelineTask[], today: PlainDate): string {
  const later = tasks
    .filter((t) => !t.deleted && t.status === "todo" && t.dueDate !== null)
    .filter((t) => diffDays(today, t.dueDate!) > TASK_WINDOW_DAYS)
    .sort((a, b) => comparePlainDates(a.dueDate!, b.dueDate!) || (a.id < b.id ? -1 : 1))[0];
  const base = "Per ora niente di urgente.";
  if (!later) return base;
  const days = diffDays(today, later.dueDate!);
  const when =
    days < 14
      ? `tra ${plural(days, "giorno", "giorni")}`
      : `tra ${plural(Math.floor(days / 7), "settimana", "settimane")}`;
  return `${base} Il prossimo passo è «${later.title}», ${when}.`;
}

export function buildSteps(input: {
  openDecisions: readonly OpenDecision[];
  tasks: readonly HomeTask[];
  payments: readonly PendingPayment[];
  mySlot: Slot | null;
  today: PlainDate;
}): StepsData {
  const { openDecisions, tasks, payments, mySlot, today } = input;
  const live = tasks.filter((t) => !t.deleted);
  const mineTasks = live.filter((t) => t.assignee === "both" || t.assignee === mySlot);
  return {
    openDecisions,
    mine: nextSteps({ openDecisions, tasks: mineTasks, payments, today }),
    all: nextSteps({ openDecisions, tasks: live, payments, today }),
    hasPartnerTasks: live.some(
      (t) => t.status === "todo" && t.assignee !== "both" && t.assignee !== mySlot,
    ),
    quiet: quietMessage(mineTasks, today),
  };
}

export interface StepView {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  readonly href: string;
  readonly cta: string;
}

/** Texts and link of one step (design §3.3, §7.1). Pure. */
export function stepView(step: NextStep, today: PlainDate): StepView {
  const key = `${step.kind}:${step.id}`;
  switch (step.kind) {
    case "decision":
      return step.decisionKind === "date"
        ? {
            key,
            title: step.title,
            detail: "Da qui partono tutte le scadenze del Percorso.",
            href: "/scelte/date",
            cta: "Confronta le date",
          }
        : {
            key,
            title: step.title,
            detail: "Confronta le location che avete in mente.",
            href: "/scelte/location",
            cta: "Confronta le location",
          };
    case "overdue-task":
      return {
        key,
        title: step.title,
        detail: `Scaduto il ${formatShortDate(step.dueDate)}. Hai ancora tempo per recuperare.`,
        href: "/percorso",
        cta: "Apri il Percorso",
      };
    case "payment":
      return {
        key,
        title: step.title,
        detail: step.overdue
          ? `Pagamento scaduto il ${formatShortDate(step.dueDate)}`
          : `Da pagare entro il ${formatShortDate(step.dueDate)}`,
        href: "/budget",
        cta: "Vai al budget",
      };
    case "upcoming-task": {
      const days = diffDays(today, step.dueDate);
      const when =
        days === 0 ? "oggi" : days === 1 ? "domani" : `tra ${plural(days, "giorno", "giorni")}`;
      return {
        key,
        title: step.title,
        detail: `Scade il ${formatShortDate(step.dueDate)} (${when})`,
        href: "/percorso",
        cta: "Apri il Percorso",
      };
    }
  }
}
