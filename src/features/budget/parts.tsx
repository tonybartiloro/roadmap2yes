import { TriangleAlert } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { barModel, type BudgetWarning } from "@/domain/budget";
import { formatEuro, type Cents } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Warm, non-blocking notices: icon + text, amber border, never a red fill (AC37, PO-7). */
export function WarningList({
  warnings,
  className,
}: {
  warnings: readonly BudgetWarning[];
  className?: string;
}) {
  if (warnings.length === 0) return null;
  return (
    <ul
      aria-label="Avvisi sul budget"
      data-testid="budget-warnings"
      className={cn("flex flex-col gap-2", className)}
    >
      {warnings.map((warning) => (
        <li
          key={`${warning.kind}:${"categoryId" in warning ? warning.categoryId : "itemId" in warning ? warning.itemId : ""}`}
          className="border-border bg-card border-l-warning flex items-start gap-3 rounded-md border border-l-4 p-3"
        >
          <TriangleAlert aria-hidden className="text-warning mt-0.5 size-5 shrink-0" />
          <span className="tabular-nums">{warning.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** "Non assegnato" of the whole budget: always visible, it sticks to the top while scrolling. */
export function UnassignedLine({
  total,
  unassigned,
}: {
  total: Cents | null;
  unassigned: Cents | null;
}) {
  if (total === null) return null;
  return (
    <div
      data-testid="budget-unassigned"
      className="border-border bg-card sticky top-2 z-10 flex items-baseline justify-between gap-3 rounded-md border px-4 py-2 shadow-sm"
    >
      <span className="text-muted-foreground">Non assegnato</span>
      <span className="font-semibold tabular-nums">{formatEuro(unassigned ?? 0)}</span>
    </div>
  );
}

/** Label + amount pairs of a scope (Assegnato, Previsto, Concordato, Pagato, Ancora da pagare). */
export function AmountList({
  rows,
  className,
}: {
  rows: readonly { label: string; value: string; testId?: string }[];
  className?: string;
}) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3", className)}>
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col">
          <dt className="text-muted-foreground text-sm">{row.label}</dt>
          <dd className="font-semibold tabular-nums" data-testid={row.testId}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Concordato over Assegnato with Pagato included (AC37): the bar is paired with its text
 * equivalent ("62% concordato"), which stays on screen and in `aria-valuetext`.
 */
export function CategoryBar({
  label,
  agreed,
  paid,
  assigned,
}: {
  label: string;
  agreed: Cents;
  paid: Cents;
  assigned: Cents | null;
}) {
  const bar = barModel(agreed, paid, assigned);
  return (
    <div className="flex flex-col gap-1">
      <Progress
        value={bar.agreedWidth}
        aria-label={`${label}: ${bar.text}`}
        aria-valuetext={bar.text}
        className={cn(bar.overflow && "[&>div]:bg-warning")}
      />
      <p className="text-muted-foreground text-sm tabular-nums" data-testid="bar-text">
        {bar.text}
        {assigned !== null && paid > 0 ? ` (${formatEuro(paid)} pagati)` : ""}
      </p>
    </div>
  );
}
