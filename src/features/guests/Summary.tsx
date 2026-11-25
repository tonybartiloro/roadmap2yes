"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { peopleSummary, SIDE_KEYS, type GuestCounts, type SideKey } from "@/domain/guests";
import { plural } from "@/components/format";
import { breakdown, sideText, type PartnerNames } from "./view";

const sideKeyText = (key: SideKey, partners: PartnerNames) =>
  key === "none" ? "Non indicato" : sideText(key, partners);

/**
 * One-line summary (AC8): "42 persone · 30 adulti · 8 bambini · 4 neonati"; with filters
 * "12 di 42 persone · ..." for the people shown. "Per lato" always counts the whole list.
 * Infants are in the total and have their own number. `extra` is the slot for the T9 table notice.
 */
export function Summary({
  total,
  shown,
  bySide,
  partners,
  extra,
}: {
  total: GuestCounts;
  /** The people the current filters show (equal to `total` without filters). */
  shown: GuestCounts;
  bySide: Record<SideKey, GuestCounts>;
  partners: PartnerNames;
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section aria-label="Riepilogo" className="flex flex-col gap-2" data-testid="guests-summary">
      <p className="text-base font-semibold">
        <span aria-live="polite" data-testid="guests-count">
          {peopleSummary(shown.total, total.total)}
        </span>
        <span className="text-muted-foreground font-normal"> · {breakdown(shown)}</span>
      </p>
      {extra}
      <div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className="text-primary focus-visible:ring-ring -ml-2 flex min-h-11 items-center gap-1 rounded-md px-2 focus-visible:ring-2 focus-visible:outline-none"
        >
          {open ? (
            <ChevronDown aria-hidden className="size-5" />
          ) : (
            <ChevronRight aria-hidden className="size-5" />
          )}
          Per lato
        </button>
        <ul
          id={panelId}
          hidden={!open}
          className="border-border bg-card flex flex-col gap-1 rounded-lg border p-3"
        >
          {SIDE_KEYS.map((key) => {
            const counts = bySide[key];
            return (
              <li key={key} className="flex flex-col text-base" data-testid={`side-${key}`}>
                <span className="font-semibold">
                  {sideKeyText(key, partners)}: {plural(counts.total, "persona", "persone")}
                </span>
                <span className="text-muted-foreground text-sm">{breakdown(counts)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
