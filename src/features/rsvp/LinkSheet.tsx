"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  LINK_ERROR,
  RSVP_STALE_CODES,
  SHARE_ERROR,
  STALE_MESSAGE,
  type SharedPrevious,
} from "./constants";
import {
  formatSharedDay,
  linkStateText,
  whatsappHref,
  whatsappText,
  type LinkState,
  type Recipient,
  type RsvpLink,
} from "./view";

type UrlResult = {
  linkId: string;
  url: string | null;
  error: string | null;
  kind: "generic" | "hash" | "refresh";
};
type Confirm = "rotate" | "revoke";
type Undo = { linkId: string; previous: SharedPrevious; how: string; day: string; until: number };

const TITLE_ID = "link-sheet-title";

/**
 * Focus goes back to what opened the dialog (WCAG 2.4.3). Radix cannot do it for a dialog that has
 * no Trigger (an AlertDialog then sends it to `body`). `fallbackLabel` = the `aria-label` of a
 * button that survives when the opener is gone (a menu sheet that closed).
 */
export function useFocusReturn(fallbackLabel?: string) {
  const [opener] = useState<Element | null>(() =>
    typeof document === "undefined" ? null : document.activeElement,
  );
  return useCallback(
    (event: Event) => {
      event.preventDefault();
      const alive = opener instanceof HTMLElement && opener.isConnected && opener !== document.body;
      const fallback = fallbackLabel
        ? [...document.querySelectorAll<HTMLElement>("button")].find(
            (b) => b.getAttribute("aria-label") === fallbackLabel,
          )
        : undefined;
      (alive ? opener : fallback)?.focus();
    },
    [opener, fallbackLabel],
  );
}

/**
 * "Link di {destinatario}" (design §1.2). The URL loads when the sheet opens, so Copia, Condividi
 * and WhatsApp work with one tap. "Condiviso il" is written only after a copy, a completed share
 * or the WhatsApp tap (never on AbortError or a refused clipboard). While the sheet is open its
 * "Annulla" is a line INSIDE the sheet (a modal sheet blocks the toaster, DES-45); if the sheet
 * closes inside the window the same Annulla moves to a toast. Mount it when open (with a `key`);
 * the lists refresh through `router.refresh()`.
 *
 * `recipient`/`link`/`state` come from `view.ts`; `hadLink` = a revoked link exists for the
 * recipient (label "Crea un nuovo link", also when the sheet is reopened); `firstNames` = first
 * names of the people it covers (WhatsApp greeting, max 3); `couple` = the partners' first names;
 * `expiresOn` = last working day (null while the date is not chosen); `dateChosen` = the date is
 * chosen (BR8 warning, date only); `resendNames` = who "Da rimandare" is about.
 */
