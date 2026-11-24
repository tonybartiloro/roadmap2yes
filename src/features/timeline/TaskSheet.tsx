"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Info, Pencil, Trash2 } from "lucide-react";
import { formatShortDate } from "@/components/format";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CATEGORY_LABELS } from "@/content/milestones/categories";
import { BUREAUCRATIC_DISCLAIMER, getMilestone } from "@/content/milestones";
import type { MilestoneCategory } from "@/content/milestones/types";
import type { PlainDate } from "@/lib/dates/plain-date";
import { COPY, dueExactText } from "./copy";
import { DATE_DECISION_HREF } from "./links";
import type { TaskFields } from "./field-labels";
import { taskToFields } from "./field-labels";
import { assigneeName, type PartnerView, type TaskView } from "./model";
import { PanelContent } from "./PanelContent";
import { EMPTY_TASK_FIELDS, TaskForm } from "./TaskForm";

/** What the sheet is showing: nothing, a new task, or the detail of an existing one. */
export type SheetTarget = { kind: "none" } | { kind: "new" } | { kind: "task"; task: TaskView };

/**
 * Detail and form of a task, in one sheet (design §3.4): advice, bureaucratic note, notes,
 * edit, delete (with undo handled by the caller), "Va bene così" for a task to review.
 */
export function TaskSheet({
  target,
  today,
  partners,
  emailEnabled,
  draftScope,
  saving,
  error,
  onClose,
  onSave,
  onDelete,
  onAcknowledge,
  readOnly = false,
}: {
  target: SheetTarget;
  today: PlainDate;
  partners: readonly PartnerView[];
  emailEnabled: boolean;
  draftScope: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  /** Resolves to `true` when saved (the sheet then closes), `false` otherwise. */
  onSave: (task: TaskView | null, fields: TaskFields) => Promise<boolean>;
  onDelete: (task: TaskView) => void;
  onAcknowledge: (task: TaskView) => void;
  /** Preview: nothing can be written (AC32); the sheet only shows the task. */
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const open = target.kind !== "none";
  const task = target.kind === "task" ? target.task : null;
  const creating = target.kind === "new";
  const showForm = creating || editing;

  function close() {
    setEditing(false);
    onClose();
  }

  const milestone = task?.templateKey ? getMilestone(task.templateKey) : undefined;
  const categoryLabel = task?.category
    ? (CATEGORY_LABELS[task.category as MilestoneCategory] ?? task.category)
    : null;

  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? close() : undefined)}>
      <PanelContent data-testid="task-sheet" aria-describedby={undefined}>
        {open ? (
          <>
            <SheetHeader>
              <SheetTitle>
                {creating ? "Nuovo compito" : showForm ? "Modifica compito" : task?.title}
              </SheetTitle>
              {!showForm && task ? (
                <SheetDescription>
                  {task.dueDate ? dueExactText(task.dueDate, today) : COPY.noDeadline}
                </SheetDescription>
              ) : null}
            </SheetHeader>

            {showForm ? (
              <TaskForm
                // A new key per target resets the form when another task is opened.
                key={task?.id ?? "new"}
                initial={task ? taskToFields(task) : EMPTY_TASK_FIELDS}
                partners={partners}
                emailEnabled={emailEnabled}
                draftKey={task ? `task-${task.id}` : "task-new"}
                draftScope={draftScope}
                submitLabel={creating ? "Aggiungi compito" : "Salva"}
                saving={saving}
                error={error}
                onSubmit={async (fields) => {
                  const saved = await onSave(task, fields);
                  if (saved) close();
                  return saved;
                }}
                onCancel={close}
              />
            ) : task ? (
              <div className="flex flex-col gap-4">
                <dl className="flex flex-col gap-2 text-base">
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground w-32 shrink-0">Chi se ne occupa</dt>
                    <dd>{assigneeName(partners, task.assignee)}</dd>
                  </div>
                  {categoryLabel ? (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground w-32 shrink-0">Categoria</dt>
                      <dd>{categoryLabel}</dd>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground w-32 shrink-0">Promemoria</dt>
                    <dd>
                      {task.remindersEnabled
                        ? "Per email, 7 giorni prima e il giorno stesso"
                        : "Spento"}
                    </dd>
                  </div>
                  {task.status === "done" && task.completedAt ? (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground w-32 shrink-0">Fatto il</dt>
                      <dd>{formatShortDate(task.completedAt.slice(0, 10))}</dd>
                    </div>
                  ) : null}
                </dl>

                {task.advice ? (
                  <p className="bg-muted rounded-md p-3 text-base" data-testid="task-advice">
                    {task.advice}
                  </p>
                ) : null}
                {milestone?.bureaucratic ? (
                  <p
                    className="flex items-start gap-2 text-sm"
                    data-testid="task-bureaucratic-note"
                  >
                    <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <span>{BUREAUCRATIC_DISCLAIMER}</span>
                  </p>
                ) : null}
                {task.notes ? (
                  <div>
                    <h3 className="text-base font-semibold">Note</h3>
                    <p className="text-base whitespace-pre-wrap">{task.notes}</p>
                  </div>
                ) : null}

                {!readOnly && task.needsReview && task.status === "todo" ? (
                  <div className="border-border flex flex-col gap-2 rounded-md border p-3">
                    <p className="flex items-center gap-2 text-base">
                      <Eye aria-hidden className="size-5 shrink-0" />
                      <span>
                        La data è stata riaperta: controlla che questa scadenza vada ancora bene.
                      </span>
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button type="button" variant="outline" onClick={() => onAcknowledge(task)}>
                        {COPY.reviewOk}
                      </Button>
                      <Button asChild variant="ghost">
                        <Link href={DATE_DECISION_HREF}>Vai alla scelta della data</Link>
                      </Button>
                    </div>
                  </div>
                ) : null}

                {error ? (
                  <p role="alert" className="text-destructive text-base">
                    {error}
                  </p>
                ) : null}

                <div hidden={readOnly} className="flex flex-col gap-2 sm:flex-row-reverse">
                  <Button type="button" onClick={() => setEditing(true)} data-testid="task-edit">
                    <Pencil aria-hidden /> Modifica
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      onDelete(task);
                      close();
                    }}
                    data-testid="task-delete"
                  >
                    <Trash2 aria-hidden /> Elimina
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </PanelContent>
    </Sheet>
  );
}
