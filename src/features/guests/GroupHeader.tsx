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
}: {
  title: string;
  triggerLabel: string;
  actions: readonly MenuAction[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
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
            {actions.map((action) => (
              <Button
                key={action.label}
                type="button"
                variant="outline"
                className={`justify-start ${action.destructive ? "text-destructive" : ""}`}
                onClick={() => {
                  setOpen(false);
                  action.onSelect();
                }}
              >
                {action.icon}
                {action.label}
              </Button>
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
}: {
  name: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  controlsId: string;
  actions: readonly MenuAction[];
}) {
  const titleId = useId();
  return (
    <div className="bg-muted/50 flex items-center gap-1 rounded-t-lg pr-1">
      <h2 id={titleId} className="min-w-0 flex-1 text-base font-semibold">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={controlsId}
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
    </div>
  );
}
