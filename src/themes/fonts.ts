/**
 * One `next/font/google` declaration per family of the approved themes (plan §8): `latin` subset,
 * `display: swap` with automatic fallback metrics, no preload. The browser only downloads the
 * faces the active theme actually uses; `check:fonts` enforces the per-theme budget.
 * Each call must stay a literal object (next/font reads it at build time).
 */
import {
  Fraunces,
  Figtree,
  Instrument_Serif,
  Manrope,
  DM_Serif_Display,
  DM_Sans,
  Cormorant_Garamond,
  Nunito_Sans,
  Newsreader,
  Inter,
  Playfair_Display,
  Lato,
  Poiret_One,
  Jost,
  Bellefair,
  Karla,
  Cormorant,
  Work_Sans,
  Bricolage_Grotesque,
  Public_Sans,
  Libre_Baskerville,
  Source_Sans_3,
  Gloock,
  Outfit,
} from "next/font/google";

const fontFraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["600"],
  variable: "--font-fraunces",
});
const fontFigtree = Figtree({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "600"],
  variable: "--font-figtree",
});
const fontInstrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400"],
  variable: "--font-instrument-serif",
});
const fontManrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "600"],
  variable: "--font-manrope",
});
const fontDMSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400"],
  variable: "--font-dm-serif-display",
});
const fontDMSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "600"],
  variable: "--font-dm-sans",
});
const fontCormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["600"],
  variable: "--font-cormorant-garamond",
});
const fontNunitoSans = Nunito_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "600"],
  variable: "--font-nunito-sans",
});
const fontNewsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["600"],
  variable: "--font-newsreader",
});
const fontInter = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "600"],
  variable: "--font-inter",
});
const fontPlayfairDisplay = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["600"],
  variable: "--font-playfair-display",
});
const fontLato = Lato({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "700"],
  variable: "--font-lato",
});
const fontPoiretOne = Poiret_One({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400"],
  variable: "--font-poiret-one",
});
const fontJost = Jost({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "600"],
  variable: "--font-jost",
});
const fontBellefair = Bellefair({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400"],
  variable: "--font-bellefair",
});
const fontKarla = Karla({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "600"],
  variable: "--font-karla",
});
const fontCormorant = Cormorant({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["600"],
  variable: "--font-cormorant",
});
const fontWorkSans = Work_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "600"],
  variable: "--font-work-sans",
});
const fontBricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["600"],
  variable: "--font-bricolage-grotesque",
});
const fontPublicSans = Public_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "600"],
  variable: "--font-public-sans",
});
const fontLibreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400"],
  variable: "--font-libre-baskerville",
});
const fontSourceSans3 = Source_Sans_3({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "600"],
  variable: "--font-source-sans-3",
});
const fontGloock = Gloock({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400"],
  variable: "--font-gloock",
});
const fontOutfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "600"],
  variable: "--font-outfit",
});

/** Class names that define every `--font-<family>` variable; put them on `<html>`. */
export const fontVariableClassName = [
  fontFraunces.variable,
  fontFigtree.variable,
  fontInstrumentSerif.variable,
  fontManrope.variable,
  fontDMSerifDisplay.variable,
  fontDMSans.variable,
  fontCormorantGaramond.variable,
  fontNunitoSans.variable,
  fontNewsreader.variable,
  fontInter.variable,
  fontPlayfairDisplay.variable,
  fontLato.variable,
  fontPoiretOne.variable,
  fontJost.variable,
  fontBellefair.variable,
  fontKarla.variable,
  fontCormorant.variable,
  fontWorkSans.variable,
  fontBricolageGrotesque.variable,
  fontPublicSans.variable,
  fontLibreBaskerville.variable,
  fontSourceSans3.variable,
  fontGloock.variable,
  fontOutfit.variable,
].join(" ");
