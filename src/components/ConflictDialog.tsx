"use client";

import { useId, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatElapsed } from "./format";

/** Field name to its Italian label, per entity (`features/*\/field-labels.ts`, DES-29). */
export type FieldLabels = Readonly<Record<string, string>>;
export type FieldValues = Readonly<Record<string, unknown>>;

export interface ConflictRow {
  field: string;
  label: string;
  mine: string;
  theirs: string;
}

function defaultFormat(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sì" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

/**
 * Only the fields that differ, in the order of the label map. Fields without a label are not
 * shown (internal columns such as `version`). `format` renders values (dates, euros, names).
 */
export function diffFields(
  labels: FieldLabels,
  mine: FieldValues,
  theirs: FieldValues,
  format: (field: string, value: unknown) => string = (_, value) => defaultFormat(value),
): ConflictRow[] {
  return Object.keys(labels).flatMap((field) => {
    const a = mine[field];
    const b = theirs[field];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) return [];
    return [
      { field, label: labels[field] as string, mine: format(field, a), theirs: format(field, b) },
    ];
  });
}

export interface ConflictDialogProps {
  open: boolean;
  /** Name of the other partner, already resolved with `displayName`. */
  partnerName: string;
  changedAt: Date;
  /** Injectable clock (default `new Date()`), for tests. */
  now?: Date;
  labels: FieldLabels;
  /** What this person was saving. */
  mine: FieldValues;
  /** The current version stored by the other partner. */
  theirs: FieldValues;
  formatValue?: (field: string, value: unknown) => string;
  /** "Salva comunque": retry with the current version. */
  onForceSave: () => void;
  /** "Annulla": close and reload the other version (the draft stays copyable). */
  onCancel: () => void;
  saving?: boolean;
}

/**
 * Edit conflict (BR9, AC40; design §4.1): never a silent overwrite. Built on `AlertDialog`
 * (Radix: focus trap and focus return work when it sits above a sheet). Escape equals "Annulla";
 * the overlay does not dismiss it (AlertDialog).
 */
export function ConflictDialog({
  open,
  partnerName,
  changedAt,
  now,
  labels,
  mine,
  theirs,
  formatValue,
  onForceSave,
  onCancel,
  saving = false,
}: ConflictDialogProps) {
  const [expanded, setExpanded] = useState(false);
  const descriptionId = useId();
  const changesId = useId();
  const rows = diffFields(labels, mine, theirs, formatValue);
  const elapsed = formatElapsed(changedAt, now ?? new Date());

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onCancel(); // Escape means "Annulla", never "Salva comunque"
      }}
    >
      <AlertDialogContent aria-describedby={descriptionId}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {partnerName} ha modificato questo elemento {elapsed} fa
          </AlertDialogTitle>
          <AlertDialogDescription id={descriptionId}>
            Se salvi comunque, la tua versione sostituisce la sua. Se annulli, vedi la sua e la tua
            bozza resta copiabile.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {rows.length > 0 ? (
          <div>
            <Button
              type="button"
              variant="outline"
              aria-expanded={expanded}
              aria-controls={changesId}
              onClick={() => setExpanded((current) => !current)}
            >
              Vedi cosa è cambiato
            </Button>
            {expanded ? (
              <table id={changesId} className="mt-3 w-full text-left text-base">
                <caption className="sr-only">Cosa è cambiato</caption>
                <thead>
                  <tr className="border-border border-b">
                    <th scope="col" className="py-2 pr-2">
                      Campo
                    </th>
                    <th scope="col" className="py-2 pr-2">
                      Tu
                    </th>
                    <th scope="col" className="py-2">
                      {partnerName}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.field} className="border-border border-b align-top">
                      <th scope="row" className="py-2 pr-2 font-semibold">
                        {row.label}
                      </th>
                      <td className="py-2 pr-2 break-words">{row.mine}</td>
                      <td className="py-2 break-words">{row.theirs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Annulla</AlertDialogCancel>
          <Button type="button" onClick={onForceSave} disabled={saving}>
            Salva comunque
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
