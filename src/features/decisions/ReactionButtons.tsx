"use client";

import { CircleHelp, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OptionView, ReactionKind } from "./types";

const LABELS: Record<ReactionKind, string> = { prefer: "Preferisco", doubt: "Dubbioso" };

/**
 * Non-binding "Preferisco / Dubbioso" (AC22, D20): the partner sees it as a hint, it never changes
 * the state of the decision. Pressing the active one removes it. Icon + text, never colour alone.
 */
export function ReactionButtons({
  option,
  onReact,
  disabled = false,
  pending = false,
}: {
  option: OptionView;
  /** `null` removes the reaction. */
  onReact?: (reaction: ReactionKind | null) => void;
  /** No buttons (decision taken): only the indications stay visible. */
  disabled?: boolean;
  pending?: boolean;
}) {
  const mine = option.reactions.find((r) => r.mine)?.reaction ?? null;
  const others = option.reactions.filter((r) => !r.mine);
  return (
    <div className="flex flex-col gap-2" data-testid={`reactions-${option.id}`}>
      {!disabled && onReact ? (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={`La tua reazione a ${option.title}`}
        >
          {(["prefer", "doubt"] as const).map((kind) => (
            <Button
              key={kind}
              type="button"
              size="sm"
              variant={mine === kind ? "default" : "outline"}
              aria-pressed={mine === kind}
              disabled={pending}
              onClick={() => onReact(mine === kind ? null : kind)}
            >
              {kind === "prefer" ? (
                <Heart aria-hidden className="size-4" />
              ) : (
                <CircleHelp aria-hidden className="size-4" />
              )}
              {LABELS[kind]}
            </Button>
          ))}
        </div>
      ) : null}
      {(disabled ? option.reactions : others).length > 0 ? (
        <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
          {(disabled ? option.reactions : others).map((r) => (
            <li key={r.userId} className="inline-flex items-center gap-1.5">
              {r.reaction === "prefer" ? (
                <Heart aria-hidden className="size-4" />
              ) : (
                <CircleHelp aria-hidden className="size-4" />
              )}
              <span>
                {r.name}: {r.reaction === "prefer" ? "preferisce" : "ha dei dubbi"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
