import type { Countdown as CountdownValue } from "@/domain/home";
import { cn } from "@/lib/utils";
import { formatLongDate, plural } from "./format";
import { ReferenceBadge } from "./ReferenceBadge";

/** Sentence of the countdown (design §7.1), static text: it is not a live region. */
export function countdownText(value: CountdownValue): string {
  if (value.kind === "none") return "Data da decidere";
  const date = formatLongDate(value.date);
  if (value.phase === "today") {
    return value.kind === "provisional" ? `Se fosse il ${date}: sarebbe oggi` : "È oggi!";
  }
  if (value.phase === "past") {
    const ago = plural(-value.days, "giorno", "giorni");
    return value.kind === "provisional"
      ? `La data del ${date} è passata da ${ago}`
      : `È passato ${ago}`;
  }
  const days = plural(value.days, "giorno", "giorni");
  if (value.kind === "provisional")
    return `Se fosse il ${date}: manca${value.days === 1 ? "" : "no"} ${days}`;
  return `Manca${value.days === 1 ? "" : "no"} ${days} (${plural(value.weeks, "settimana", "settimane")})`;
}

/**
 * Presentational: renders a `Countdown` value computed by `@/domain/home` (never computes dates).
 * The reference badge (and the linked location, AC60) is part of it.
 */
export function Countdown({
  value,
  setBy,
  locationName,
  className,
}: {
  value: CountdownValue;
  setBy?: string | null;
  locationName?: string | null;
  className?: string;
}) {
  return (
    <section aria-label="Conto alla rovescia" className={cn("flex flex-col gap-2", className)}>
      <p className="font-heading text-[28px] leading-[34px] font-(--font-heading-weight) tabular-nums">
        {countdownText(value)}
      </p>
      {value.kind !== "none" ? (
        <ReferenceBadge status={value.kind} setBy={setBy} locationName={locationName} />
      ) : null}
    </section>
  );
}
