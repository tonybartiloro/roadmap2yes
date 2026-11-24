"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ConflictDialog } from "@/components/ConflictDialog";
import { EmailOffBanner } from "@/components/EmailOffBanner";
import { EmptyState } from "@/components/EmptyState";
import { formatShortDate } from "@/components/format";
import { Button } from "@/components/ui/button";
import type { Milestone } from "@/content/milestones/types";
import type { PlainDate } from "@/lib/dates/plain-date";
import { PARTNER_FALLBACK_NAME } from "@/lib/display-name";
import {
  acceptSuggestedTaskAction,
  acknowledgeReviewAction,
  createTaskAction,
  deleteTaskAction,
  dismissSuggestionAction,
  restoreTaskAction,
  setReferenceAction,
  setTaskStatusAction,
  updateTaskAction,
} from "./actions";
import type { ActionResult, ConflictInfo, TaskSaved } from "./action-types";
import { COPY, UNDO_TOAST_MS, relativeDue } from "./copy";
import { DEFAULT_FILTERS, type Filters } from "./filters";
import {
  taskFieldFormatter,
  TASK_FIELD_LABELS,
  taskToFields,
  type TaskFields,
} from "./field-labels";
import { PERCORSO_HREF } from "./links";
import type { PercorsoData, TaskView } from "./model";
import {
  PreviewClosedNotice,
  RecalculatedStrip,
  RecentlyDeleted,
  ReopenedBanner,
  SuggestionsCard,
} from "./Notices";
import { PercorsoHeader } from "./PercorsoHeader";
import { ReferenceConfirmSheet, ScenarioPreviewBanner } from "./ScenarioPreviewBanner";
import { RECOVER_OPEN_MAX_ROWS, TaskGroup } from "./TaskGroup";
import { TaskSheet, type SheetTarget } from "./TaskSheet";
import { buildPercorsoView } from "./view";

type OptimisticAction =
  | { type: "status"; id: string; done: boolean; at: string }
  | { type: "delete"; id: string; at: string }
  | { type: "restore"; id: string };

function reduceTasks(tasks: readonly TaskView[], action: OptimisticAction): TaskView[] {
  return tasks.map((task) => {
    if (task.id !== action.id) return task;
    switch (action.type) {
      case "status":
        return action.done
          ? { ...task, status: "done", completedAt: action.at, needsReview: false }
          : { ...task, status: "todo", completedAt: null };
      case "delete":
        return { ...task, deleted: true, deletedAt: action.at };
      case "restore":
        return { ...task, deleted: false, deletedAt: null };
    }
  });
}

