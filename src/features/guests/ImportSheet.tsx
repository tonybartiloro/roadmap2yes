"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { plural } from "@/components/format";
import { guestsToCsv, type PartnerNames } from "@/domain/guests/csv-export";
import {
  decodeCsvBytes,
  IMPORT_TOO_LARGE,
  IMPORT_UNREADABLE,
  parseGuestsCsv,
  toImportPayload,
  type ImportPreview as ParsedPreview,
  type ImportRow,
} from "@/domain/guests/csv-import";
import { Textarea } from "@/features/decisions/form-bits";
import { downloadText } from "@/features/export/download";
import { UNDO_TOAST_MS } from "@/features/timeline/copy";
import { PanelContent } from "@/features/timeline/PanelContent";
import type { GroupView, GuestView } from "./data";
import { importGuestsAction, undoGuestImportAction } from "./import-actions";
import { clipSource, ImportPreview } from "./ImportPreview";
import { ShowMore } from "./ShowMore";
import { PAGE_SIZE } from "./view";

/** A file bigger than this is refused before it is read (even 500 maximal rows are ~1.7 MB). */
const MAX_FILE_BYTES = 4_000_000;

type Step = "input" | "preview" | "done";
interface Done {
  batchId: string;
  guests: number;
  skipped: ImportRow[];
}

const STEP_TITLES: Record<Step, string> = {
  input: "Importa invitati",
  preview: "Controlla l'anteprima",
  done: "Importazione finita",
};
const OUTCOME_UNKNOWN =
  "Non so se l'importazione è andata a buon fine. Controlla la lista prima di riprovare.";
/** Codes of a failure whose outcome we cannot vouch for: no answer, or an unreadable one. */
const UNKNOWN_OUTCOME_CODES: ReadonlySet<string> = new Set(["unreachable", "unknown_outcome"]);

const STEP_NUMBER: Record<Step, number> = { input: 1, preview: 2, done: 3 };

/**
 * "Importa" (AC17-AC20), in steps: 1 paste text or choose a CSV, 2 the preview as cards, 3 the
 * result with the skipped rows. The text is read and parsed HERE: the file never leaves the browser;
 * only the ready rows go to the server action. "Torna indietro" keeps the text; closing before
 * "Importa" saves nothing. The "Annulla importazione" toast (>= 8 s) appears when the sheet closes
 * (a toast under an open sheet cannot be clicked); while the sheet is open the same undo is a button.
 */
