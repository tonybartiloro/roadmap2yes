"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlainDate } from "@/lib/dates/plain-date";
import type { PartnerView } from "./model";
import { TaskRow } from "./TaskRow";
import type { TaskRowView } from "./view";

export type GroupId = "adesso" | "da-recuperare" | "prossimi-3-mesi" | "piu-avanti" | "fatti";

/** "Da recuperare" opens by default only when it is short (design §3.4). */
export const RECOVER_OPEN_MAX_ROWS = 5;

/**
 * A phase of the Percorso. "Adesso" always shows its first 5 rows then "Mostra tutte (N)"; the
 * others are collapsible with a counter. Collapsing never hides tasks from the data, only from
 * view (nothing is ever dropped, D15).
 */
export function TaskGroup({
  id,
  title,
  rows,
  collapsible,
  defaultOpen,
  limit,
  note,
  empty,
  today,
  partners,
  preview,
  onToggle,
  onOpen,
}: {
  id: GroupId;
  title: string;
  rows: readonly TaskRowView[];
  collapsible: boolean;
  defaultOpen: boolean;
  /** Visible rows before "Mostra tutte". */
  limit?: number;
  /** Neutral explanatory line under the title (e.g. the tone of "Da recuperare"). */
  note?: ReactNode;
  /** Shown when the group has no rows (only "Adesso" has one). */
  empty?: ReactNode;
  today: PlainDate;
  partners: readonly PartnerView[];
  preview: boolean;
  onToggle: (taskId: string, done: boolean) => void;
  onOpen: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const bodyId = useId();
  const visible = limit && !showAll ? rows.slice(0, limit) : rows;
  const hidden = rows.length - visible.length;

  const heading = (
    <span className="flex items-center gap-2">
      <span>{title}</span>
      <span
        className="text-muted-foreground text-base font-normal"
        data-testid={`group-count-${id}`}
      >
        ({rows.length})
      </span>
    </span>
  );

  return (
    <section
      data-testid={`group-${id}`}
      aria-labelledby={`${bodyId}-title`}
      className="flex flex-col gap-3"
    >
      <h2 id={`${bodyId}-title`} className="text-[22px] leading-7">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            data-testid={`group-toggle-${id}`}
            onClick={() => setOpen((current) => !current)}
            className="hover:bg-muted focus-visible:ring-ring -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 text-left focus-visible:ring-2 focus-visible:outline-none"
          >
            {open ? (
              <ChevronDown aria-hidden className="size-5 shrink-0" />
            ) : (
              <ChevronRight aria-hidden className="size-5 shrink-0" />
            )}
            {heading}
          </button>
        ) : (
          heading
        )}
      </h2>
      <div id={bodyId} hidden={!open} className="flex flex-col gap-3">
        {note ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Clock aria-hidden className="size-4 shrink-0" />
            <span>{note}</span>
          </p>
        ) : null}
        {rows.length === 0 ? (
          (empty ?? null)
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((row) => (
              <TaskRow
                key={row.task.id}
                row={row}
                today={today}
                partners={partners}
                preview={preview}
                onToggle={onToggle}
                onOpen={onOpen}
              />
            ))}
          </ul>
        )}
        {hidden > 0 ? (
          <Button
            type="button"
            variant="outline"
            data-testid={`${id}-show-all`}
            onClick={() => setShowAll(true)}
          >
            Mostra tutte ({rows.length})
          </Button>
        ) : null}
        {showAll && limit && rows.length > limit ? (
          <Button type="button" variant="ghost" onClick={() => setShowAll(false)}>
            Mostra meno
          </Button>
        ) : null}
      </div>
    </section>
  );
}