interface ConflictState {
  readonly task: TaskView;
  readonly info: ConflictInfo;
  readonly mine: TaskFields;
  /** Retries the same write with the version the other partner left ("Salva comunque"). */
  readonly retry: (version: number) => Promise<ActionResult<TaskSaved>>;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Client side of the Percorso. The server page loads the data and the clock; everything shown is
 * derived here by the pure `buildPercorsoView`, so the optimistic updates (checkbox, delete,
 * restore) regroup immediately and a failed write rolls back by itself. Writes go through the
 * server actions (user session + RLS); a stale version opens the conflict dialog (AC40).
 */
export function PercorsoScreen({
  data,
  today,
  previewId,
  emailEnabled,
}: {
  data: PercorsoData;
  today: PlainDate;
  previewId: string | null;
  emailEnabled: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tasks, applyOptimistic] = useOptimistic(data.tasks, reduceTasks);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sheet, setSheet] = useState<
    { kind: "none" } | { kind: "new" } | { kind: "task"; id: string }
  >({ kind: "none" });
  const [sheetSaving, setSheetSaving] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [conflictSaving, setConflictSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const view = useMemo(
    () => buildPercorsoView({ data: { ...data, tasks }, today, previewId, filters }),
    [data, tasks, today, previewId, filters],
  );
  const partner = data.partners.find((p) => p.slot !== data.mySlot);
  const partnerName = partner?.name ?? PARTNER_FALLBACK_NAME;
  const previewing = view.preview !== null;

  const sheetTarget: SheetTarget = useMemo(() => {
    if (sheet.kind === "new") return { kind: "new" };
    if (sheet.kind === "task") {
      const task = tasks.find((t) => t.id === sheet.id && !t.deleted);
      return task ? { kind: "task", task } : { kind: "none" };
    }
    return { kind: "none" };
  }, [sheet, tasks]);

  /** Runs a versioned write; on conflict opens the dialog and returns null. */
  async function write(
    task: TaskView,
    mine: TaskFields,
    run: (version: number) => Promise<ActionResult<TaskSaved>>,
    version: number = task.version,
    fromSheet = false,
  ): Promise<TaskSaved | null> {
    const result = await run(version);
    if (result.ok) return result.data;
    if (result.conflict) {
      setConflict({ task, info: result.conflict, mine, retry: run });
      return null;
    }
    toast.error(result.message);
    if (fromSheet) setSheetError(result.message);
    return null;
  }

  /** Runs an "Annulla": a failure is shown and the real state is reloaded (AC31). */
  function undoWrite(run: () => Promise<ActionResult<unknown>>) {
    startTransition(async () => {
      const result = await run();
      if (!result.ok) {
        toast.error(
          result.conflict
            ? "Nel frattempo qualcosa è cambiato: ho ricaricato la versione attuale."
            : result.message,
        );
        router.refresh();
      }
    });
  }

  function undoToast(message: string, onUndo: () => void) {
    toast(message, { duration: UNDO_TOAST_MS, action: { label: COPY.undo, onClick: onUndo } });
  }

  function toggle(taskId: string, done: boolean) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    startTransition(async () => {
      applyOptimistic({ type: "status", id: taskId, done, at: new Date().toISOString() });
      setAnnouncement(done ? `«${task.title}» spostato in Fatti.` : `«${task.title}» riaperto.`);
      const mine = { ...taskToFields(task), status: done ? ("done" as const) : ("todo" as const) };
      const run = (version: number) =>
        setTaskStatusAction({ id: taskId, expectedVersion: version, done });
      const saved = await write(task, mine, run);
      if (saved && done) {
        undoToast("Compito completato.", () =>
          undoWrite(() =>
            setTaskStatusAction({ id: taskId, expectedVersion: saved.version, done: false }),
          ),
        );
      }
    });
  }

  function remove(task: TaskView) {
    startTransition(async () => {
      applyOptimistic({ type: "delete", id: task.id, at: new Date().toISOString() });
      const run = (version: number) => deleteTaskAction({ id: task.id, expectedVersion: version });
      const saved = await write(task, taskToFields(task), run);
      if (saved) {
        undoToast(`«${task.title}» eliminato.`, () =>
          undoWrite(async () => {
            applyOptimistic({ type: "restore", id: task.id });
            return restoreTaskAction({ id: task.id, expectedVersion: saved.version });
          }),
        );
      }
    });
  }

  function restore(task: TaskView) {
    setBusy(task.id);
    startTransition(async () => {
      applyOptimistic({ type: "restore", id: task.id });
      const result = await restoreTaskAction({ id: task.id, expectedVersion: task.version });
      if (!result.ok && !result.conflict) toast.error(result.message);
      if (!result.ok && result.conflict) {
        setConflict({
          task,
          info: result.conflict,
          mine: taskToFields(task),
          retry: (version) => restoreTaskAction({ id: task.id, expectedVersion: version }),
        });
      }
      setBusy(null);
    });
  }

  async function save(task: TaskView | null, fields: TaskFields): Promise<boolean> {
    setSheetSaving(true);
    setSheetError(null);
    try {
      if (!task) {
        const result = await createTaskAction(fields);
        if (!result.ok) {
          setSheetError(result.message);
          return false;
        }
        toast("Compito aggiunto.");
        return true;
      }
      const mine = { ...fields, status: task.status };
      const saved = await write(
        task,
        mine,
        (version) => updateTaskAction({ id: task.id, expectedVersion: version, fields }),
        task.version,
        true,
      );
      if (saved) toast("Modifiche salvate.");
      return saved !== null;
    } finally {
      setSheetSaving(false);
    }
  }

  function acknowledge(taskId: string | null) {
    setBusy(taskId ?? "all");
    startTransition(async () => {
      const result = await acknowledgeReviewAction({ taskId });
      if (!result.ok) toast.error(result.message);
      setBusy(null);
    });
  }

  function acceptAddition(milestone: Milestone) {
    setBusy(milestone.key);
    startTransition(async () => {
      const result = await acceptSuggestedTaskAction({ templateKey: milestone.key });
      if (!result.ok) toast.error(result.message);
      else toast(`«${milestone.title}» aggiunta al Percorso.`);
      setBusy(null);
    });
  }

