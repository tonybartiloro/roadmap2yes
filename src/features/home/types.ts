import type { Countdown, NextSteps, OpenDecision } from "@/domain/home";
import type { LastExport } from "@/domain/export";
import type { UpcomingPayment } from "@/domain/budget";
import type { NewsItem } from "@/domain/news";
import type { PlainDate } from "@/lib/dates/plain-date";

/**
 * Serializable shapes of the Home. Every block of the page is a `Section`: if one read fails the
 * others still render and the failed one shows a card with "Riprova" (design §4, AC39).
 */
export type Section<T> = { readonly ok: true; readonly data: T } | { readonly ok: false };

export type Slot = "A" | "B";

export interface Person {
  readonly userId: string | null;
  readonly slot: Slot;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly label: string | null;
}

/** `user_wedding_state` of the viewer, as it is AFTER this visit was registered. */
export interface VisitState {
  /** Start of the previous session: "Novità" are the changes after it. `null` = first visit. */
  readonly previousSeenAt: string | null;
  readonly lastExportAt: string | null;
  readonly welcomeDismissedAt: string | null;
}

export interface ReferenceData {
  readonly value: Countdown;
  /** Who set a manual reference ("scelto da Tony"). */
  readonly setBy: string | null;
  /** Candidate location linked to the reference date (AC60). */
  readonly locationName: string | null;
}

export interface StepsData {
  readonly openDecisions: readonly OpenDecision[];
  /** Open tasks of the viewer and the shared ones. */
  readonly mine: NextSteps;
  /** Same, with the partner's tasks too (the "Mostra anche i compiti di {partner}" switch). */
  readonly all: NextSteps;
  /** Partner-only open tasks exist: the switch is worth showing. */
  readonly hasPartnerTasks: boolean;
  /** When the primary step is empty: "Il prossimo passo è «…», tra 6 settimane." */
  readonly quiet: string;
}

export interface PaymentsData {
  readonly upcoming: readonly UpcomingPayment[];
  /** No budget total yet: the empty state offers to set one. */
  readonly budgetDefined: boolean;
}

export interface HomeData {
  readonly userId: string;
  readonly mySlot: Slot | null;
  readonly myName: string;
  readonly partnerName: string;
  readonly today: PlainDate;
  readonly visit: VisitState;
  readonly reference: Section<ReferenceData>;
  readonly steps: Section<StepsData>;
  readonly payments: Section<PaymentsData>;
  /** `null` = first visit (no "Novità": the welcome card or nothing). */
  readonly news: Section<readonly NewsItem[] | null>;
  readonly lastExport: LastExport;
}

export type ActionResult = { ok: true } | { ok: false; code: string; message: string };
