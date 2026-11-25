"use client";

import { TriangleAlert } from "lucide-react";
import { infantsText, overText, seatsText, type GuestTable, type Occupancy } from "@/domain/guests";

/**
 * One table: name, seats in text ("7 / 8 posti"), "Oltre la capienza di 8" with an icon (never
 * only colour), the infants line when there are any. The bar is decoration (`aria-hidden`). The
 * card is a button that opens the table sheet; its name is its visible text (WCAG 2.5.3).
 */
export function TableCard({
  table,
  occupancy,
  onOpen,
}: {
  table: GuestTable;
  occupancy: Occupancy;
  onOpen: () => void;
}) {
  const over = overText(occupancy);
  const infants = infantsText(occupancy);
  const percent =
    occupancy.capacity === null
      ? 0
      : Math.min(100, Math.round((occupancy.seated / occupancy.capacity) * 100));
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="table-card"
      className="border-border bg-card hover:border-primary focus-visible:ring-ring flex min-h-11 w-full flex-col gap-1 rounded-lg border p-4 text-left focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="font-semibold break-words">{table.name}</span>{" "}
      <span className="tabular-nums">{seatsText(occupancy)}</span>
      {occupancy.capacity !== null ? (
        <span aria-hidden className="bg-muted block h-2 w-full overflow-hidden rounded-full">
          <span
            className={`block h-full ${over ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${percent}%` }}
          />
        </span>
      ) : null}
      {over ? (
        <span className="text-destructive flex items-center gap-1.5 text-sm font-semibold">
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          {over}
        </span>
      ) : null}
      {infants ? <span className="text-muted-foreground text-sm">{infants}</span> : null}
    </button>
  );
}
