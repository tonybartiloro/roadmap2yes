"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { DateField } from "@/components/DateField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_LABELS, MILESTONE_CATEGORIES } from "@/content/milestones";
import type { MilestoneCategory } from "@/content/milestones/types";
import { isPlainDate } from "@/lib/dates/plain-date";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { AssigneeField } from "./AssigneeField";
import { ReminderToggle } from "./ReminderToggle";
import type { TaskFields } from "./field-labels";
import type { Assignee, PartnerView } from "./model";

export const EMPTY_TASK_FIELDS: TaskFields = {
  title: "",
  dueDate: null,
  category: null,
  notes: null,
  assignee: "both",
  remindersEnabled: true,
  status: "todo",
};

const TITLE_MAX = 200;
const NOTES_MAX = 2000;

/** Accepts only what a draft of this form can contain (storage content is never trusted). */
export function parseTaskDraft(raw: unknown): TaskFields | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r["title"] !== "string") return null;
  const assignee: Assignee =
    r["assignee"] === "A" || r["assignee"] === "B" ? r["assignee"] : "both";
  const category =
    typeof r["category"] === "string" &&
    (MILESTONE_CATEGORIES as readonly string[]).includes(r["category"])
      ? r["category"]
      : null;
  return {
    title: r["title"].slice(0, TITLE_MAX),
    dueDate: typeof r["dueDate"] === "string" && isPlainDate(r["dueDate"]) ? r["dueDate"] : null,
    category,
    notes: typeof r["notes"] === "string" ? r["notes"].slice(0, NOTES_MAX) : null,
    assignee,
    remindersEnabled: r["remindersEnabled"] !== false,
    status: r["status"] === "done" ? "done" : "todo",
  };
}

export function sameFields(a: TaskFields, b: TaskFields): boolean {
  return (
    a.title === b.title &&
    a.dueDate === b.dueDate &&
    a.category === b.category &&
    (a.notes ?? "") === (b.notes ?? "") &&
    a.assignee === b.assignee &&
    a.remindersEnabled === b.remindersEnabled
  );
}

/**
 * Task form (design §3.4): title, optional due date, category, notes, "Chi se ne occupa?" and
 * the email reminder switch. The same form creates and edits. What the person typed is kept as a
 * local draft (offline or failed save, AC39) and cleared after a successful save.
 */
export function TaskForm({
  initial,
  partners,
  emailEnabled,
  draftKey,
  draftScope,
  submitLabel,
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  initial: TaskFields;
  partners: readonly PartnerView[];
  emailEnabled: boolean;
  draftKey: string;
  draftScope: string;
  submitLabel: string;
  saving: boolean;
  /** Error of the last save, shown above the buttons. */
  error: string | null;
  onSubmit: (fields: TaskFields) => void | Promise<unknown>;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState<TaskFields>(initial);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const ids = { title: useId(), category: useId(), notes: useId() };
  const titleRef = useRef<HTMLInputElement>(null);
  const { draft, ready, save, clear } = useFormDraft<TaskFields>(draftKey, {
    scope: draftScope,
    parse: parseTaskDraft,
  });
  // Applied once, as soon as the browser storage has been read (adjusting state while rendering).
  const [draftChecked, setDraftChecked] = useState(false);
  if (ready && !draftChecked) {
    setDraftChecked(true);
    if (draft && !sameFields(draft, initial)) {
      setFields(draft);
      setRestored(true);
    }
  }

  function update(patch: Partial<TaskFields>) {
    setFields((current) => {
      const next = { ...current, ...patch };
      save(next);
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (fields.title.trim().length === 0) {
      setTitleError("Scrivi un titolo per il compito.");
      titleRef.current?.focus();
      return;
    }
    setTitleError(null);
    const result = await onSubmit({ ...fields, title: fields.title.trim() });
    // `onSubmit` resolves to `false` when the save failed: the draft stays.
    if (result !== false) clear();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" data-testid="task-form" noValidate>
      {restored ? (
        <p role="status" className="text-muted-foreground text-sm">
          Ho ripreso quello che avevi scritto e non avevi ancora salvato.
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.title}>Titolo</Label>
        <Input
          id={ids.title}
          ref={titleRef}
          value={fields.title}
          maxLength={TITLE_MAX}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? `${ids.title}-error` : undefined}
          onChange={(event) => {
            update({ title: event.target.value });
            if (titleError) setTitleError(null);
          }}
        />
        {titleError ? (
          <p id={`${ids.title}-error`} className="text-destructive text-sm">
            {titleError}
          </p>
        ) : null}
      </div>

      <DateField
        label="Scadenza (facoltativa)"
        value={fields.dueDate ?? ""}
        onChange={(value) => update({ dueDate: value === "" ? null : value })}
        hint="Se la cambi tu, non la ricalcoliamo più da sola."
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.category}>Categoria</Label>
        <select
          id={ids.category}
          value={fields.category ?? ""}
          onChange={(event) => update({ category: event.target.value || null })}
          className="border-input bg-background text-foreground focus-visible:ring-ring focus-visible:ring-offset-background h-11 w-full rounded-md border px-3 text-base focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <option value="">Nessuna</option>
          {MILESTONE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category as MilestoneCategory]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.notes}>Note</Label>
        <textarea
          id={ids.notes}
          value={fields.notes ?? ""}
          maxLength={NOTES_MAX}
          rows={4}
          onChange={(event) => update({ notes: event.target.value || null })}
          className="border-input bg-background text-foreground focus-visible:ring-ring focus-visible:ring-offset-background min-h-24 w-full rounded-md border px-3 py-2 text-base focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        />
      </div>

      <AssigneeField
        value={fields.assignee}
        onChange={(assignee) => update({ assignee })}
        partners={partners}
      />

      <ReminderToggle
        checked={fields.remindersEnabled}
        onCheckedChange={(remindersEnabled) => update({ remindersEnabled })}
        bothAssigned={fields.assignee === "both"}
        emailEnabled={emailEnabled}
      />

      {error ? (
        <p role="alert" className="text-destructive text-base">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="submit" disabled={saving}>
          {saving ? "Salvo…" : submitLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => {
            clear();
            onCancel();
          }}
        >
          Annulla
        </Button>
      </div>
    </form>
  );
}
