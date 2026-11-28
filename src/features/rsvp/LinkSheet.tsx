"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatLongDate } from "@/components/format";
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
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UNDO_TOAST_MS } from "@/features/timeline/copy";
import { PanelContent } from "@/features/timeline/PanelContent";
import type { PlainDate } from "@/lib/dates/plain-date";
import {
  createLinksAction,
  getLinkUrlAction,
  markSharedAction,
  revokeLinkAction,
  rotateLinkAction,
  unmarkSharedAction,
} from "./actions";
import { LINK_ERROR, RSVP_STALE_CODES, SHARE_ERROR, STALE_MESSAGE } from "./constants";
import {
  linkStateText,
  whatsappHref,
  whatsappText,
  type LinkState,
  type Recipient,
  type RsvpLink,
} from "./view";

type UrlResult = { linkId: string; url: string | null; error: string | null; stale: boolean };
type Confirm = "rotate" | "revoke" | null;

/**
 * "Link di {destinatario}" (design §1.2). The URL loads when the sheet opens, so Copia, Condividi
 * and WhatsApp work with one tap. "Condiviso il" is written only after a copy, a completed share
 * or the WhatsApp tap (never on AbortError or a refused clipboard), with an "Annulla" toast.
 * Mount it when open (with a `key`); the lists refresh through `router.refresh()`.
 *
 * `recipient`/`link`/`state` come from `view.ts`; `firstNames` = first names of the people it
 * covers (WhatsApp greeting, max 3); `couple` = the partners' first names; `expiresOn` = last
 * working day (null while the date is not chosen); `dateChosen` = date AND place are chosen
 * (BR8 warning); `expired` = state is expired; `resendNames` = names for "Da rimandare".
 */