  function acceptRemoval(task: TaskView) {
    setBusy(task.templateKey);
    startTransition(async () => {
      applyOptimistic({ type: "delete", id: task.id, at: new Date().toISOString() });
      const saved = await write(task, taskToFields(task), (version) =>
        deleteTaskAction({ id: task.id, expectedVersion: version }),
      );
      if (saved) {
        undoToast(`«${task.title}» tolta dal Percorso.`, () =>
          undoWrite(async () => {
            applyOptimistic({ type: "restore", id: task.id });
            return restoreTaskAction({ id: task.id, expectedVersion: saved.version });
          }),
        );
      }
      setBusy(null);
    });
  }

  function dismiss(templateKey: string, kind: "add" | "remove") {
    setBusy(templateKey);
    startTransition(async () => {
      const result = await dismissSuggestionAction({ templateKey, kind });
      if (!result.ok) toast.error(result.message);
      setBusy(null);
    });
  }

  async function confirmReference() {
    const target = view.preview?.scenario;
    if (!target) return;
    setConfirmSaving(true);
    setConfirmError(null);
    const result = await setReferenceAction({ optionId: target.optionId });
    setConfirmSaving(false);
    if (!result.ok) {
      setConfirmError(result.message);
      return;
    }
    setConfirmOpen(false);
    const previous = result.data.previousOptionId;
    router.replace(PERCORSO_HREF);
    undoToast(`Il riferimento ora è il ${formatShortDate(target.dateFrom)}.`, () =>
      undoWrite(() => setReferenceAction({ optionId: previous })),
    );
  }

  async function forceSave() {
    if (!conflict) return;
    setConflictSaving(true);
    const result = await conflict.retry(conflict.info.currentVersion);
    setConflictSaving(false);
    if (result.ok) {
      setConflict(null);
      setSheet({ kind: "none" });
      toast("Modifiche salvate.");
    } else if (result.conflict) {
      setConflict({ ...conflict, info: result.conflict });
    } else {
      setConflict(null);
      toast.error(result.message);
    }
  }

  function cancelConflict() {
    setConflict(null);
    setSheet({ kind: "none" });
    router.refresh();
  }

  const { groups } = view;
  const noTasksAtAll = view.totalLive === 0 && view.hiddenCount === 0;
  const filteredEmpty = view.activeFilters > 0 && view.shownCount === 0 && view.totalLive > 0;
  const groupProps = {
    today,
    partners: data.partners,
    preview: previewing,
    onToggle: toggle,
    onOpen: (id: string) => setSheet({ kind: "task", id }),
  };