export function LinkSheet({
  recipient,
  link,
  hadLink = false,
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
  hadLink?: boolean;
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
  const returnFocus = useFocusReturn("Altro");
  const confirmOpener = useRef<Element | null>(null);
  const [fetched, setFetched] = useState<UrlResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>("rotate");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [revokedId, setRevokedId] = useState<string | null>(null);
  const [retiredId, setRetiredId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [undo, setUndo] = useState<Undo | null>(null);
  const undoRef = useRef<Undo | null>(null);

  const expired = state.kind === "expired";
  // A link we just revoked or replaced is dead: never offered, even before the refresh arrives.
  const retiring = link !== null && link.id === retiredId;
  const linkId = link && link.id !== revokedId && link.id !== retiredId ? link.id : null;
  const working = (state.kind === "shared" || state.kind === "to_share") && linkId !== null;
  const showActions = working && canWrite;

  useEffect(() => {
    if (!showActions || !linkId) return;
    let live = true;
    getLinkUrlAction({ linkId })
      .catch(() => ({ ok: false as const, code: "network", message: LINK_ERROR }))
      .then((result) => {
        if (!live) return;
        if (result.ok) {
          setFetched({ linkId, url: result.data.url, error: null, kind: "generic" });
          return;
        }
        // "stale" = hash mismatch or rotated secret: "va rigenerato" (Nuovo link fixes it). The
        // other stale codes mean the screen is out of date: reload it, no retry (REV-24).
        const refresh = RSVP_STALE_CODES.has(result.code);
        const kind = result.code === "stale" ? "hash" : refresh ? "refresh" : "generic";
        setFetched({ linkId, url: null, error: result.message, kind });
        if (refresh) router.refresh();
      });
    return () => {
      live = false;
    };
  }, [showActions, linkId, reload, router]);

  // "Annulla" lives for the toast window; closing the sheet inside it hands it over to a toast.
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(
      () => {
        undoRef.current = null;
        setUndo(null);
      },
      Math.max(0, undo.until - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [undo]);
  useEffect(
    () => () => {
      const open = undoRef.current;
      if (!open || open.until <= Date.now()) return;
      toast(`${open.how} · Condiviso il ${open.day}`, {
        duration: open.until - Date.now(),
        action: { label: "Annulla", onClick: () => void takeBack(open) },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on unmount only
    [],
  );

  const current = fetched && fetched.linkId === linkId ? fetched : null;
  const loading = (showActions && current === null) || (retiring && canWrite);
  const url = current?.url ?? null;
  const message = edited ?? (url ? whatsappText({ firstNames, couple, url }) : "");

  function failed(result: { code: string; message: string }) {
    setError(result.code === "invalid" ? LINK_ERROR : result.message);
    if (RSVP_STALE_CODES.has(result.code)) router.refresh();
  }

  async function takeBack(open: Undo) {
    if (undoRef.current === open) {
      undoRef.current = null;
      setUndo(null);
    }
    try {
      const back = await unmarkSharedAction({ linkId: open.linkId, previous: open.previous });
      if (!back.ok) toast.error(back.message);
    } catch {
      toast.error(SHARE_ERROR);
    }
    router.refresh();
  }

  async function mark(how: string) {
    if (!linkId) return;
    let result;
    try {
      result = await markSharedAction({ linkId });
    } catch {
      setError(SHARE_ERROR);
      return;
    }
    if (!result.ok) {
      setError(SHARE_ERROR);
      if (RSVP_STALE_CODES.has(result.code)) router.refresh();
      return;
    }
    setError(null);
    const open: Undo = {
      linkId,
      previous: result.data.previous,
      how,
      day: formatSharedDay(new Date().toISOString()),
      until: Date.now() + UNDO_TOAST_MS,
    };
    undoRef.current = open;
    setUndo(open);
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
    await mark("Link copiato");
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
    await mark("Link condiviso");
  }

  async function run(work: () => Promise<{ ok: boolean; code?: string; message?: string }>) {
    setError(null);
    setBusy(true);
    let result: { ok: boolean; code?: string; message?: string };
    try {
      result = await work();
    } catch {
      result = { ok: false, code: "network", message: LINK_ERROR };
    }
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

  function ask(kind: Confirm) {
    confirmOpener.current = document.activeElement;
    setConfirm(kind);
    setConfirmOpen(true);
  }

  async function confirmed() {
    if (!linkId) return;
    const ok = await run(() =>
      confirm === "rotate" ? rotateLinkAction({ linkId }) : revokeLinkAction({ linkId }),
    );
    setConfirmOpen(false);
    if (!ok) return;
    if (confirm === "revoke") setRevokedId(linkId);
    else setRetiredId(linkId);
    setEdited(null);
    toast(confirm === "rotate" ? "Ho creato un nuovo link." : "Link revocato.");
    router.refresh();
  }

  const canCreate = canWrite && !expired && !working && !retiring;
  const canManage = canWrite && !expired && linkId !== null;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <>
      <Sheet open onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
        <PanelContent
          aria-describedby="link-hint"
          onOpenAutoFocus={(event) => {
            // Not on "Nuovo link" (first control before the URL loads): start at the title.
            event.preventDefault();
            document.getElementById(TITLE_ID)?.focus();
          }}
          onCloseAutoFocus={returnFocus}
        >
          <SheetHeader>
            <SheetTitle id={TITLE_ID} tabIndex={-1} className="outline-none">
              {`Link di ${recipient.name}`}
            </SheetTitle>
            <SheetDescription id="link-hint">
              {expired
                ? `${linkStateText(state)}. Se sposti la data, i link tornano a funzionare da soli.`
                : `${linkStateText(state)}. ${
                    expiresOn
                      ? `Scade il ${formatLongDate(expiresOn)}.`
                      : "Non scade finché non scegli la data."
                  }`}
            </SheetDescription>
          </SheetHeader>

          {!dateChosen ? (
            <p role="note" className="border-border rounded-md border p-3 text-base">
              La data non è ancora decisa: chi apre il link vedrà &quot;Data da confermare&quot;.
            </p>
          ) : null}
          {state.kind === "resend" ? (
            <p className="text-base">
              Il link che avevi mandato non funziona più: mandane uno nuovo.
              {resendNames.length > 0 ? ` Riguarda ${resendNames.join(", ")}.` : ""}
            </p>
          ) : null}
          {!canWrite ? (
            <p className="text-muted-foreground text-base">Serve il permesso di modifica.</p>
          ) : null}

          {undo ? (
            <div
              role="status"
              className="bg-muted flex items-center justify-between gap-2 rounded-md p-2 pl-3"
            >
              <span className="min-w-0 text-base">{`${undo.how} · Condiviso il ${undo.day}`}</span>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 shrink-0"
                onClick={() => void takeBack(undo)}
              >
                Annulla
              </Button>
            </div>
          ) : null}

          {canCreate ? (
            <Button type="button" disabled={busy} onClick={() => void create()}>
              {busy
                ? "Un attimo…"
                : hadLink || revokedId !== null
                  ? "Crea un nuovo link"
                  : "Crea link"}
            </Button>
          ) : null}

          {loading ? (
            <div role="status" aria-label="Carico il link" className="flex flex-col gap-3">
              <div className="bg-muted h-24 animate-pulse rounded-md" />
              <div className="bg-muted h-11 animate-pulse rounded-md" />
            </div>
          ) : null}

          {showActions && current?.error ? (
            <div className="flex flex-col gap-3">
              <p role="alert" className="text-destructive text-base">
                {current.kind === "hash"
                  ? `${STALE_MESSAGE} Crea un nuovo link qui sotto.`
                  : current.error}
              </p>
              {current.kind === "generic" ? (
                <Button type="button" variant="outline" onClick={() => setReload((n) => n + 1)}>
                  Riprova
                </Button>
              ) : null}
            </div>
          ) : null}

          {showActions && url ? (
            <div className="flex flex-col gap-3">
              <label htmlFor="link-message" className="text-base font-medium">
                Messaggio
              </label>
              <textarea
                id="link-message"
                aria-describedby="link-message-help"
                value={message}
                rows={4}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => setEdited(event.target.value)}
                className="border-input bg-background min-h-24 w-full rounded-md border p-3 text-base"
              />
              <p id="link-message-help" className="text-muted-foreground text-sm">
                Copia link copia solo il link. Il messaggio parte con Condividi e WhatsApp.
              </p>
              <div className="flex flex-col gap-2">
                <Button type="button" className="min-h-11" onClick={() => void copy()}>
                  Copia link
                </Button>
                {canShare ? (
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
                    onClick={() => void mark("Aperto in WhatsApp")}
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
                    spellCheck={false}
                    autoComplete="off"
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

          {canManage ? (
            <div className="border-border mt-2 flex flex-col gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={() => ask("rotate")}
              >
                Nuovo link
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-destructive min-h-11"
                disabled={busy}
                onClick={() => ask("revoke")}
              >
                Revoca link
              </Button>
            </div>
          ) : null}
        </PanelContent>
      </Sheet>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(next) => (next ? null : setConfirmOpen(false))}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const opener = confirmOpener.current;
            const target =
              opener instanceof HTMLElement && opener.isConnected
                ? opener
                : document.getElementById(TITLE_ID);
            target?.focus();
          }}
        >
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
            <Button
              type="button"
              variant={confirm === "revoke" ? "destructive" : "default"}
              disabled={busy}
              onClick={() => void confirmed()}
            >
              {confirm === "rotate" ? "Crea nuovo link" : "Revoca"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
