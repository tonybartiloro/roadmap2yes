"use client";

import { memo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type { GuestView } from "./data";
import { fullName, sideText, typeText, type PartnerNames } from "./view";

/**
 * Column template from 768 px (design §7): name, type, side, then group (flat list only) and table
 * (only with tables). Written out in full so Tailwind sees every class.
 */
export function rowColumns(withGroup: boolean, withTable: boolean): string {
  if (withGroup && withTable) {
    return "md:grid-cols-[minmax(8rem,1fr)_5rem_minmax(0,6rem)_minmax(0,7rem)_minmax(0,6rem)]";
  }
  if (withGroup) return "md:grid-cols-[minmax(8rem,1fr)_5rem_minmax(0,6rem)_minmax(0,7rem)]";
  if (withTable) return "md:grid-cols-[minmax(8rem,1fr)_5rem_minmax(0,6rem)_minmax(0,6rem)]";
  return "md:grid-cols-[minmax(8rem,1fr)_5rem_minmax(0,6rem)]";
}

// Cells: wrap long text inside their column instead of cutting it (REV-61).
const CELL = "md:row-start-1 min-w-0 break-words";

/**
 * The " · " between details stays in the DOM so the accessible name reads "Luca Rossi Bambino ·
 * Tony · Famiglia Rossi" (REV-60): visible below 768 px, visually hidden (not removed) from 768 px,
 * where the columns separate the cells. After a non-visible adult marker it is always hidden.
 */
function Sep({ visible }: { visible: boolean }) {
  // The spaces are text nodes OUTSIDE the span, so the accessible name keeps "Bambino · Tony".
  return (
    <>
      {" "}
      <span className={visible ? "md:sr-only" : "sr-only"}>·</span>{" "}
    </>
  );
}

/**
 * One person. Normally a button that opens the edit sheet; in selection mode a checkbox row. It has
 * no aria-label: its name is its visible text in DOM order (name, type, side, group, table), so it
 * always contains it (WCAG 2.5.3); an adult gets "Adulto" (read by screen readers, visible from
 * 768 px). Below 768 px the details wrap under the name; from 768 px they are grid columns. Type,
 * side, group and table are always text, never colour.
 */
export const GuestRow = memo(function GuestRow({
  guest,
  partners,
  groupLabel,
  withGroup = false,
  withTable = false,
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
  /** The list has a group column (flat list). */
  withGroup?: boolean;
  /** The list has a table column (there is at least one live table). */
  withTable?: boolean;
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
  const side = sideText(guest.side, partners);
  const details = (
    <span
      className={`flex min-w-0 flex-1 flex-col md:grid md:items-center md:gap-x-3 ${rowColumns(withGroup, withTable)}`}
    >
      <span className="break-words md:col-start-1 md:row-start-1">{name}</span>{" "}
      <span className="text-muted-foreground flex flex-wrap gap-x-0 text-sm md:contents md:text-base">
        {type ? (
          <span className={`${CELL} md:col-start-2`}>{type}</span>
        ) : (
          <span className="sr-only md:not-sr-only md:col-start-2 md:row-start-1">Adulto</span>
        )}
        <Sep visible={Boolean(type)} />
        <span className={`${CELL} md:col-start-3`}>{side}</span>
        {withGroup && groupLabel ? (
          <>
            <Sep visible />
            <span className={`${CELL} md:col-start-4`}>{groupLabel}</span>
          </>
        ) : null}
        {withTable && tableLabel ? (
          <>
            <Sep visible />
            <span className={`${CELL} ${withGroup ? "md:col-start-5" : "md:col-start-4"}`}>
              {tableLabel}
            </span>
          </>
        ) : null}
      </span>
      {extra}
    </span>
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