  return (
    <div className="flex flex-col gap-6" data-testid="percorso">
      <PercorsoHeader
        view={view}
        filters={filters}
        onFiltersChange={setFilters}
        partnerName={partnerName}
        previewId={previewId}
        matchCount={view.shownCount}
      />

      {view.previewClosed ? <PreviewClosedNotice reason={view.previewClosed} /> : null}
      {view.preview ? (
        <ScenarioPreviewBanner
          preview={view.preview}
          onSetReference={() => {
            setConfirmError(null);
            setConfirmOpen(true);
          }}
        />
      ) : null}
      <EmailOffBanner emailEnabled={emailEnabled} />
      {view.reopened ? (
        <ReopenedBanner
          reviewCount={previewing ? 0 : view.reviewCount}
          busy={busy === "all"}
          onAcknowledgeAll={() => acknowledge(null)}
        />
      ) : null}
      {view.recalculated && view.reference && !previewing ? (
        <RecalculatedStrip byName={view.recalculated.byName} reference={view.reference} />
      ) : null}

      {previewing ? null : (
        <SuggestionsCard
          additions={view.suggestions.additions}
          removals={view.suggestions.removals}
          busyKey={busy}
          onAcceptAdd={acceptAddition}
          onAcceptRemove={acceptRemoval}
          onDismiss={dismiss}
        />
      )}

      {noTasksAtAll ? (
        <EmptyState
          title={COPY.emptyTasksTitle}
          action={
            <Button type="button" onClick={() => setSheet({ kind: "new" })}>
              Aggiungi compito
            </Button>
          }
        />
      ) : filteredEmpty ? (
        <EmptyState
          title="Nessun compito con questi filtri."
          action={
            <Button type="button" variant="outline" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Azzera i filtri
            </Button>
          }
        />
      ) : (
        <>
          {view.hiddenCount > 0 ? (
            <p className="text-muted-foreground text-sm" data-testid="hidden-note">
              {view.hiddenCount === 1
                ? "1 tappa dipende dalla data e compare appena c'è un riferimento."
                : `${view.hiddenCount} tappe dipendono dalla data e compaiono appena c'è un riferimento.`}
            </p>
          ) : null}
          <TaskGroup
            id="adesso"
            title="Adesso"
            rows={groups.adesso}
            collapsible={false}
            defaultOpen
            limit={5}
            empty={
              <p className="text-base" data-testid="empty-adesso">
                {view.activeFilters > 0
                  ? "Nessun compito qui con questi filtri."
                  : COPY.adessoEmpty}
                {view.activeFilters === 0 && view.nextStep
                  ? ` Il prossimo passo è «${view.nextStep.title}», ${relativeDue(view.nextStep.due, today)}.`
                  : ""}
              </p>
            }
            {...groupProps}
          />
          {groups.daRecuperare.length > 0 ? (
            <TaskGroup
              id="da-recuperare"
              title="Da recuperare"
              rows={groups.daRecuperare}
              collapsible
              defaultOpen={groups.daRecuperare.length <= RECOVER_OPEN_MAX_ROWS}
              note={COPY.recoverTone}
              {...groupProps}
            />
          ) : null}
          {groups.prossimi3Mesi.length > 0 ? (
            <TaskGroup
              id="prossimi-3-mesi"
              title="Prossimi 3 mesi"
              rows={groups.prossimi3Mesi}
              collapsible
              defaultOpen
              {...groupProps}
            />
          ) : null}
          {groups.piuAvanti.length > 0 ? (
            <TaskGroup
              id="piu-avanti"
              title="Più avanti"
              rows={groups.piuAvanti}
              collapsible
              defaultOpen={groups.piuAvanti.length <= RECOVER_OPEN_MAX_ROWS}
              {...groupProps}
            />
          ) : null}
          {groups.fatti.length > 0 ? (
            <TaskGroup
              id="fatti"
              title="Fatti"
              rows={groups.fatti}
              collapsible
              defaultOpen={false}
              {...groupProps}
            />
          ) : null}
        </>
      )}

      {previewing ? null : (
        <RecentlyDeleted tasks={view.deleted} busyId={busy} onRestore={restore} />
      )}

      <p role="status" aria-live="polite" className="sr-only" data-testid="live-region">
        {announcement}
      </p>

      {previewing ? null : (
        <Button
          type="button"
          size="icon"
          aria-label="Aggiungi un compito"
          data-testid="task-add"
          onClick={() => setSheet({ kind: "new" })}
          className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 size-14 rounded-full shadow-lg md:right-8 md:bottom-8"
        >
          <Plus aria-hidden className="size-6!" />
        </Button>
      )}

      <TaskSheet
        target={sheetTarget}
        today={today}
        partners={data.partners}
        emailEnabled={emailEnabled}
        draftScope={`${data.userId}:${data.weddingId}`}
        saving={sheetSaving}
        error={sheetError}
        onClose={() => {
          setSheet({ kind: "none" });
          setSheetError(null);
        }}
        onSave={save}
        onDelete={remove}
        onAcknowledge={(task) => acknowledge(task.id)}
        readOnly={previewing}
      />

      <ReferenceConfirmSheet
        preview={view.preview}
        open={confirmOpen}
        saving={confirmSaving}
        error={confirmError}
        onConfirm={confirmReference}
        onCancel={() => setConfirmOpen(false)}
      />

      {conflict ? (
        <ConflictDialog
          open
          partnerName={capitalize(conflict.info.changedByName ?? PARTNER_FALLBACK_NAME)}
          changedAt={conflict.info.changedAt ? new Date(conflict.info.changedAt) : new Date()}
          labels={TASK_FIELD_LABELS}
          mine={conflict.mine}
          theirs={conflict.info.theirs}
          formatValue={taskFieldFormatter(data.partners)}
          saving={conflictSaving}
          onForceSave={forceSave}
          onCancel={cancelConflict}
        />
      ) : null}
    </div>
  );
}
