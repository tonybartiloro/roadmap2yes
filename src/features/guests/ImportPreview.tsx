"use client";

import { useMemo, useState } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { plural } from "@/components/format";
import { CATEGORY_LABELS } from "@/domain/guests/types";
import type { ImportPreview as ParsedPreview, ImportRow } from "@/domain/guests/csv-import";
import { ShowMore } from "./ShowMore";
import { fullName, PAGE_SIZE } from "./view";

/** Rows with an error first, then those with a warning, then the ready ones (design §2.5). */
function ordered(rows: readonly ImportRow[]): ImportRow[] {
  const rank = (row: ImportRow) => (row.status === "error" ? 0 : row.warnings.length > 0 ? 1 : 2);
  return rows.toSorted((a, b) => rank(a) - rank(b) || a.line - b.line);
}

/** What is shown of a row's source: a runaway row (an unclosed quote) can be megabytes. "Copia" keeps it whole. */
export function clipSource(source: string, max = 200): string {
  return source.length > max ? `${source.slice(0, max)}…` : source;
}

function Card({ row }: { row: ImportRow }) {
  const guest = row.guest;
  return (
    <li
      className="border-border bg-card flex flex-col gap-1 rounded-lg border p-3"
      data-testid={`import-row-${row.status}`}
    >
      {row.status === "error" ? (
        <>
          <p className="text-destructive flex items-start gap-1.5 text-base font-semibold">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Riga {row.line}: {row.errors.join("; ")}
            </span>
          </p>
          <p className="text-muted-foreground text-sm break-words">{clipSource(row.source)}</p>
        </>
      ) : (
        <>
          <p className="text-base font-semibold break-words">
            {guest ? fullName(guest) : ""}
            <span className="text-muted-foreground font-normal"> · riga {row.line}</span>
          </p>
          <p className="text-muted-foreground text-sm">
            {[
              guest ? CATEGORY_LABELS[guest.category] : "",
              row.group
                ? row.group.isNew
                  ? `gruppo nuovo «${row.group.name}»`
                  : `gruppo «${row.group.name}»`
                : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {row.warnings.map((warning) => (
            <p key={warning} className="flex items-start gap-1.5 text-sm">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                Riga {row.line}: {warning}. La importo lo stesso.
              </span>
            </p>
          ))}
        </>
      )}
    </li>
  );
}

/**
 * The preview as cards (AC17-AC19): the counts "Pronte · Da correggere · Avvisi", the groups that
 * will be created, then the cards, 100 at a time ("Mostra altre"). Errors and warnings are text
 * with an icon, never colour alone. Rows with an error are skipped by the import; a warning is not.
 */
export function ImportPreview({ preview }: { preview: ParsedPreview }) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const rows = useMemo(() => ordered(preview.rows), [preview.rows]);
  return (
    <div className="flex flex-col gap-3" data-testid="import-preview">
      <p role="status" className="text-base font-semibold">
        Pronte {preview.ready} · Da correggere {preview.invalid} · Avvisi {preview.warned}
      </p>
      {preview.newGroups.length > 0 ? (
        <p className="text-sm">
          Creo {plural(preview.newGroups.length, "gruppo", "gruppi")}:{" "}
          {preview.newGroups.join(", ")}.
        </p>
      ) : null}
      <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">
        {rows.slice(0, shown).map((row) => (
          <Card key={row.line} row={row} />
        ))}
      </ul>
      <ShowMore remaining={rows.length - shown} onClick={() => setShown((n) => n + PAGE_SIZE)} />
    </div>
  );
}
