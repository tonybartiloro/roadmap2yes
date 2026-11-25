export type ComputedGuestBand = "up_to_50" | "50_80" | "80_120" | "over_120";

/**
 * Band from the real head count. The onboarding labels ("Fino a 50", "Da 50 a 80", ...) share
 * their edges, so the upper edge belongs to the lower band: 50 -> up_to_50, 51 -> 50_80,
 * 80 -> 50_80, 81 -> 80_120, 120 -> 80_120, 121 -> over_120.
 */
export function bandOf(count: number): ComputedGuestBand {
  if (count <= 50) return "up_to_50";
  if (count <= 80) return "50_80";
  if (count <= 120) return "80_120";
  return "over_120";
}

/** Short range text for "Sei a 62 persone: fascia 50-80". */
export const BAND_RANGE_LABELS: Record<ComputedGuestBand, string> = {
  up_to_50: "fino a 50",
  "50_80": "50-80",
  "80_120": "80-120",
  over_120: "oltre 120",
};
