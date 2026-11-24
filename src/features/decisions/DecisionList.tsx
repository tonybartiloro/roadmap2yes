import Link from "next/link";
import { CalendarDays, ChevronRight, MapPin, Scale } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { plural } from "@/components/format";
import { StatusBadge } from "./StatusBadge";
import type { DecisionListItem } from "./types";

const ICONS: Record<string, typeof Scale> = { date: CalendarDays, location: MapPin };

/** List of decisions with their state (design §3.5). Server-renderable: no state, only links. */
export function DecisionList({ items }: { items: readonly DecisionListItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Ancora nessuna scelta"
        description="Le scelte compaiono qui appena finisci di impostare il vostro matrimonio."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3" data-testid="decision-list">
      {items.map((item) => {
        const Icon = ICONS[item.type] ?? Scale;
        return (
          <li key={item.id}>
            <Link
              href={`/scelte/${item.key}`}
              data-testid={`decision-link-${item.key}`}
              className="border-border bg-card hover:bg-muted focus-visible:ring-ring flex min-h-11 items-center gap-3 rounded-lg border p-4 focus-visible:ring-2 focus-visible:outline-none"
            >
              <Icon aria-hidden className="text-primary size-6 shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-semibold break-words">{item.question}</span>
                <span className="text-muted-foreground text-sm">
                  {item.chosenText
                    ? item.chosenText
                    : item.optionCount === 0
                      ? "Nessuna opzione ancora"
                      : plural(item.optionCount, "opzione", "opzioni")}
                </span>
              </span>
              <StatusBadge state={item.state} />
              <ChevronRight aria-hidden className="text-muted-foreground size-5 shrink-0" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
