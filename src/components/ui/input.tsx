import * as React from "react";
import { cn } from "@/lib/utils";

/** 16 px text (`text-base`) so iOS does not zoom on focus; 44 px tall touch target. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:ring-offset-background aria-invalid:border-destructive flex h-11 w-full min-w-0 rounded-md border px-3 py-2 text-base file:border-0 file:bg-transparent file:text-base file:font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
