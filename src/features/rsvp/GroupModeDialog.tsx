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

export type GroupMode = "together" | "separate";

const MODE_WORDS: Record<GroupMode, string> = {
  together: "insieme",
  separate: "ognuno per sé",
};

/** Consequence of the switch, written with the real number (design §1.2). */
export function modeConsequence(
  to: GroupMode,
  counts: { people: number; personalLinks: number },
): string {
  if (to === "separate") {
    return `Passando a "ognuno per sé" il link del gruppo smette di funzionare: servono ${plural(counts.people, "link nuovo", "link nuovi")}.`;
  }
  return `Passando a "insieme" ${counts.personalLinks === 1 ? "il link personale smette" : `i ${counts.personalLinks} link personali smettono`} di funzionare: serve un solo link per il gruppo.`;
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
  onOpenChange,
}: {
  groupId: string;
  groupName: string;
  version: number;
  mode: GroupMode;
  people: number;
  personalLinks: number;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
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
    const result = await send(version);
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
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Come rispondono</AlertDialogTitle>
            <AlertDialogDescription>
              {`${groupName}: ora risponde ${MODE_WORDS[mode]}. `}
              {modeConsequence(target, { people, personalLinks })}
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
