import type { MilestoneCategory } from "./types";

/** Single place for the id → Italian label mapping of categories (spec §1). */
export const CATEGORY_LABELS: Readonly<Record<MilestoneCategory, string>> = {
  organizzazione: "Organizzazione",
  location: "Location",
  catering: "Catering",
  abiti: "Abiti",
  "foto-video": "Foto e video",
  musica: "Musica",
  "fiori-allestimento": "Fiori e allestimento",
  fedi: "Fedi",
  partecipazioni: "Partecipazioni",
  "viaggio-nozze": "Viaggio di nozze",
  "burocrazia-varie": "Burocrazia e varie",
  imprevisti: "Imprevisti",
};