export function ImportSheet({
  onClose,
  names,
  groups,
  guests,
  onStale,
}: {
  onClose: () => void;
  /** Real first names of the partners (`null` = not set), for the `lato` column. */
  names: PartnerNames;
  /** Live groups and guests: the parser reuses groups by name and warns about duplicates. */
  groups: readonly GroupView[];
  guests: readonly GuestView[];
  onStale: () => void;
}) {
  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [formatOpen, setFormatOpen] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [doneShown, setDoneShown] = useState(PAGE_SIZE);
  const [fileNote, setFileNote] = useState("");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE_BYTES) return setError(IMPORT_TOO_LARGE);
    try {
      const decoded = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
      if (!decoded) return setError(IMPORT_UNREADABLE);
      setText(decoded.text);
      const lines = decoded.text.split(/\r\n|\r|\n/).filter((line) => line.trim() !== "").length;
      setFileNote(`File letto: ${plural(lines, "riga", "righe")}.`);
    } catch {
      setError(IMPORT_UNREADABLE);
    }
  }

  function showPreview() {
    setError(null);
    const live = { groups: groups.filter((g) => !g.deletedAt), guests };
    const parsed = parseGuestsCsv(text, { partners: names, ...live });
    if (!parsed.ok) return setError(parsed.message);
    setPreview(parsed);
    setStep("preview");
  }

  async function undo(batchId: string) {
    const result = await undoGuestImportAction({ batchId });
    if (result.ok) {
      toast(
        `Importazione annullata: ${plural(result.data.guests, "persona rimossa", "persone rimosse")}.`,
      );
    } else {
      toast.error(result.message);
      onStale();
    }
  }

  /** Closing the result step, by any way (Fine, Esc, overlay, X), keeps the import and says how to undo. */
  function finishDone() {
    onClose();
    if (done) announce(done.batchId, done.guests);
  }

  function announce(batchId: string, count: number) {
    toast(`${plural(count, "invitato importato", "invitati importati")}.`, {
      description: `Annulla importazione rimuove le ${count} persone importate.`,
      duration: UNDO_TOAST_MS,
      action: { label: "Annulla importazione", onClick: () => void undo(batchId) },
    });
  }

  async function runImport() {
    if (!preview) return;
    setError(null);
    setPending(true);
    let result: Awaited<ReturnType<typeof importGuestsAction>>;
    try {
      result = await importGuestsAction({ rows: toImportPayload(preview) });
    } catch {
      // No response at all (network, timeout): the write may or may not have happened.
      setPending(false);
      setUnknownOutcome(true);
      return setError(OUTCOME_UNKNOWN);
    }
    setPending(false);
    if (!result.ok) {
      // A database answer means the transaction was rolled back: nothing was imported. Without an
      // answer (unreachable) or with an unreadable one, we cannot say so.
      if (UNKNOWN_OUTCOME_CODES.has(result.code)) {
        setUnknownOutcome(true);
        return setError(OUTCOME_UNKNOWN);
      }
      return setError(`Non ho importato nulla. ${result.message}`);
    }
    const skipped = preview.rows.filter((row) => row.status === "error");
    if (skipped.length === 0) {
      onClose();
      announce(result.data.batchId, result.data.guests);
      return;
    }
    setDone({ batchId: result.data.batchId, guests: result.data.guests, skipped });
    setStep("done");
  }

  async function copySkipped() {
    try {
      await navigator.clipboard.writeText(done?.skipped.map((row) => row.source).join("\n") ?? "");
      toast("Righe copiate.");
    } catch {
      toast.error("Non sono riuscito a copiare: seleziona le righe e copiale a mano.");
    }
  }

  function template() {
    const sample: GuestView = {
      id: "modello",
      firstName: "Mario",
      lastName: "Rossi",
      category: "adult",
      side: "both",
      phone: null,
      email: null,
      notes: null,
      groupId: "g",
      tableId: null,
      deletedAt: null,
      version: 1,
    };
    const group = { id: "g", name: "Famiglia Rossi", deletedAt: null };
    downloadText(
      "modello-invitati.csv",
      guestsToCsv([sample], [group], names),
      "text/csv;charset=utf-8",
    );
  }

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (next || pending) return;
        if (step === "done") finishDone();
        else onClose();
      }}
    >
      <PanelContent className="max-h-[92dvh] overflow-y-auto" aria-describedby="import-step">
        <SheetHeader>
          <SheetTitle ref={titleRef} tabIndex={-1}>
            {STEP_TITLES[step]}
          </SheetTitle>
          <SheetDescription id="import-step">
            Passo {STEP_NUMBER[step]} di 3. Il file resta nel tuo dispositivo.
          </SheetDescription>
        </SheetHeader>

        {step === "input" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-text">Una persona per riga</Label>
              <Textarea
                id="import-text"
                value={text}
                rows={8}
                placeholder="Mario Rossi"
                onChange={(event) => setText(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                Scegli un file CSV
              </Button>
              <Button type="button" variant="outline" onClick={template}>
                Scarica un modello
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                aria-label="File CSV"
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => {
                  void chooseFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>
            <div>
              <Button
                type="button"
                variant="ghost"
                aria-expanded={formatOpen}
                aria-controls="import-format"
                onClick={() => setFormatOpen((current) => !current)}
              >
                Come scrivere il file
              </Button>
              <p id="import-format" hidden={!formatOpen} className="text-muted-foreground text-sm">
                Colonne: nome, cognome, tipo, lato, gruppo, telefono, email, note. Separatore
                virgola o punto e virgola. La prima riga può essere l&apos;intestazione. Con una
                sola colonna, ogni riga è un nome.
              </p>
            </div>
          </div>
        ) : null}

        {step === "preview" && preview ? <ImportPreview preview={preview} /> : null}

        {step === "done" && done ? (
          <div className="flex flex-col gap-3" data-testid="import-done">
            <p role="status" className="text-base font-semibold">
              {plural(done.guests, "invitato importato", "invitati importati")}.{" "}
              {plural(done.skipped.length, "riga saltata", "righe saltate")}.
            </p>
            <ul className="flex flex-col gap-2">
              {done.skipped.slice(0, doneShown).map((row) => (
                <li key={row.line} className="border-border rounded-lg border p-3">
                  <p className="text-base font-semibold">
                    Riga {row.line}: {row.errors.join("; ")}
                  </p>
                  <p className="text-muted-foreground text-sm break-words">
                    {clipSource(row.source)}
                  </p>
                </li>
              ))}
            </ul>
            <ShowMore
              remaining={done.skipped.length - doneShown}
              onClick={() => setDoneShown((n) => n + PAGE_SIZE)}
            />
            <Button type="button" variant="outline" onClick={() => void copySkipped()}>
              Copia le righe saltate
            </Button>
          </div>
        ) : null}

        {fileNote && step === "input" ? (
          <p role="status" className="text-muted-foreground text-sm">
            {fileNote}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-destructive text-base">
            {error}
          </p>
        ) : null}

        <SheetFooter>
          {step === "input" ? (
            <>
              <Button type="button" disabled={text.trim() === ""} onClick={showPreview}>
                Vedi l&apos;anteprima
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Annulla
              </Button>
            </>
          ) : null}
          {step === "preview" && preview ? (
            <>
              {unknownOutcome ? (
                // No blind retry: the first attempt may have been saved.
                <Button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStale();
                  }}
                >
                  Chiudi e controlla l&apos;elenco
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={pending || preview.ready === 0}
                  onClick={() => void runImport()}
                >
                  {pending
                    ? "Un attimo…"
                    : error
                      ? "Riprova"
                      : `Importa ${plural(preview.ready, "invitato", "invitati")}`}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setStep("input")}
              >
                Torna indietro
              </Button>
              {preview.invalid > 0 ? (
                <p className="text-muted-foreground text-sm">
                  {plural(
                    preview.invalid,
                    "riga da correggere viene saltata",
                    "righe da correggere vengono saltate",
                  )}
                  .
                </p>
              ) : null}
            </>
          ) : null}
          {step === "done" && done ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onClose();
                  void undo(done.batchId);
                }}
              >
                Annulla importazione
              </Button>
              <Button type="button" onClick={finishDone}>
                Fine
              </Button>
            </>
          ) : null}
        </SheetFooter>
      </PanelContent>
    </Sheet>
  );
}
