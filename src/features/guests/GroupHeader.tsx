"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight, Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PanelContent } from "@/features/timeline/PanelContent";

export interface MenuAction {
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  /** Off, with the reason in `description`. */
  disabled?: boolean;
  /** Always-visible text under the button (not part of its name). */
  description?: string;
  onSelect: () => void;
}

/**
 * A small menu as a sheet of full-width buttons (44 px each, keyboard and screen reader friendly,
 * no hover or swipe). Used by the group header and by the toolbar "Altro".
 */
export function ActionMenu({
  title,
  triggerLabel,
  actions,
  className,
  id,
}: {
  id?: string;
  title: string;
  triggerLabel: string;
  actions: readonly MenuAction[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        {...(id ? { id } : {})}
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        {...(className ? { className } : {})}
      >
        <Ellipsis aria-hidden />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <PanelContent aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription className="sr-only">Scegli un&apos;azione</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2">
            {actions.map((action, index) => (
              <div key={action.label} className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="outline"
                  disabled={action.disabled ?? false}
                  {...(action.description ? { "aria-describedby": `${menuId}-${index}` } : {})}
                  className={`justify-start ${action.destructive ? "text-destructive" : ""}`}
                  onClick={() => {
                    setOpen(false);
                    action.onSelect();
                  }}
                >
                  {action.icon}
                  {action.label}
                </Button>
                {action.description ? (
                  <p id={`${menuId}-${index}`} className="text-muted-foreground px-1 text-sm">
                    {action.description}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </PanelContent>
      </Sheet>
    </>
  );
}

/**
 * Header of a group: an `h2` with the open/close button, the member summary and the group menu
 * (Aggiungi persona, Rinomina, Elimina gruppo). "Senza gruppo" has no menu.
 */
export function GroupHeader({
  name,
  summary,
  open,
  onToggle,
  controlsId,
  actions,
  rsvp,
}: {
  name: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  controlsId: string;
  actions: readonly MenuAction[];
  /** Second line of the title: link state and "Invia" (design §1.2). */
  rsvp?: {
    /** "Famiglia Rossi, 2 sì, 1 in attesa, link condiviso il 12 marzo". */
    accessibleName: string;
    /** "Condiviso il 12 marzo" / "Risponde ognuno per sé". */
    line: string;
    onSend: (() => void) | null;
  };
}) {
  const titleId = useId();
  return (
    <div className="bg-muted/50 flex flex-wrap items-center gap-1 rounded-t-lg pr-1">
      <h2 id={titleId} className="min-w-0 flex-1 text-base font-semibold">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={controlsId}
          {...(rsvp ? { "aria-label": rsvp.accessibleName } : {})}
          onClick={onToggle}
          className="focus-visible:ring-ring flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left focus-visible:ring-2 focus-visible:outline-none"
        >
          {open ? (
            <ChevronDown aria-hidden className="size-5 shrink-0" />
          ) : (
            <ChevronRight aria-hidden className="size-5 shrink-0" />
          )}
          <span className="min-w-0 break-words">
            {name} <span className="text-muted-foreground font-normal">· {summary}</span>
          </span>
        </button>
      </h2>
      {actions.length > 0 ? (
        <ActionMenu title={name} triggerLabel={`Azioni del gruppo ${name}`} actions={actions} />
      ) : null}
      {rsvp ? (
        <div className="flex w-full items-center justify-between gap-2 pr-2 pb-2 pl-10">
          <p className="text-muted-foreground min-w-0 text-sm">{rsvp.line}</p>
          {rsvp.onSend ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 shrink-0"
              aria-label={`Invia il link di ${name}`}
              onClick={rsvp.onSend}
            >
              Invia
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
