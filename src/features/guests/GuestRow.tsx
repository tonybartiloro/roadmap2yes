"use client";

import { memo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type { GuestView } from "./data";
import { fullName, sideText, typeText, type PartnerNames } from "./view";

/**
 * One person. Normally a button that opens the edit sheet (no aria-label: its name is its visible
 * text, so it always contains it, WCAG 2.5.3; adults get a screen-reader-only "Adulto"); in selection mode a checkbox row. Type, side and group are always text (never colour).
 * `extra` is the extension point for the table column (T9).
 */
export const GuestRow = memo(function GuestRow({
  guest,
  partners,
  groupLabel,
  selecting,
  selected,
  onSelect,
  onOpen,
  tableLabel = null,
  extra,
}: {
  guest: GuestView;
  partners: PartnerNames;
  /** Group name shown as a label in the flat list (search/filters), else `null`. */
  groupLabel: string | null;
  selecting: boolean;
  selected: boolean;
  /** Stable callbacks (the row binds its own id) so a memoised row skips needless renders. */
  onSelect: (id: string, selected: boolean) => void;
  onOpen: (guest: GuestView) => void;
  /** "Tavolo 3": only passed when tables exist (AC16). */
  tableLabel?: string | null;
  extra?: React.ReactNode;
}) {
  const name = fullName(guest);
  const type = typeText(guest.category);
  const details = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="break-words">{name}</span>{" "}
        <span className="text-muted-foreground text-sm break-words">
          {type ? null : <span className="sr-only">Adulto</span>}
          {[type, groupLabel, sideText(guest.side, partners), tableLabel]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {extra}
      </span>
    </>
  );
  const box = "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-base";

  return (
    <li className="border-border border-b last:border-b-0" data-testid="guest-row">
      {selecting ? (
        <label className={`${box} cursor-pointer`}>
          <Checkbox
            checked={selected}
            onCheckedChange={(next) => onSelect(guest.id, next === true)}
            aria-label={`Seleziona ${name}`}
          />
          {details}
        </label>
      ) : (
        <button
          type="button"
          onClick={() => onOpen(guest)}
          className={`${box} hover:bg-muted focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset`}
        >
          {details}
        </button>
      )}
    </li>
  );
});
