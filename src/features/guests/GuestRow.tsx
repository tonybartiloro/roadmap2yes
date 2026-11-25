"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { GuestView } from "./data";
import { fullName, rowLabel, sideText, typeText, type PartnerNames } from "./view";

/**
 * One person. Normally a button that opens the edit sheet (name "Mario Rossi, adulto, Famiglia
 * Rossi"); in selection mode a checkbox row. Type, side and group are always text (never colour).
 * `extra` is the extension point for the table column (T9).
 */
export function GuestRow({
  guest,
  partners,
  groupLabel,
  selecting,
  selected,
  onSelect,
  onOpen,
  extra,
}: {
  guest: GuestView;
  partners: PartnerNames;
  /** Group name shown as a label in the flat list (search/filters), else `null`. */
  groupLabel: string | null;
  selecting: boolean;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onOpen: () => void;
  extra?: React.ReactNode;
}) {
  const name = fullName(guest);
  const type = typeText(guest.category);
  const details = (
    <>
      <span className="min-w-0 flex-1 break-words">{name}</span>
      <span className="text-muted-foreground flex shrink-0 flex-col items-end text-sm">
        <span>{[type, groupLabel].filter(Boolean).join(" · ")}</span>
        <span>{sideText(guest.side, partners)}</span>
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
            onCheckedChange={(next) => onSelect(next === true)}
            aria-label={`Seleziona ${name}`}
          />
          {details}
        </label>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          aria-label={rowLabel(guest, groupLabel)}
          className={`${box} hover:bg-muted focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset`}
        >
          {details}
        </button>
      )}
    </li>
  );
}
