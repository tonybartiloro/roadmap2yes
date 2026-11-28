"use client";

import { memo } from "react";
import { Check, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { linkStateText, type Presence, type Recipient } from "@/features/rsvp/view";
import type { GuestView } from "./data";
import type { GuestRsvp } from "./rsvp-model";
import { fullName, sideText, typeText, type PartnerNames } from "./view";

/**
 * Column template from 768 px (design §7): name, type, side, then group (flat list only) and table
 * (only with tables). Written out in full so Tailwind sees every class.
 */
export function rowColumns(withGroup: boolean, withTable: boolean, withPresence = false): string {
  // "Presenza" is the last column (design §1.2); the others narrow a little to keep Nome readable.
  if (withPresence) {
    // The last column (5.5rem) holds "In attesa" with its icon on one line (whitespace-nowrap).
    if (withGroup && withTable) {
      // 6 tracks at 768 px: Type 4rem, so a long name wraps onto two lines, not four (DES-03, QA-20)
      return "md:grid-cols-[minmax(8rem,1fr)_4rem_minmax(0,4.5rem)_minmax(0,5.5rem)_minmax(0,5rem)_5.5rem]";
    }
    if (withGroup) {
      return "md:grid-cols-[minmax(8rem,1fr)_4.5rem_minmax(0,5rem)_minmax(0,6rem)_5.5rem]";
    }
    if (withTable) {
      return "md:grid-cols-[minmax(8rem,1fr)_4.5rem_minmax(0,5rem)_minmax(0,5rem)_5.5rem]";
    }
    return "md:grid-cols-[minmax(8rem,1fr)_5rem_minmax(0,6rem)_5.5rem]";
  }
  if (withGroup && withTable) {
    return "md:grid-cols-[minmax(8rem,1fr)_5rem_minmax(0,6rem)_minmax(0,7rem)_minmax(0,6rem)]";
  }
  if (withGroup) return "md:grid-cols-[minmax(8rem,1fr)_5rem_minmax(0,6rem)_minmax(0,7rem)]";
  if (withTable) return "md:grid-cols-[minmax(8rem,1fr)_5rem_minmax(0,6rem)_minmax(0,6rem)]";
  return "md:grid-cols-[minmax(8rem,1fr)_5rem_minmax(0,6rem)]";
}

// Cells: wrap long text inside their column instead of cutting it (REV-61).
const CELL = "md:row-start-1 min-w-0 break-words";

/** Gap between columns from 768 px: tighter with the presence column, to give the name room. */
export function rowGap(withPresence: boolean): string {
  return withPresence ? "md:gap-x-2" : "md:gap-x-3";
}

/** Written out so Tailwind sees every class. */
const COL_START = [
  "md:col-start-1",
  "md:col-start-2",
  "md:col-start-3",
  "md:col-start-4",
  "md:col-start-5",
  "md:col-start-6",
] as const;

const PRESENCE_VIEW = {
  yes: { Icon: Check, text: "Sì", className: "" },
  no: { Icon: X, text: "No", className: "" },
  pending: { Icon: Clock, text: "In attesa", className: "text-muted-foreground" },
} as const;

/** Text and icon, never colour alone (design §1.2). */
function PresenceCell({
  presence,
  column,
  corner,
}: {
  presence: Presence;
  column: number;
  /** Below 768 px: top right, next to the name (a row with "Invia" keeps it in the flow instead). */
  corner: boolean;
}) {
  const { Icon, text, className } = PRESENCE_VIEW[presence];
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm whitespace-nowrap md:static md:row-start-1 md:text-base ${corner ? "absolute top-0 right-0" : ""} ${COL_START[column - 1]} ${className}`}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {text}
    </span>
  );
}

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
      <span className={visible ? "mx-1.5 md:sr-only md:mx-0" : "sr-only"}>·</span>{" "}
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
  rsvp,
  onSend,
  reserveSend = false,
}: {
  /** Keeps the room of "Invia" on the right, so the columns line up with rows that have one. */
  reserveSend?: boolean;
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
  /** Presence and link state; absent while the RSVP data is not there (schema not migrated). */
  rsvp?: GuestRsvp;
  /** "Invia" of a recipient on their own; absent without permission to edit. */
  onSend?: (recipient: Recipient) => void;
}) {
  const name = fullName(guest);
  const type = typeText(guest.category);
  const side = sideText(guest.side, partners);
  const link = rsvp?.link ?? null;
  const details = (
    <span
      className={`relative flex min-w-0 flex-1 flex-col md:grid md:items-center ${rowGap(Boolean(rsvp))} ${rowColumns(withGroup, withTable, Boolean(rsvp))}`}
    >
      <span
        className={`min-w-0 [overflow-wrap:anywhere] ${rsvp ? "md:leading-tight" : ""} md:col-start-1 md:row-start-1 ${rsvp && !link ? "pr-24 md:pr-0" : ""}`}
      >
        {name}
      </span>{" "}
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
      {rsvp ? (
        <>
          <Sep visible={false} />
          <PresenceCell
            presence={rsvp.presence}
            column={4 + Number(withGroup) + Number(withTable)}
            corner={!link}
          />
        </>
      ) : null}
      {link ? (
        <span className="text-muted-foreground text-sm md:col-span-full md:row-start-2">
          {linkStateText(link.state)}
        </span>
      ) : null}
      {extra}
    </span>
  );
  const box = "flex min-h-11 w-full min-w-0 items-center gap-3 px-3 py-2 text-left text-base";
  const sendSlot = !selecting && (onSend !== undefined || reserveSend);

  return (
    <li
      className={`border-border border-b last:border-b-0 ${sendSlot ? "flex items-center" : ""}`}
      data-testid="guest-row"
    >
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
      {sendSlot && link && onSend ? (
        <Button
          type="button"
          variant="outline"
          className="mr-3 min-h-11 w-20 shrink-0 md:w-16"
          aria-label={`Invia il link di ${name}`}
          onClick={() => onSend(link.recipient)}
        >
          Invia
        </Button>
      ) : sendSlot ? (
        <span aria-hidden className="mr-3 hidden w-16 shrink-0 md:block" />
      ) : null}
    </li>
  );
});
