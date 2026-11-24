"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer border-input bg-muted focus-visible:ring-ring focus-visible:ring-offset-background data-[state=checked]:border-primary data-[state=checked]:bg-primary inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="bg-background pointer-events-none block size-5 translate-x-1 rounded-full shadow transition-transform data-[state=checked]:translate-x-6 motion-reduce:transition-none" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
