/**
 * Style tips (D18, milestones-spec §4): one static sentence per style label, shown in the onboarding
 * summary. In R1 they change NOTHING in the Percorso. `id` is stable; `label` is what is stored in
 * `weddings.style_label`. No emoji, no promises about app features, no fixed "sposo/sposa".
 */
export interface StyleTip {
  readonly id: string;
  readonly label: string;
  /** Up to 40 characters. */
  readonly headline: string;
  readonly tip: string;
}

/** The labels the couple can pick (single choice). "Non lo so ancora" is not a label: it stores none. */
export const STYLE_TIPS: readonly StyleTip[] = [
  {
    id: "classico",
    label: "Classico",
    headline: "Eleganza senza tempo",
    tip: "Punta su pochi elementi curati: una palette sobria, fiori freschi di stagione e una buona luce. Il classico funziona quando tutto è coerente.",
  },
  {
    id: "rustico",
    label: "Rustico",
    headline: "Calore e natura",
    tip: "Scegli materiali naturali come legno, lino e fiori di campo, e una location che li valorizzi. Controlla in anticipo come ci si muove se piove.",
  },
  {
    id: "boho",
    label: "Boho",
    headline: "Libero e naturale",
    tip: "Lascia spazio a dettagli fatti a mano, colori terrosi e cerimonia informale. Meglio pochi elementi scelti bene che molti messi insieme.",
  },
  {
    id: "moderno",
    label: "Moderno",
    headline: "Linee pulite",
    tip: "Scegli una palette ridotta, forme semplici e un allestimento essenziale. Curare luce e musica fa più di mille decorazioni.",
  },
  {
    id: "intimo",
    label: "Intimo",
    headline: "Pochi, ma vicinissimi",
    tip: "Con meno invitati puoi investire in qualità: un menù curato, un luogo speciale, più tempo con tutti. Parti dalla lista e costruisci attorno a quella.",
  },
  {
    id: "festa-grande",
    label: "Festa grande",
    headline: "Tanta gente, tanta energia",
    tip: "Con molti invitati contano logistica e ritmi: tavoli chiari, orari precisi e fornitori che hanno già gestito feste simili. Meglio una buona regia che più dettagli.",
  },
  {
    id: "destination",
    label: "Destination",
    headline: "Il matrimonio in viaggio",
    tip: "Informati presto su documenti e tempi: per gli invitati stranieri o fuori sede servono preavviso e indicazioni chiare. Un save the date aiuta tantissimo.",
  },
  {
    id: "altro",
    label: "Altro",
    headline: "Il tuo stile",
    tip: "Non serve un'etichetta per avere un matrimonio che vi somiglia. Scrivi nella nota le parole che lo descrivono: ci tornerai quando dovrai scegliere.",
  },
];

/** Shown when the couple skips the step ("Non lo so ancora"). */
export const STYLE_TIP_UNKNOWN: StyleTip = {
  id: "non-so",
  label: "Non lo so ancora",
  headline: "Va benissimo così",
  tip: "Nessun problema: lo stile spesso si chiarisce vedendo location, fiori e abiti. Puoi tornare a sceglierlo dalle Impostazioni quando vuoi.",
};

export const STYLE_LABELS: readonly string[] = STYLE_TIPS.map((tip) => tip.label);

/** The tip for a stored label; the "non lo so" one for no label or an unknown one. */
export function styleTipFor(label: string | null | undefined): StyleTip {
  return STYLE_TIPS.find((tip) => tip.label === label) ?? STYLE_TIP_UNKNOWN;
}
