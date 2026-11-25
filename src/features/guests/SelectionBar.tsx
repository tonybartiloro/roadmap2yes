"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { plural } from "@/components/format";
import { PanelContent } from "@/features/timeline/PanelContent";
import { Field, NativeSelect } from "@/features/decisions/form-bits";
import type { GroupView, TableView } from "./data";
import { MAX_SELECTION, SELECTION_TOO_LARGE } from "./schemas";
import {
  groupChoiceError,
  GroupPicker,
  NO_GROUP,
  resolveGroup,
  type GroupChoice,
} from "./GroupPicker";

/**
 * Multiple selection (AC7): "{n} selezionati", "Seleziona tutti i {m} filtrati", then Assegna a
 * gruppo, Elimina and Fine. Both actions end in a toast with "Annulla" (done by the screen).
 * "Assegna a tavolo" appears only when a live table exists; `extraActions` is a further slot.
 */
export function SelectionBar({
  selectedCount,
  filteredCount,
  filtering = false,
  groups,
  busy,
  onSelectAll,
  onClear,
  onDone,
  tables = [],
  onAssignGroup,
  onAssignTable,
  onDelete,
  extraActions,
}: {
  selectedCount: number;
  filteredCount: number;
  /** Filters or search active: the button says "filtrati", otherwise just "tutti". */
  filtering?: boolean;
  groups: readonly GroupView[];
  busy: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onDone: () => void;
  /** Resolves true when the assignment worked (the sheet closes). */
  onAssignGroup: (groupId: string) => Promise<boolean>;
  /** LIVE tables: "Assegna a tavolo" exists only with at least one (AC16). */
  tables?: readonly TableView[];
  onAssignTable?: (tableId: string) => Promise<boolean>;
  onDelete: () => void;
  extraActions?: React.ReactNode;
}) {
  const [assigning, setAssigning] = useState(false);
  const [seating, setSeating] = useState(false);
  const [tableId, setTableId] = useState("");
  const [tableError, setTableError] = useState<string | undefined>();
  const [choice, setChoice] = useState<GroupChoice>(NO_GROUP);
  const [error, setError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const tooMany = selectedCount > MAX_SELECTION;
  const none = selectedCount === 0 || tooMany;
  const allSelected = selectedCount >= filteredCount && filteredCount > 0;

  async function assign() {
    const message = groupChoiceError(choice, true);
    setError(message ?? undefined);
    if (message) return;
    setFailure(null);
    const resolved = await resolveGroup(choice);
    if (!resolved.ok || !resolved.groupId)
      return setFailure(resolved.ok ? "Scegli un gruppo." : resolved.message);
    // A group created just now stays chosen: a retry must not create a second one with that name.
    if (choice.kind === "new") setChoice({ kind: "existing", id: resolved.groupId });
    if (await onAssignGroup(resolved.groupId)) {
      setAssigning(false);
      setChoice(NO_GROUP);
    }
  }

  return (
    <div
      role="region"
      aria-label="Azioni sulla selezione"
      className="border-border bg-card fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex flex-col gap-2 border-t p-3 shadow-lg md:right-4 md:bottom-4 md:left-auto md:w-[28rem] md:rounded-lg md:border"
      data-testid="selection-bar"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-base font-semibold">
          {selectedCount} {selectedCount === 1 ? "selezionato" : "selezionati"}
        </p>
        <Button type="button" variant="ghost" onClick={allSelected ? onClear : onSelectAll}>
          {allSelected
            ? "Deseleziona tutti"
            : `Seleziona tutti i ${filteredCount}${filtering ? " filtrati" : ""}`}
        </Button>
      </div>
      {tooMany ? (
        <p role="alert" className="text-sm">
          {SELECTION_TOO_LARGE}
        </p>
      ) : none ? (
        <p className="text-muted-foreground text-sm">
          Scegli almeno una persona per usare le azioni.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={none || busy}
          onClick={() => setAssigning(true)}
        >
          Assegna a gruppo
        </Button>
        {tables.length > 0 && onAssignTable ? (
          <Button
            type="button"
            variant="outline"
            disabled={none || busy}
            onClick={() => setSeating(true)}
          >
            Assegna a tavolo
          </Button>
        ) : null}
        {extraActions}
        <Button
          type="button"
          variant="outline"
          disabled={none || busy}
          className="text-destructive"
          onClick={onDelete}
        >
          Elimina
        </Button>
        <Button type="button" onClick={onDone}>
          Fine
        </Button>
      </div>

      <Sheet open={assigning} onOpenChange={setAssigning}>
        <PanelContent aria-describedby="assign-hint">
          <SheetHeader>
            <SheetTitle>Assegna a gruppo</SheetTitle>
            <SheetDescription id="assign-hint">
              {plural(selectedCount, "persona", "persone")} andranno nel gruppo scelto.
            </SheetDescription>
          </SheetHeader>
          <GroupPicker
            groups={groups}
            value={choice}
            onChange={setChoice}
            error={error}
            allowNone={false}
          />
          {failure ? (
            <p role="alert" className="text-destructive text-base">
              {failure}
            </p>
          ) : null}
          <SheetFooter>
            <Button type="button" disabled={busy} onClick={() => void assign()}>
              {busy ? "Un attimo…" : "Assegna"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setAssigning(false)}>
              Annulla
            </Button>
          </SheetFooter>
        </PanelContent>
      </Sheet>

      <Sheet open={seating} onOpenChange={setSeating}>
        <PanelContent aria-describedby="seat-bar-hint">
          <SheetHeader>
            <SheetTitle>Assegna a tavolo</SheetTitle>
            <SheetDescription id="seat-bar-hint">
              {plural(selectedCount, "persona", "persone")} andranno al tavolo scelto. Se è pieno
              puoi andare oltre la capienza: lo vedrai scritto.
            </SheetDescription>
          </SheetHeader>
          <Field label="Tavolo" error={tableError}>
            {(control) => (
              <NativeSelect
                {...control}
                value={tableId}
                onChange={(event) => setTableId(event.target.value)}
              >
                <option value="" disabled>
                  Scegli un tavolo
                </option>
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <SheetFooter>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                if (tableId === "") return setTableError("Scegli un tavolo.");
                setTableError(undefined);
                void onAssignTable?.(tableId).then((ok) => {
                  if (ok) {
                    setSeating(false);
                    setTableId("");
                  }
                });
              }}
            >
              {busy ? "Un attimo…" : "Assegna"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setSeating(false)}>
              Annulla
            </Button>
          </SheetFooter>
        </PanelContent>
      </Sheet>
    </div>
  );
}
