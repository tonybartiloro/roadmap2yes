import { CircleCheck, CircleDot, RotateCcw, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DecisionState } from "./types";

const STATES: Record<
  DecisionState,
  { label: string; Icon: LucideIcon; variant: "default" | "outline" | "secondary" }
> = {
  open: { label: "Aperta", Icon: CircleDot, variant: "outline" },
  taken: { label: "Presa", Icon: CircleCheck, variant: "default" },
  review: { label: "Da rivedere", Icon: RotateCcw, variant: "secondary" },
};

/** Aperta / Presa / Da rivedere: icon + text, never colour alone. */
export function StatusBadge({ state }: { state: DecisionState }) {
  const { label, Icon, variant } = STATES[state];
  return (
    <Badge variant={variant} data-testid="decision-status">
      <Icon aria-hidden className="size-4" />
      {label}
    </Badge>
  );
}
