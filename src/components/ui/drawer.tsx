"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { cn } from "@/lib/utils";

/** Bottom drawer (vaul) for mobile sheets with drag-to-dismiss (design §6). */
function Drawer(props: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}
const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerClose = DrawerPrimitive.Close;

function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Overlay className="bg-foreground/50 fixed inset-0 z-50" />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "border-border bg-card text-foreground fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90dvh] flex-col rounded-t-lg border-t",
          className,
        )}
        {...props}
      >
        <div
          className="bg-muted mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-4 overflow-y-auto p-6">{children}</div>
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-auto flex flex-col gap-2", className)} {...props} />;
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      className={cn("text-[22px] leading-7 font-semibold", className)}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      className={cn("text-muted-foreground text-base", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
