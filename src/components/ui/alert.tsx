import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Colour is carried by the left border only; the text stays `foreground` (contrast gate). */
const alertVariants = cva(
  "relative w-full rounded-md border border-l-4 bg-card p-4 text-base text-foreground [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-8",
  {
    variants: {
      variant: {
        default: "border-border border-l-primary",
        destructive: "border-border border-l-destructive",
        warning: "border-border border-l-warning",
        success: "border-border border-l-success",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
  return (
    <h5
      data-slot="alert-title"
      className={cn("mb-1 leading-6 font-semibold", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("text-base", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription };
