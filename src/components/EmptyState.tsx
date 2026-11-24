import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Empty list or screen: one sentence that explains, plus one action (design §7.1). */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Usually a `<Button>`; at most one primary action. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "border-border bg-card flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center",
        className,
      )}
    >
      {icon ? (
        <div aria-hidden className="text-primary">
          {icon}
        </div>
      ) : null}
      <h2 className="text-[22px] leading-7">{title}</h2>
      {description ? <p className="text-muted-foreground max-w-prose">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
