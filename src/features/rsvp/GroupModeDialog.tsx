"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { plural } from "@/components/format";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useConflict } from "@/features/budget/use-conflict";
import { RSVP_STALE_CODES } from "./constants";
import { setGroupModeAction } from "./actions";
import { useFocusReturn } from "./LinkSheet";

export type GroupMode = "together" | "separate";

const MODE_WORDS: Record<GroupMode, string> = {
  together: "insieme",
  separate: "ognuno per sé",
};

/**
 * Consequence of the switch: only what really exists (design §1.2, BR3). `groupLink` = the group
 * has a link now; `personalLinks` = non-revoked personal links of its people.
 */
export function modeConsequence(
  to: GroupMode,
  counts: { people: number; personalLinks: number; groupLink: boolean },
): string {
  if (to === "separate") {
    return counts.groupLink
      ? `Passando a "ognuno per sé" il link del gruppo smette di funzionare: servono ${plural(counts.people, "link nuovo", "link nuovi")}.`
      : `Passando a "ognuno per sé" ogni persona avrà il suo link. Nessun link da disattivare.`;
  }
  if (counts.personalLinks === 0) {
    return `Passando a "insieme" basta un solo link per il gruppo. Nessun link da disattivare.`;
  }
  const stop =
    counts.personalLinks === 1
      ? "il link personale smette"
      : `i ${counts.personalLinks} link personali smettono`;
  return `Passando a "insieme" ${stop} di funzionare: basta un solo link per il gruppo.`;
}

/**
 * "Come rispondono" of a group: confirms the switch to the other mode and writes the consequence.
 * Focus starts on "Annulla". Mount it when open (with a `key`); `onOpenChange(false)` closes it.
 * `people` = live members (new personal links needed), `personalLinks` = non-revoked personal
 * links of the members. A write conflict opens the ConflictDialog.
 */
export function GroupModeDialog({
  groupId,
  groupName,
  version,
  mode,
  people,
  personalLinks,
  groupLink,
  onOpenChange,
}: {
  groupId: string;
  groupName: string;
  version: number;
  mode: GroupMode;
  people: number;
  personalLinks: number;
  /** The group has a non-revoked link now. */
  groupLink: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const returnFocus = useFocusReturn(`Azioni del gruppo ${groupName}`);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const target: GroupMode = mode === "together" ? "separate" : "together";

  function done(result: Awaited<ReturnType<typeof setGroupModeAction>>) {
    if (result.ok) {
      toast(
        target === "separate" ? "Ora risponde ognuno per sé." : "Ora il gruppo risponde insieme.",
      );
      onOpenChange(false);
      router.refresh();
      return;
    }
    setError(result.message);
    if (RSVP_STALE_CODES.has(result.code)) router.refresh();
  }

  const conflict = useConflict({
    labels: { mode: "Come rispondono" },
    formatValue: (_field, value) => MODE_WORDS[value as GroupMode] ?? String(value ?? "—"),
    partnerName: "Il tuo partner",
    onResolved: done,
    onCancel: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  async function confirm() {
    setError(null);
    const send = (v: number) => setGroupModeAction({ groupId, version: v, mode: target });
    setPending(true);
    let result: Awaited<ReturnType<typeof send>>;
    try {
      result = await send(version);
    } catch {
      // Offline or the server did not answer: say so, nothing was changed.
      setPending(false);
      setError("Non sono riuscito a cambiarlo. Controlla la connessione e riprova.");
      return;
    }
    setPending(false);
    if (conflict.handle(result, { mode: target }, send)) return;
    done(result);
  }

  return (
    <>
      <AlertDialog open onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
        <AlertDialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={returnFocus}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Come rispondono</AlertDialogTitle>
            <AlertDialogDescription>
              {`${groupName}: ora risponde ${MODE_WORDS[mode]}. `}
              {modeConsequence(target, { people, personalLinks, groupLink })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p role="alert" className="text-destructive text-base">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} disabled={pending}>
              Annulla
            </AlertDialogCancel>
            <Button type="button" disabled={pending} onClick={() => void confirm()}>
              {pending ? "Un attimo…" : `Passa a ${MODE_WORDS[target]}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {conflict.dialog}
    </>
  );
}
