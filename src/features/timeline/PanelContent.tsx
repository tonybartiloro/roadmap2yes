"use client";

import type { ComponentProps } from "react";
import { SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Sheet content that is a bottom sheet on phones and a side panel from 768 px (design §9: detail
 * panel on the right on Percorso). Bottom padding follows the safe area so the keyboard and the
 * home indicator never cover the actions.
 */
export function PanelContent({ className, ...props }: ComponentProps<typeof SheetContent>) {
  return (
    <SheetContent
      side="bottom"
      className={cn(
        "pb-[max(1.5rem,env(safe-area-inset-bottom))] md:inset-x-auto md:inset-y-0 md:right-0 md:h-full md:max-h-none md:w-[28rem] md:max-w-full md:rounded-none md:rounded-l-lg md:border-t-0 md:border-l",
        className,
      )}
      {...props}
    />
  );
}
