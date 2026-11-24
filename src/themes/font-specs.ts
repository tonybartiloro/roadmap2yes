/**
 * Weights per family loaded by the interface (design §5.1 font notes: headings one weight, body
 * 400 and 600; single-weight families have no synthetic bold). Mirrors the literal
 * `next/font/google` calls in `fonts.ts` (a unit test keeps them aligned).
 * Lato has no 600 face: its body uses 400 and 700.
 */
export const FONT_WEIGHTS: Readonly<Record<string, readonly string[]>> = {
  Fraunces: ["600"],
  Figtree: ["400", "600"],
  "Instrument Serif": ["400"],
  Manrope: ["400", "600"],
  "DM Serif Display": ["400"],
  "DM Sans": ["400", "600"],
  "Cormorant Garamond": ["600"],
  "Nunito Sans": ["400", "600"],
  Newsreader: ["600"],
  Inter: ["400", "600"],
  "Playfair Display": ["600"],
  Lato: ["400", "700"],
  "Poiret One": ["400"],
  Jost: ["400", "600"],
  Bellefair: ["400"],
  Karla: ["400", "600"],
  Cormorant: ["600"],
  "Work Sans": ["400", "600"],
  "Bricolage Grotesque": ["600"],
  "Public Sans": ["400", "600"],
  "Libre Baskerville": ["400"],
  "Source Sans 3": ["400", "600"],
  Gloock: ["400"],
  Outfit: ["400", "600"],
};
