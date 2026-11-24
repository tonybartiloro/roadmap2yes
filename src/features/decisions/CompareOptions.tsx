"use client";

import { useId } from "react";
import { MoveRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { comparisonRows, type CompareCell } from "./model";
import { ProConList, SafeLink } from "./OptionCard";
import type { OptionView, ReferenceView } from "./types";

/** Sticky label column with a visible right edge while the table scrolls (none from 768 px). */
const STICKY =
  "bg-card sticky left-0 z-10 shadow-[4px_0_6px_-4px_var(--foreground)] md:shadow-none";

function Cell({ cell }: { cell: CompareCell }) {
  switch (cell.kind) {
    case "empty":
      return <span aria-label="nessun dato">—</span>;
    case "text":
      return <span className="break-words whitespace-pre-line">{cell.text}</span>;
    case "link":
      return <SafeLink href={cell.href} />;
    case "list":
      if (cell.tone === "plain") {
        return (
          <ul className="flex flex-col gap-1">
            {cell.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        );
      }
      return <ProConList items={cell.items} tone={cell.tone} />;
  }
}

/**
 * "Confronta 2" (AC17): one table, same rows for both options. On a phone the label column stays
 * fixed (sticky) while the table scrolls sideways; from 768 px the two columns sit side by side.
 */
export function CompareOptions({
  a,
  b,
  type,
  reference,
  onClose,
}: {
  a: OptionView;
  b: OptionView;
  type: string;
  reference: ReferenceView | null;
  onClose: () => void;
}) {
  const headingId = useId();
  const rows = comparisonRows(a, b, type, reference);
  return (
    <section aria-labelledby={headingId} data-testid="compare" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-[22px] leading-7">
          Confronto
        </h2>
        <Button type="button" variant="outline" onClick={onClose}>
          <X aria-hidden className="size-4" />
          Chiudi il confronto
        </Button>
      </div>
      {/* Visible and read out: on a phone the second option is off to the right (DES-33). */}
      <p
        data-testid="compare-hint"
        className="text-muted-foreground flex items-center gap-1.5 text-sm md:hidden"
      >
        <MoveRight aria-hidden className="size-4 shrink-0" />
        Scorri di lato per vedere l&apos;altra opzione.
      </p>
      <div
        role="region"
        aria-labelledby={headingId}
        tabIndex={0}
        className="border-border focus-visible:ring-ring relative max-w-full overflow-x-auto rounded-lg border focus-visible:ring-2 focus-visible:outline-none"
      >
        {/* Fixed narrow columns on a phone so a slice of the next option peeks in; the sticky
            label column has a side shadow as its edge. From 768 px: two equal columns. */}
        <table className="w-[calc(7rem+19rem)] table-fixed border-collapse text-left text-base md:w-full">
          <caption className="sr-only">
            Confronto tra {a.title} e {b.title}. Su schermi stretti scorri in orizzontale.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={`${STICKY} w-28 p-3 md:w-32`}>
                <span className="sr-only">Voce</span>
              </th>
              {[a, b].map((option) => (
                <th
                  key={option.id}
                  scope="col"
                  className="w-[9.5rem] p-3 align-top text-[18px] leading-6 break-words md:w-1/2"
                >
                  {option.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-border border-t align-top">
                <th
                  scope="row"
                  className={`${STICKY} text-muted-foreground w-28 p-3 font-normal md:w-32`}
                >
                  {row.label}
                </th>
                {row.cells.map((cell, index) => (
                  <td key={index} className="p-3">
                    <Cell cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
