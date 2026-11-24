"use client";

import { CalendarClock, Eye, Users } from "lucide-react";
import { formatDayMonth, formatShortDate } from "@/components/format";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CATEGORY_LABELS } from "@/content/milestones/categories";
import type { MilestoneCategory } from "@/content/milestones/types";
import type { PlainDate } from "@/lib/dates/plain-date";
import { cn } from "@/lib/utils";
import { COPY, dueExactText, relativeDue } from "./copy";
import { assigneeName, initialsOf, type PartnerView } from "./model";
import type { TaskRowView } from "./view";

/**
 * One task. The checkbox has a 44 px hit area, the title opens the detail sheet (the whole row is
 * the tap target through a stretched link-like button). Information never rests on colour alone:
 * icon + text for deadline, assignee and badges. In preview the row has a dashed left border, the
 * "Anteprima" label and the new date next to the struck-through old one (design §3.8).
 */
export function TaskRow({
  row,
  today,
  partners,
  preview,
  onToggle,
  onOpen,
}: {
  row: TaskRowView;
  today: PlainDate;
  partners: readonly PartnerView[];
  preview: boolean;
  onToggle: (taskId: string, done: boolean) => void;
  onOpen: (taskId: string) => void;
}) {
  const { task, previousDue } = row;
  const done = task.status === "done";
  const assignee = assigneeName(partners, task.assignee);
  const categoryLabel = task.category
    ? (CATEGORY_LABELS[task.category as MilestoneCategory] ?? task.category)
    : null;
  const changed = preview && previousDue !== null;

  return (
    <li
      data-testid="task-row"
      data-task-id={task.id}
      data-status={task.status}
      className={cn(
        "border-border bg-card relative flex items-start gap-1 rounded-lg border py-1 pr-3 pl-1",
        changed && "border-l-primary border-l-4 border-dashed",
      )}
    >
      <div className="relative z-10 flex size-11 shrink-0 items-center justify-center">
        <Checkbox
          checked={done}
          aria-label={done ? `Riapri: ${task.title}` : `Segna come fatto: ${task.title}`}
          data-testid="task-checkbox"
          disabled={preview}
          onCheckedChange={(next) => onToggle(task.id, next === true)}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-2">
        <button
          type="button"
          data-testid="task-title"
          onClick={() => onOpen(task.id)}
          className={cn(
            "focus-visible:ring-ring text-left text-base font-semibold after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:outline-none",
            done && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </button>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span data-testid="task-due" className="inline-flex items-center gap-1">
            <CalendarClock aria-hidden className="size-4" />
            {task.dueDate ? (
              <span title={formatShortDate(task.dueDate)}>
                {changed ? <span className="font-semibold">Anteprima: </span> : null}
                {changed && previousDue ? (
                  <>
                    <s>
                      <span className="sr-only">Scadenza di ora: </span>
                      {formatDayMonth(previousDue)}
                    </s>{" "}
                    <span aria-hidden>→</span>{" "}
                    <span className="text-foreground font-semibold">
                      <span className="sr-only">nuova scadenza: </span>
                      {formatDayMonth(task.dueDate)}
                    </span>
                  </>
                ) : (
                  <>
                    <span aria-hidden>{relativeDue(task.dueDate, today)}</span>
                    <span className="sr-only">{dueExactText(task.dueDate, today)}</span>
                  </>
                )}
              </span>
            ) : (
              <span>{COPY.noDeadline}</span>
            )}
          </span>
          {categoryLabel ? <span>{categoryLabel}</span> : null}
          <span data-testid="task-assignee" className="inline-flex items-center gap-1">
            {task.assignee === "both" ? (
              <Users aria-hidden className="size-4" />
            ) : (
              <span
                aria-hidden
                className="border-border bg-muted text-foreground inline-flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold"
              >
                {initialsOf(assignee)}
              </span>
            )}
            <span>
              <span className="sr-only">Se ne occupa: </span>
              {assignee}
            </span>
          </span>
        </div>

        {task.needsReview && !done ? (
          <div>
            <Badge variant="outline" data-testid="task-review-badge" className="gap-1">
              <Eye aria-hidden className="size-4" />
              {COPY.reviewBadge}
            </Badge>
          </div>
        ) : null}
      </div>
    </li>
  );
}
