# FEAT-2026-002 — Guida d'uso nell'app: UX/UI design (F2 finale)

<!-- Riferimenti: brief.md (AC1-AC7, R1-R6, Q1-Q7), log.md (DES-n, risposte del developer). Design system: FEAT-2026-001/design.md §2, §5.4, §6, §8, §9. Sostituisce la bozza F1 (DES-1 "dentro Altro" superata da Q1). -->

## Nav a 6 voci e nome della sezione (AC1, AC7)
Ordine: Home, Percorso, Scelte, Budget, **<Sezione>**, **Guida** (ultima, icona `BookOpen`, `/guida`). `NAV_ITEMS` di `src/components/AppNav.tsx`; `isActivePath` copre già `/guida/<slug>`.

**Misura (CSS reale):** barra mobile = `li flex-1` → a 320 px ogni voce è 53,3 px; il `Link` ha `px-1` (4+4 px) → **45,3 px utili** per l'etichetta, `text-xs` (12 px), `font-semibold` se attiva, nessun a capo né troncamento: una parola più larga sborda sulla voce vicina. Font = quello del tema (24 famiglie, `src/themes/fonts.ts`); stima con metriche sans medie (Helvetica/Inter), semibold +5%:

| Etichetta | Larghezza a 12 px | 320 px (45,3) | 360 px (~51) | 390 px (~57) |
|---|---|---|---|---|
| **Impostazioni** | ~67-71 px | NO (+25) | NO | NO |
| Percorso (già oggi) | ~48-50 px | borderline (+3..5) | ok | ok |
| Account | ~43-46 px | borderline | ok | ok |
| **Opzioni** | ~41-43 px | ok | ok | ok |
| Profilo | ~34 px | ok | ok | ok |

Nemmeno a 10 px "Impostazioni" (~56 px) entra, e un'abbreviazione ("Impost.") è illeggibile per screen reader e per chi la legge. In rail a 768 px (`md:w-20`, 64 px utili, etichetta sotto l'icona) "Impostazioni" sborderebbe ugualmente; da 1024 px (`lg:w-56`, riga) va bene.

**Raccomandazione: sezione "Opzioni"** (icona `Settings`, ingranaggio). Ragioni: entra con margine a 320 px; descrive account, aspetto, promemoria, esportazione, dati delle nozze meglio di "Altro"; non crea il doppione con "Impostazioni nozze", che **resta com'è** (nessuna rinomina interna, meno testi da toccare in app, email e docs). Alternativa 2: **"Profilo"** (entra, ~34 px) ma è inesatto (dentro ci sono aspetto, promemoria, esportazione) e duplica la voce interna "Profili". Se il developer sceglie comunque "Impostazioni": serve etichetta più corta solo nella barra mobile, ma il nome diverso tra barra e pagina è peggio; sconsigliato.

**Correzione necessaria comunque** (anche con "Opzioni"): con 6 voci "Percorso" è al limite. In `AppNav` sotto `md` usare `px-0.5` (→ 49,3 px utili) e verificare a 320 px nei temi con font più larghi (es. Work Sans, Public Sans, Outfit). Target: `min-h-14` invariato (≥44 px). Non ridurre il font sotto 12 px.

## Flussi (AC1-AC6)
1. Nav → **Guida** (ultima voce, attiva su `/guida` e `/guida/*`, `aria-current="page"`, barra + grassetto come le altre).
2. **Indice** `/guida`: H1 "Guida", frase introduttiva, schede (nome + descrizione + chevron) nell'ordine della tabella di `docs/functional/README.md`; nessuna sezione "Altre pagine" (R2). Tutta la scheda è il link.
3. Scheda → **pagina** `/guida/<slug>`: link "← Guida" in cima, H1 del file, contenuto, in fondo "Torna alla Guida". Dopo la navigazione il focus va all'H1.
4. Link a un altro `.md` della cartella → pagina della Guida; link esterni `http(s)` in nuova scheda con icona e testo nascosto; link fuori cartella/ancore = testo semplice (R4). "Storico delle modifiche" e "Note per chi gestisce l'app" non compaiono.
5. Indietro del browser: link normali, nessuno stato client.
6. Slug non in elenco o con `..`: "Pagina non trovata" (404) + "Torna alla Guida". Non autenticato: reindirizzato all'accesso, nessun contenuto nel markup.

