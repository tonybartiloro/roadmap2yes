"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, MapPin, MoreHorizontal } from "lucide-react";
import { formatLongDate, plural } from "@/components/format";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { COPY } from "./copy";
import { DATE_DECISION_HREF, PERCORSO_HREF } from "./links";
import { PanelContent } from "./PanelContent";
import type { PreviewView } from "./view";

/** "14 scadenze cambiano rispetto al riferimento" (AC32). */
export function changedText(count: number): string {
  if (count === 0) return "Nessuna scadenza cambia rispetto al riferimento";
  return `${count === 1 ? "1 scadenza cambia" : `${plural(count, "scadenza", "scadenze")} cambiano`} rispetto al riferimento`;
}

/**
 * Preview banner (design §3.8): fixed under the header, not dismissible, `role="status"`.
 * "Esci" and "Imposta come riferimento" are always visible; "Scegli questa data" is inline from
 * 640 px and inside "Altro" on a phone. The reading order is the keyboard order.
 */
export function ScenarioPreviewBanner({
  preview,
  onSetReference,
}: {
  preview: PreviewView;
  onSetReference: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { scenario } = preview;
  return (
    <div
      role="status"
      data-testid="preview-banner"
      className="bg-card border-primary sticky top-0 z-20 -mx-4 flex flex-col gap-2 border-y-2 border-dashed px-4 py-3 md:-mx-8 md:px-8"
    >
      <div className="flex flex-col gap-1">
        <p className="flex items-start gap-2 text-base font-semibold">
          <Eye aria-hidden className="mt-0.5 size-5 shrink-0" />
          <span>Anteprima: {scenario.dateText} — nulla è salvato</span>
        </p>
        {scenario.locationText ? (
          <p className="text-muted-foreground flex items-center gap-1 text-sm">
            <MapPin aria-hidden className="size-4" />
            <span>
              <span className="sr-only">Location collegata: </span>
              {scenario.locationText}
            </span>
          </p>
        ) : null}
        <p className="text-sm" data-testid="preview-changed">
          {changedText(preview.changedCount)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" data-testid="preview-exit">
          <Link href={PERCORSO_HREF}>{COPY.previewExit}</Link>
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSetReference}
          data-testid="preview-set-reference"
        >
          {COPY.setReference}
        </Button>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="hidden sm:inline-flex"
          data-testid="preview-choose-date"
        >
          <Link href={DATE_DECISION_HREF}>{COPY.chooseDate}</Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="sm:hidden"
          aria-expanded={menuOpen}
          aria-controls="preview-more-menu"
          data-testid="preview-more"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreHorizontal aria-hidden />
          Altro
        </Button>
      </div>
      {menuOpen ? (
        <div id="preview-more-menu" className="sm:hidden">
          <Button asChild variant="outline" size="sm" data-testid="preview-choose-date-menu">
            <Link href={DATE_DECISION_HREF}>{COPY.chooseDate}</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Confirmation of "Imposta come riferimento" with the consequence in plain words (design §3.8). */
export function ReferenceConfirmSheet({
  preview,
  open,
  saving,
  error,
  onConfirm,
  onCancel,
}: {
  preview: PreviewView | null;
  open: boolean;
  saving: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const scenario = preview?.scenario;
  return (
    <Sheet
      open={open && preview !== null}
      onOpenChange={(next) => (!next && !saving ? onCancel() : undefined)}
    >
      <PanelContent data-testid="reference-confirm">
        <SheetHeader>
          <SheetTitle>Imposta come riferimento</SheetTitle>
          <SheetDescription>
            Le scadenze dei compiti si ricalcolano sul{" "}
            {scenario ? formatLongDate(scenario.dateFrom) : ""}
            {scenario?.kind === "period" ? " (il primo giorno del periodo)" : ""}. I compiti già
            completati o con scadenza modificata da te restano come sono.{" "}
            {preview ? changedCount(preview.changedCount) : ""}
          </SheetDescription>
        </SheetHeader>
        {error ? (
          <p role="alert" className="text-destructive text-base">
            {error}
          </p>
        ) : null}
        <SheetFooter className="sm:flex-row-reverse">
          <Button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            data-testid="reference-confirm-ok"
          >
            {saving ? "Salvo…" : COPY.setReference}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            {COPY.undo}
          </Button>
        </SheetFooter>
      </PanelContent>
    </Sheet>
  );
}

function changedCount(count: number): string {
  if (count === 0) return "Nessuna scadenza cambia.";
  return count === 1 ? "1 scadenza cambia." : `${count} scadenze cambiano.`;
}
