"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Dialog as SheetPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bottom sheet for details/forms on mobile (design §6: "Sheet di dettaglio/form"). */
const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

const sheetVariants = cva(
  "fixed z-50 flex flex-col gap-4 border-border bg-card p-6 text-foreground shadow-lg overflow-y-auto",
  {
    variants: {
      side: {
        bottom: "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-lg border-t",
        right: "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l",
        left: "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r",
        top: "inset-x-0 top-0 max-h-[90dvh] rounded-b-lg border-b",
      },
    },
    defaultVariants: { side: "bottom" },
  },
);

function SheetContent({
  side,
  className,
  children,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & VariantProps<typeof sheetVariants>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className="bg-foreground/50 fixed inset-0 z-50"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="text-foreground hover:bg-muted focus-visible:ring-ring absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none">
          <X className="size-5" aria-hidden="true" />
          <span className="sr-only">Chiudi</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 pr-10", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-[22px] leading-7 font-semibold", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-base", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
