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
    const elapsed = -value.days;
    if (value.kind === "definitive") {
      return elapsed === 1 ? "È passato 1 giorno" : `Sono passati ${elapsed} giorni`;
    }
    // Provisional: never a raw count like "548 giorni"; months once over 60 days (design §7.1).
    const base = `La data del ${date} è passata`;
    return elapsed > 60 ? `${base} da ${plural(Math.floor(elapsed / 30), "mese", "mesi")}` : base;
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
  changeReferenceHref,
  className,
}: {
  value: CountdownValue;
  setBy?: string | null;
  locationName?: string | null;
  /** Link "Cambia riferimento" (Scelte > Data); shown whenever there is a reference. */
  changeReferenceHref?: string;
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
      {value.kind !== "none" && changeReferenceHref ? (
        <a href={changeReferenceHref} className="text-primary self-start py-2.5 underline">
          Cambia riferimento
        </a>
      ) : null}
    </section>
  );
}
