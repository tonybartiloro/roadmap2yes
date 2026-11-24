import type { ReactNode } from "react";
import { Check, ExternalLink, Minus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatEuro } from "@/lib/money";
import { cn } from "@/lib/utils";
import { linkHost } from "./model";
import type { OptionView } from "./types";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

const NONE = <span aria-label="nessun dato">—</span>;

/** Pro/contro list: the icon (+ / −) carries the meaning together with the hidden word, not the colour. */
export function ProConList({ items, tone }: { items: readonly string[]; tone: "pro" | "con" }) {
  if (items.length === 0) return NONE;
  const Icon = tone === "pro" ? Plus : Minus;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="flex items-start gap-2">
          <Icon
            aria-hidden
            className={cn(
              "mt-1 size-4 shrink-0",
              tone === "pro" ? "text-success" : "text-destructive",
            )}
          />
          <span>
            <span className="sr-only">{tone === "pro" ? "Pro: " : "Contro: "}</span>
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SafeLink({ href }: { href: string | null }) {
  const host = linkHost(href);
  if (!host || !href) return NONE;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary inline-flex items-center gap-1 underline underline-offset-4"
    >
      {host}
      <ExternalLink aria-hidden className="size-4" />
      <span className="sr-only">(si apre in una nuova scheda)</span>
    </a>
  );
}

/**
 * Card of a candidate (design §3.5, AC17): identical key/value rows on every card so two options
 * can be read against each other; pros and cons with +/− icons. Actions come from the parent.
 */
export function OptionCard({
  option,
  chosen = false,
  discarded = false,
  children,
}: {
  option: OptionView;
  chosen?: boolean;
  discarded?: boolean;
  /** Reactions, compare toggle and buttons. */
  children?: ReactNode;
}) {
  return (
    <li
      data-testid={`option-${option.id}`}
      data-status={option.status}
      className={cn(
        "bg-card flex flex-col gap-3 rounded-lg border p-4",
        chosen ? "border-primary border-2" : "border-border",
        discarded && "text-muted-foreground",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 text-[22px] leading-7 font-semibold break-words">{option.title}</h2>
        {chosen ? (
          <Badge>
            <Check aria-hidden className="size-4" />
            Scelta
          </Badge>
        ) : discarded ? (
          <Badge variant="secondary">Scartata</Badge>
        ) : null}
      </div>
      <dl className="flex flex-col gap-2">
        <Row label="Comune">{option.comune ?? NONE}</Row>
        <Row label="Costo indicativo">
          {option.costCents === null ? NONE : formatEuro(option.costCents)}
        </Row>
        <Row label="Link">
          <SafeLink href={option.link} />
        </Row>
        <Row label="Pro">
          <ProConList items={option.pros} tone="pro" />
        </Row>
        <Row label="Contro">
          <ProConList items={option.cons} tone="con" />
        </Row>
        <Row label="Note">
          {option.notes ? <span className="whitespace-pre-line">{option.notes}</span> : NONE}
        </Row>
      </dl>
      {children}
    </li>
  );
}
