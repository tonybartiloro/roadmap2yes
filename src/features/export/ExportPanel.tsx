"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ExportBundle, ExportFileNames } from "@/domain/export";
import { prepareExportAction } from "./actions";
import { downloadText } from "./download";

type Which = keyof ExportFileNames;

const BUTTONS: ReadonlyArray<{ which: Which; label: string; hint: string; mime: string }> = [
  {
    which: "json",
    label: "Tutto in un file (JSON)",
    hint: "Impostazioni, scelte e storico, compiti, budget e pagamenti.",
    mime: "application/json;charset=utf-8",
  },
  {
    which: "tasksCsv",
    label: "Compiti (CSV)",
    hint: "Da aprire con Excel o Fogli.",
    mime: "text/csv;charset=utf-8",
  },
  {
    which: "budgetCsv",
    label: "Budget (CSV)",
    hint: "Voci, importi concordati e pagato.",
    mime: "text/csv;charset=utf-8",
  },
];

type Phase =
  | { kind: "idle" }
  | { kind: "working"; percent: number; text: string }
  | { kind: "done"; fileName: string }
  | { kind: "failed"; message: string };

/**
 * The three downloads with a progress bar and its text equivalent. The files are made on the
 * server with the person's own session and saved by the browser; the name carries the date.
 */
export function ExportPanel({ fileNames }: { fileNames: ExportFileNames }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "working";

  async function run(which: Which, mime: string) {
    setPhase({ kind: "working", percent: 15, text: "Raccolgo i dati del matrimonio…" });
    try {
      const result = await prepareExportAction();
      if (!result.ok) {
        setPhase({ kind: "failed", message: result.message });
        return;
      }
      const bundle: ExportBundle = result.bundle;
      setPhase({ kind: "working", percent: 70, text: "Preparo il file…" });
      downloadText(bundle.fileNames[which], bundle[which], mime);
      setPhase({ kind: "done", fileName: bundle.fileNames[which] });
    } catch {
      setPhase({ kind: "failed", message: "Non riesco a preparare il file. Riprova." });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {BUTTONS.map(({ which, label, hint, mime }) => (
          <li
            key={which}
            className="border-border bg-card flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">{label}</span>
              <span className="text-muted-foreground text-sm">{hint}</span>
              <span className="text-muted-foreground text-xs">{fileNames[which]}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              data-testid={`export-${which}`}
              disabled={busy}
              onClick={() => void run(which, mime)}
            >
              <Download aria-hidden className="size-4" />
              Scarica
            </Button>
          </li>
        ))}
      </ul>

      <div aria-live="polite" data-testid="export-status" className="flex flex-col gap-2">
        {phase.kind === "working" ? (
          <>
            <Progress
              value={phase.percent}
              aria-label="Avanzamento dell'esportazione"
              data-testid="export-progress"
            />
            <p className="text-sm">{phase.text}</p>
          </>
        ) : null}
        {phase.kind === "done" ? (
          <>
            <Progress value={100} aria-label="Avanzamento dell'esportazione" />
            <p className="text-sm">File pronto: {phase.fileName}</p>
          </>
        ) : null}
        {phase.kind === "failed" ? (
          <p role="alert" className="text-sm">
            {phase.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
