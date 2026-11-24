import type { ReactNode } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import { parsePlainDate, type PlainDate } from "@/lib/dates/plain-date";
import { cn } from "@/lib/utils";
import { MONTHS_SHORT, formatDayMonth, formatShortDate } from "./format";
import { ReferenceBadge } from "./ReferenceBadge";

export interface DateScenarioItem {
  id: string;
  label: string;
  kind: "fixed" | "period";
  /** The date, or the first day of the period. */
  dateFrom: PlainDate;
  /** Last day of a period. */
  dateTo?: PlainDate;
  /** Name of the linked candidate location (AC60). */
  locationName?: string | null;
  /** This scenario is the reference of the Percorso. */
  isReference?: boolean;
  referenceStatus?: "provisional" | "definitive";
  /** Who set the reference by hand (badge "scelto da …"). */
  referenceSetBy?: string | null;
  /** Shown as "scartata" once another date was chosen. */
  discarded?: boolean;
}

/** "14 mag 2028" or, for a period, "mag–giu 2028 · calcolata dal 1 mag". */
export function scenarioDateText(item: DateScenarioItem): string {
  if (item.kind === "fixed") return formatShortDate(item.dateFrom);
  const from = parsePlainDate(item.dateFrom);
  const to = item.dateTo ? parsePlainDate(item.dateTo) : from;
  const start = MONTHS_SHORT[from.month - 1];
  const end = MONTHS_SHORT[to.month - 1];
  const range =
    from.year === to.year
      ? from.month === to.month
        ? `${start} ${from.year}`
        : `${start}–${end} ${from.year}`
      : `${start} ${from.year}–${end} ${to.year}`;
  return `${range} · calcolata dal ${formatDayMonth(item.dateFrom)}`;
}

/**
 * List of date scenarios (fixed date or period) with the reference badge and the linked location.
 * Used by onboarding, Impostazioni and Scelte; each screen injects its actions through `actions`.
 */
export function DateScenarioList({
  items,
  actions,
  emptyText = "Ancora nessuna data.",
  className,
}: {
  items: readonly DateScenarioItem[];
  actions?: (item: DateScenarioItem) => ReactNode;
  emptyText?: string;
  className?: string;
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className={cn("flex flex-col gap-3", className)} data-slot="date-scenario-list">
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "border-border bg-card flex flex-col gap-2 rounded-lg border p-4",
            item.discarded && "text-muted-foreground",
          )}
        >
          <div className="flex items-start gap-2">
            <CalendarDays aria-hidden className="text-primary mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{item.label}</p>
              <p className="tabular-nums">{scenarioDateText(item)}</p>
            </div>
            {item.discarded ? <span className="text-sm">Scartata</span> : null}
          </div>
          {item.isReference && item.referenceStatus ? (
            <ReferenceBadge
              status={item.referenceStatus}
              setBy={item.referenceSetBy}
              locationName={item.locationName}
            />
          ) : item.locationName ? (
            <ReferenceBadgeLocationOnly name={item.locationName} />
          ) : null}
          {actions ? <div className="flex flex-wrap gap-2">{actions(item)}</div> : null}
        </li>
      ))}
    </ul>
  );
}

function ReferenceBadgeLocationOnly({ name }: { name: string }) {
  return (
    <p className="text-muted-foreground inline-flex items-center gap-1 text-sm">
      <MapPin aria-hidden className="size-4" />
      <span>
        <span className="sr-only">Location collegata: </span>
        {name}
      </span>
    </p>
  );
}