export function LinkSheet({
  recipient,
  link,
  state,
  expiresOn,
  dateChosen,
  firstNames,
  couple,
  resendNames = [],
  canWrite,
  onOpenChange,
}: {
  recipient: Recipient;
  link: RsvpLink | null;
  state: LinkState;
  expiresOn: PlainDate | null;
  dateChosen: boolean;
  firstNames: readonly string[];
  couple: readonly string[];
  resendNames?: readonly string[];
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [fetched, setFetched] = useState<UrlResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [error, setError] = useState<string | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [revokedId, setRevokedId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const expired = state.kind === "expired";
  const linkId = link && revokedId !== link.id ? link.id : null;
  const working = (state.kind === "shared" || state.kind === "to_share") && linkId !== null;
  const showActions = working && canWrite;

  useEffect(() => {
    if (!showActions || !linkId) return;
    let live = true;
    void getLinkUrlAction({ linkId }).then((result) => {
      if (!live) return;
      setFetched(
        result.ok
          ? { linkId, url: result.data.url, error: null, stale: false }
          : { linkId, url: null, error: result.message, stale: RSVP_STALE_CODES.has(result.code) },
      );
    });
    return () => {
      live = false;
    };
  }, [showActions, linkId, reload]);

  const current = fetched && fetched.linkId === linkId ? fetched : null;
  const loading = showActions && current === null;
  const url = current?.url ?? null;
  const message = edited ?? (url ? whatsappText({ firstNames, couple, url }) : "");

  function failed(result: { code: string; message: string }) {
    setError(result.code === "invalid" ? LINK_ERROR : result.message);
    if (RSVP_STALE_CODES.has(result.code)) router.refresh();
  }

  async function mark(text: string) {
    if (!linkId) return;
    const result = await markSharedAction({ linkId });
    if (!result.ok) {
      toast.error(SHARE_ERROR);
      if (RSVP_STALE_CODES.has(result.code)) router.refresh();
      return;
    }
    const previous = result.data.previous;
    toast(text, {
      duration: UNDO_TOAST_MS,
      action: {
        label: "Annulla",
        onClick: () =>
          void unmarkSharedAction({ linkId, previous }).then((back) => {
            if (!back.ok) toast.error(back.message);
            router.refresh();
          }),
      },
    });
    router.refresh();
  }

  async function copy() {
    setError(null);
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(url ?? "");
    } catch {
      setCopyFailed(true); // the URL stays in a selectable field; nothing is marked
      return;
    }
    await mark("Link copiato.");
  }

  async function share() {
    setError(null);
    try {
      await navigator.share({ text: message });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError("Non sono riuscito ad aprire la condivisione. Prova con Copia link.");
      }
      return;
    }
    await mark("Link condiviso.");
  }

  async function run(work: () => Promise<{ ok: boolean; code?: string; message?: string }>) {
    setError(null);
    setBusy(true);
    const result = await work();
    setBusy(false);
    if (!result.ok) failed({ code: result.code ?? "", message: result.message ?? LINK_ERROR });
    return result.ok;
  }

  async function create() {
    const target =
      recipient.kind === "group" ? { groupId: recipient.id } : { guestId: recipient.id };
    if (await run(() => createLinksAction({ targets: [target] }))) {
      setRevokedId(null);
      router.refresh();
    }
  }

  async function confirmed() {
    const action = confirm;
    if (!action || !linkId) return;
    const ok = await run(() =>
      action === "rotate" ? rotateLinkAction({ linkId }) : revokeLinkAction({ linkId }),
    );
    setConfirm(null);
    if (!ok) return;
    if (action === "revoke") setRevokedId(linkId);
    setEdited(null);
    toast(action === "rotate" ? "Ho creato un nuovo link." : "Link revocato.");
    router.refresh();
  }

  const canCreate = canWrite && !expired && !working;
  const hasOldLink = linkId !== null && !working && !expired;
  const share_ = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <>
      <Sheet open onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
        <PanelContent aria-describedby="link-hint">
          <SheetHeader>
            <SheetTitle>{`Link di ${recipient.name}`}</SheetTitle>
            <SheetDescription id="link-hint">
              {linkStateText(state)}.{" "}
              {expiresOn
                ? `Scade il ${formatLongDate(expiresOn)}.`
                : "Non scade finché non scegli la data."}
            </SheetDescription>
          </SheetHeader>

          {!dateChosen ? (
            <p role="note" className="border-border rounded-md border p-3 text-base">
              La data non è ancora decisa: chi apre il link vedrà &quot;Data da confermare&quot;.
            </p>
          ) : null}
          {expired ? (
            <p className="text-base">
              {linkStateText(state)}. Se sposti la data, i link tornano a funzionare da soli.
            </p>
          ) : null}
          {state.kind === "resend" && resendNames.length > 0 ? (
            <p className="text-base">
              Qualcuno è cambiato di gruppo: il link che avevi mandato non lo copre più (
              {resendNames.join(", ")}).
            </p>
          ) : null}
          {!canWrite ? (
            <p className="text-muted-foreground text-base">Serve il permesso di modifica.</p>
          ) : null}

          {canCreate ? (
            <Button type="button" disabled={busy} onClick={() => void create()}>
              {busy ? "Un attimo…" : revokedId !== null ? "Crea un nuovo link" : "Crea link"}
            </Button>
          ) : null}

          {showActions && loading ? (
            <div role="status" aria-label="Carico il link" className="flex flex-col gap-3">
              <div className="bg-muted h-24 animate-pulse rounded-md" />
              <div className="bg-muted h-11 animate-pulse rounded-md" />
            </div>
          ) : null}

          {showActions && current?.error ? (
            <div className="flex flex-col gap-3">
              <p role="alert" className="text-destructive text-base">
                {current.stale ? STALE_MESSAGE : current.error}
              </p>
              {current.stale ? null : (
                <Button type="button" variant="outline" onClick={() => setReload((n) => n + 1)}>
                  Riprova
                </Button>
              )}
            </div>
          ) : null}

          {showActions && url ? (
            <div className="flex flex-col gap-3">
              <label htmlFor="link-message" className="text-base font-medium">
                Messaggio
              </label>
              <textarea
                id="link-message"
                value={message}
                rows={5}
                onChange={(event) => setEdited(event.target.value)}
                className="border-input bg-background min-h-24 w-full rounded-md border p-3 text-base"
              />
              <div className="flex flex-col gap-2">
                <Button type="button" className="min-h-11" onClick={() => void copy()}>
                  Copia link
                </Button>
                {share_ ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => void share()}
                  >
                    Condividi
                  </Button>
                ) : null}
                <Button asChild variant="outline" className="min-h-11">
                  <a
                    href={whatsappHref(message)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => void mark("Aperto in WhatsApp.")}
                  >
                    WhatsApp
                  </a>
                </Button>
              </div>
              {copyFailed ? (
                <div className="flex flex-col gap-2">
                  <p role="alert" className="text-destructive text-base">
                    Non sono riuscito a copiare. Selezionalo e copialo da qui.
                  </p>
                  <input
                    readOnly
                    aria-label="Indirizzo del link"
                    value={url}
                    onFocus={(event) => event.currentTarget.select()}
                    className="border-input bg-background w-full rounded-md border p-3 text-base"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-destructive text-base">
              {error}
            </p>
          ) : null}

          {canWrite && !expired && (working || hasOldLink) && linkId ? (
            <div className="border-border mt-2 flex flex-col gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={() => setConfirm("rotate")}
              >
                Nuovo link
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-destructive min-h-11"
                disabled={busy}
                onClick={() => setConfirm("revoke")}
              >
                Revoca link
              </Button>
            </div>
          ) : null}
        </PanelContent>
      </Sheet>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(next) => (next ? null : setConfirm(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "rotate" ? "Nuovo link" : "Revoca link"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "rotate"
                ? `Creo un nuovo link per ${recipient.name}? Quello vecchio smette di funzionare: dovrai rimandarlo.`
                : `Revoco il link di ${recipient.name}? Chi lo apre vedrà che non funziona più. Le risposte già date restano.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel>
            <Button type="button" disabled={busy} onClick={() => void confirmed()}>
              {confirm === "rotate" ? "Crea nuovo link" : "Revoca"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
