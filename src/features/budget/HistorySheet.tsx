"use client";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatEventTime } from "@/features/decisions/model";
import { formatEuro } from "@/lib/money";
import type { VersionView } from "./types";

/** Read-only history of the total (AC33): amount, who, when, and the reason if there is one. */
export function HistorySheet({
  open,
  onOpenChange,
  versions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Newest first. */
  versions: readonly VersionView[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto md:mx-auto md:max-w-lg">
        <SheetHeader>
          <SheetTitle>Storico del budget</SheetTitle>
          <SheetDescription>
            Ogni cambio del totale resta qui, dal più recente: niente viene sovrascritto.
          </SheetDescription>
        </SheetHeader>

        {versions.length === 0 ? (
          <p className="text-muted-foreground">Non hai ancora impostato un totale.</p>
        ) : (
          <ol className="flex flex-col gap-3" data-testid="budget-history">
            {versions.map((version, index) => (
              <li key={version.id} className="border-border flex flex-col gap-0.5 border-b pb-3">
                <p className="font-semibold tabular-nums">
                  {formatEuro(version.totalCents)}
                  {index === 0 ? (
                    <span className="text-muted-foreground font-normal"> · attuale</span>
                  ) : null}
                </p>
                <p className="text-muted-foreground text-sm">
                  {version.authorName}, {formatEventTime(version.createdAt)}
                </p>
                {version.reason ? <p className="whitespace-pre-line">{version.reason}</p> : null}
              </li>
            ))}
          </ol>
        )}

        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