## States
| Schermata | Loading | Empty | Error | Success | Permission denied |
|---|---|---|---|---|---|
| Voce "Guida" in nav | — | — | — | attiva se su `/guida*` | non autenticati non vedono la nav |
| Indice | `guida/loading.tsx` (titolo + 3 righe scheletro, come `altro/loading.tsx`) | nessuna riga in README: "Per ora non c'è nulla da leggere." | `guida/error.tsx` "Non riesco a caricare la Guida." + "Riprova" | schede | accesso |
| Pagina | `loading.tsx` condiviso dal segmento | file vuoto: solo H1 + "Questa pagina è ancora vuota." | `error.tsx` come sopra | contenuto | accesso |
| Non trovata | — | — | — | messaggio + "Torna alla Guida" (404) | — |
| Tabella / blocco codice larghi | — | — | — | scorrono da soli (area focalizzabile) | — |

## Components
| Esigenza | Esistente | Nuovo? |
|---|---|---|
| Scheda (icona, nome, descrizione, chevron) | pattern `LINKS` di `src/app/(app)/altro/page.tsx` | estrarre solo se serve a entrambe (indice Guida usa solo nome+descrizione, senza icona per voce: vedi sotto) |
| Voce nav | `NAV_ITEMS` in `src/components/AppNav.tsx` | no (1 riga) |
| Vuoto / errore / non trovato | `EmptyState`, `ErrorState` (`src/components/`), `Button` (`src/components/ui`) | no |
| Markdown | — | **`GuideMarkdown`** (`src/features/guide/`), server component; mappa `h1-h3,p,ul,ol,a,table,code,pre,strong` |
| Prosa | token del tema (§5.4) | **`.guide-prose`** (CSS locale, `max-w-prose`) |

Indice: icona `BookOpen` solo in nav; le schede dell'indice sono testo + chevron (nessuna icona inventata per pagina).

## Copy (italiano, tono "tu")
| Dove | Testo |
|---|---|
| Nav | **Guida** · sezione **Opzioni** (se confermato) |
| Indice | H1 "Guida" · "Come si usa roadmap2yes, pagina per pagina." |
| Title documento | indice "Guida · roadmap2yes"; pagina "{H1} · Guida · roadmap2yes" (AC6) |
| Link | "← Guida" / "Torna alla Guida" |
| Link esterno | "(si apre in una nuova scheda)" |
| Non trovata | "Pagina non trovata" · "Questa pagina della Guida non esiste (più). Torna all'elenco e cerca da lì." |
| Errore | "Non riesco a caricare la Guida." · "Riprova" |
| Vuoto | "Per ora non c'è nulla da leggere." / "Questa pagina è ancora vuota." |

## Rinomina di "Altro" (AC7): testi da cambiare (grep `src/`)
Il nome nuovo sostituisce "Altro" solo dove indica la sezione; **non** toccare: `PersonForm.tsx:39` ("Altro: scrivi tu"), `budget/model.ts:44`, `content/style-tips.ts:60`, `decisions/components.test.tsx:870`.
- **Nav:** `AppNav.tsx` (etichetta, icona `Settings`; commento "five sections" → six).
- **Pagina:** `(app)/altro/page.tsx`: `metadata.title`, H1 e commento; i test `interactive.test.tsx:282` e `onboarding.test.ts:186` attendono "Altro" nelle etichette.
- **"Torna ad Altro"** (testo del link): `altro/invito/page.tsx`, `altro/profili/page.tsx`, `altro/impostazioni/page.tsx` → "Torna a Opzioni".
- **Onboarding/home:** `onboarding/steps.tsx` (hint r.296; link r.383-384 "Altro > Invito"), `onboarding/Summary.tsx` (r.41-57, cinque frasi "Altro > Invito al partner"), `auth/LoginForm.tsx:61` ("lo fa da Altro").
- **Email e pagine pubbliche:** `app/(public)/email/disattiva/html.ts` (4 frasi "Altro > Promemoria"), `lib/email/templates/reminders.ts:187` e `templates.test.ts:170`.
- Gli URL `/altro/*` restano (nessun testo visibile): decisione di spostamento all'architetto (piano). Aggiornare anche `docs/functional` (F4).

