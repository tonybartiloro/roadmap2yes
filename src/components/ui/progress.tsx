"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/** Always pair with a text equivalent of the value (design: bars never carry meaning alone). */
function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn("bg-muted relative h-3 w-full overflow-hidden rounded-full", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="bg-primary h-full w-full flex-1 transition-transform motion-reduce:transition-none"
        style={{ transform: `translateX(-${100 - Math.min(Math.max(value ?? 0, 0), 100)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
