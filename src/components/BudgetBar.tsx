import { TriangleAlert } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatCentsCompact } from "./format";

/**
 * Bar with its text equivalent (design §8: bars never carry meaning alone). `value` and `total`
 * are integer cents. Over the total: calm warning with icon + text, bar full, never a negative.
 */
export function BudgetBar({
  label,
  value,
  total,
  valueLabel = "Concordato",
  className,
}: {
  label: string;
  value: number;
  total: number;
  /** Word before the amounts: "Concordato", "Pagato", "Assegnato". */
  valueLabel?: string;
  className?: string;
}) {
  const over = total > 0 && value > total ? value - total : 0;
  const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const text =
    total > 0
      ? `${valueLabel} ${formatCentsCompact(value)} di ${formatCentsCompact(total)}`
      : `${valueLabel} ${formatCentsCompact(value)}`;
  return (
    <div data-slot="budget-bar" className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{label}</span>
        <span className="text-muted-foreground text-sm tabular-nums">{text}</span>
      </div>
      <Progress
        value={percent}
        aria-label={`${label}: ${text}`}
        aria-valuetext={total > 0 ? `${percent}%` : text}
      />
      {over > 0 ? (
        <p className="text-warning flex items-center gap-1.5 text-sm">
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          <span className="tabular-nums">Sei oltre di {formatCentsCompact(over)}.</span>
        </p>
      ) : null}
    </div>
  );
}