## Accessibility
- Un solo H1 per pagina; H2/H3 mantengono il livello; nessun titolo aggiunto dal contenitore.
- Nav: `aria-current="page"`, bold + barra (non solo colore); target ≥44 px; l'etichetta non si tronca; focus ring visibile come le altre voci.
- Dopo navigazione interna il focus va all'H1 (`tabindex="-1"`); "Vai al contenuto" invariato.
- Link sempre sottolineati, `--primary`, ≥4,5:1 su ogni tema; esterni con icona + testo nascosto.
- Tabelle: `<th scope="col">`, wrapper `role="region"` + `aria-label` + `tabindex="0"`, focus visibile; la pagina non scorre in orizzontale (320 px, zoom 200%). Blocchi `pre` con scroll proprio focalizzabile.
- Solo token del tema, nessun colore letterale.

## Responsive
- 320-430 px: colonna unica, barra con 6 voci (vedi misura), tabelle a scorrimento interno.
- 768 px: rail 80 px (etichetta sotto l'icona: "Opzioni" e "Guida" entrano); contenuto `max-w-prose`, indice `max-w-xl`.
- 1024 px+: rail 224 px con etichetta a fianco; nessun sommario laterale (fuori scope).

## Mockup
```
Barra 320 px (6 voci, 53 px l'una)             Indice /guida            Pagina /guida/percorso
[Home][Perc.][Scelte][Budget][Opzioni][Guida]  Guida                    <- Guida
                                  ^attiva      Come si usa ...          Percorso
                                               [Panoramica        >]    ## Gruppi ...
                                               [Percorso          >]    +-tabella-->+
                                               ...                      [Torna alla Guida]
```

## Visual acceptance checks (F3, proporzionati a S)
- [ ] Barra a 320, 360, 390 px: 6 etichette complete (nessun troncamento/sovrapposizione, "Percorso" incluso) in 3 temi con font diversi (uno largo), chiaro e scuro; "Guida" attiva su indice e pagina.
- [ ] Rail a 768 px e 1024 px: etichette intere, "Guida" ultima e attiva.
- [ ] Indice: schede (12 nelle bozze F1: contare le righe di README) in ordine README, tutta la riga cliccabile, Tab/Invio; "Esci" e voci interne di Opzioni ancora raggiungibili.
- [ ] Pagina con tabella (`budget`, `temi-e-aspetto`) a 320 px: la pagina non scorre in orizzontale, la tabella sì ed è focalizzabile.
- [ ] Link interno resta nella Guida, focus sull'H1, Indietro funziona; nessun link/sezione tecnica né "Storico".
- [ ] `/guida/xyz` e `/guida/..%2Fpackage` → "Pagina non trovata" (404); da disconnessi → accesso.
- [ ] 3 temi (1 chiaro, 1 scuro, 1 con font serif largo) su una pagina con titoli, elenchi, link, tabella, codice: leggibile e contrasto AA; axe senza violazioni; zoom 200%.
- [ ] Il nuovo nome della sezione compare in nav, titolo, "Torna a …", onboarding, e nessun "Altro" residuo (salvo gli esclusi); un solo H1 su tutte le pagine della Guida.
