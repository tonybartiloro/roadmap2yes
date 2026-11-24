import type { Cents } from "@/lib/money";

export interface BarModel {
  /** Whole percent of Concordato over Assegnato; can exceed 100. `null` without an assigned amount. */
  readonly agreedPercent: number | null;
  /** Whole percent of Pagato over Assegnato; can exceed 100. */
  readonly paidPercent: number | null;
  /** Bar fill widths, clamped to 0-100. */
  readonly agreedWidth: number;
  readonly paidWidth: number;
  readonly overflow: boolean;
  /** Text equivalent of the bar (AC37): "62% concordato" (+ ", 30% pagato"). */
  readonly text: string;
}

const percent = (part: Cents, whole: Cents): number => Math.round((part * 100) / whole);
const clamp = (n: number): number => Math.min(100, Math.max(0, n));

/** Bar of a category or of the whole budget: Concordato over Assegnato, Pagato included. */
export function barModel(agreed: Cents, paid: Cents, assigned: Cents | null): BarModel {
  if (assigned === null || assigned <= 0) {
    return {
      agreedPercent: null,
      paidPercent: null,
      agreedWidth: 0,
      paidWidth: 0,
      overflow: agreed > 0,
      text: agreed > 0 ? "Nessun importo assegnato" : "Niente di concordato",
    };
  }
  const agreedPercent = percent(agreed, assigned);
  const paidPercent = percent(paid, assigned);
  const text =
    paid > 0
      ? `${agreedPercent}% concordato, ${paidPercent}% pagato`
      : `${agreedPercent}% concordato`;
  return {
    agreedPercent,
    paidPercent,
    agreedWidth: clamp(agreedPercent),
    paidWidth: clamp(paidPercent),
    overflow: agreed > assigned,
    text,
  };
}
