"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";
import { guestsToCsv } from "@/domain/guests/csv-export";
import type { PartnerNames } from "@/domain/guests/csv-export";
import { todayInRome } from "@/lib/dates/plain-date";
import { downloadText } from "@/features/export/download";
import type { GroupView, GuestView } from "./data";
import type { MenuAction } from "./GroupHeader";

/** "roadmap2yes-invitati-2026-11-25.csv": the same name the complete export uses. */
export const guestsCsvFileName = (today: string): string => `roadmap2yes-invitati-${today}.csv`;

/**
 * The "Esporta CSV" entry of the Altro menu (AC21). It ALWAYS exports every live guest, whatever
 * filters the screen has, and says so in text ("Esporta tutti i 42 invitati, anche se hai dei filtri
 * attivi."); deleted guests are never in it. The file is made in the browser from data already on
 * screen: nothing is sent anywhere. With no guest the entry is off and says why.
 */
export function exportMenuAction(
  live: readonly GuestView[],
  groups: readonly GroupView[],
  names: PartnerNames,
  now: () => Date = () => new Date(),
): MenuAction {
  const count = live.length;
  return {
    label: "Esporta CSV",
    icon: <Download aria-hidden />,
    disabled: count === 0,
    description:
      count === 0
        ? "Nessun invitato da esportare."
        : `Esporta tutti i ${count} invitati, anche se hai dei filtri attivi.`,
    onSelect: () => {
      try {
        const csv = guestsToCsv(live, groups, names);
        const name = guestsCsvFileName(todayInRome(now()));
        downloadText(name, csv, "text/csv;charset=utf-8");
        toast(`File salvato: ${name}`);
      } catch {
        toast.error("Non riesco a preparare il file. Riprova.");
      }
    },
  };
}
