"use client";

import { useState } from "react";
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
import { createLinksAction } from "./actions";
import { RSVP_STALE_CODES } from "./constants";
import { useFocusReturn } from "./use-focus-return";
import type { Recipient } from "./view";

const FAILURE = "Non sono riuscito a crearli tutti.";

/**
 * "Crea link per tutti (N)": confirms with the number and, while the date is not chosen, the BR8
 * warning. No "Annulla" toast afterwards (links are revoked one by one, from their sheet). A failure
 * stays in the dialog with "Riprova"; what was already created is not created twice (N shrinks).
 */
export function CreateAllDialog({
  recipients,
  dateChosen,
  onOpenChange,
}: {
  recipients: readonly Recipient[];
  dateChosen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<{ text: string; retry: boolean } | null>(null);
  const returnFocus = useFocusReturn("Altro");
  const count = recipients.length;

  async function create() {
    setFailed(null);
    setPending(true);
    let result: Awaited<ReturnType<typeof createLinksAction>>;
    try {
      result = await createLinksAction({
        targets: recipients.map((r) =>
          r.kind === "group" ? { groupId: r.id } : { guestId: r.id },
        ),
      });
    } catch {
      setPending(false);
      setFailed({ text: `${FAILURE} Controlla la connessione.`, retry: true });
      return;
    }
    setPending(false);
    if (!result.ok) {
      // A session that expired is said as it is (retrying cannot work); a stale screen reloads.
      setFailed({
        text: result.code === "session" ? result.message : FAILURE,
        retry: result.code !== "session",
      });
      if (RSVP_STALE_CODES.has(result.code)) router.refresh();
      return;
    }
    toast(`Ho creato ${plural(result.data.created, "link", "link")}.`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <AlertDialog open onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <AlertDialogContent onCloseAutoFocus={returnFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Crea link per tutti</AlertDialogTitle>
          <AlertDialogDescription>
            {`Creo ${plural(count, "link nuovo", "link nuovi")}? Poi li condividi uno a uno da ogni gruppo o persona.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!dateChosen ? (
          <p role="note" className="text-base">
            La data non è ancora decisa: chi apre il link vedrà &quot;Data da confermare&quot;.
          </p>
        ) : null}
        {failed ? (
          <p role="alert" className="text-destructive text-base">
            {failed.text}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Annulla</AlertDialogCancel>
          {failed && !failed.retry ? null : (
            <Button type="button" disabled={pending} onClick={() => void create()}>
              {pending ? "Un attimo…" : failed ? "Riprova" : "Crea link"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
