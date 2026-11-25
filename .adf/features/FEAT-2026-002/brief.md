# FEAT-2026-002 — Guida d'uso nell'app: requirements brief

| Request | Ticket | Size | Status |
|---|---|---|---|
| "Aggiungi anche una voce di menu "Guida" nell'app che mostra la guida d'uso (oggi in docs/functional)." | — (roadmap R-02) | S | in discussion |

## Goal
La coppia legge dentro l'app come si usa ogni sezione, senza andare sul repository. Il contenuto arriva dagli stessi file Markdown di `docs/functional`, quindi la guida resta allineata a ogni aggiornamento della documentazione. La guida parla solo di uso funzionale.

## Scope
- **In:** voce "Guida" come ultima voce del menu principale (6 voci), con percorso proprio; indice a schede; una pagina per ogni file di `docs/functional`, con formattazione leggibile; collegamenti tra pagine che restano nella Guida; link "← Guida" in cima alle pagine; solo utenti autenticati; pagina "non trovata". **Pulizia dei file sorgente:** via ogni rimando a `docs/technical` da `docs/functional` (frasi e link riscritti o tolti; il blocco "Note per chi gestisce l'app" di `promemoria-email.md` passa alle docs tecniche). **Rinomina della sezione "Altro"** (Q7).
- **Out (roadmap):** ricerca nel testo, guida contestuale nelle schermate, modifica dei contenuti dall'app.
- **Out (proposta):** riscrittura dei testi oltre la pulizia; pagina precedente/successiva; versione stampabile/PDF.

## Users and permissions
| Role | Can | Cannot |
|---|---|---|
| Partner autenticato (2 persone) | Aprire indice e pagine della Guida | Modificare i contenuti |
| Non autenticato | — | Vedere la Guida (portato all'accesso) |

## User stories
- Come partner, voglio aprire la Guida dal menu per capire come si usa una sezione senza uscire dall'app.
- Come partner, voglio che il menu chiami le cose con il loro nome: "Altro" non descrive Impostazioni e account.

## Acceptance criteria
| # | Criterion |
|---|---|
| AC1 | Given un utente autenticato su mobile o desktop, when guarda il menu, then "Guida" è l'ultima di 6 voci, è la voce attiva su qualsiasi pagina della Guida e apre l'indice a schede (nome e descrizione di ogni pagina, ordine della tabella di `README.md`). |
| AC2 | Given una pagina della Guida, when la legge, then titoli, elenchi, tabelle e codice sono leggibili nei 12 temi (chiaro/scuro) con contrasto AA, la pagina non scorre in orizzontale a 320 px (le tabelle scorrono da sole, raggiungibili da tastiera) e i collegamenti si distinguono anche senza il colore. |
| AC3 | Given una pagina, when tocca un collegamento a un'altra pagina di `docs/functional`, then resta nella Guida e il focus passa al titolo; la sezione "Storico delle modifiche" non è mostrata; un collegamento che esce da `docs/functional` si mostra come testo semplice; un test automatico fallisce se una pagina funzionale rimanda fuori dalla cartella (es. `docs/technical`). |
| AC4 | Given un file di `docs/functional` modificato, when l'app viene ricostruita, then la Guida mostra il nuovo contenuto senza altre modifiche al codice (nessuna copia dei testi); un test automatico fallisce se un `*.md` della cartella non è nella tabella di `README.md`. |
| AC5 | Given un utente non autenticato, when apre la Guida o una sua pagina, then non vede alcun contenuto ed è portato all'accesso; given una pagina inesistente o un percorso non valido, then vede "Pagina non trovata" con "Torna alla Guida". |
| AC6 | Given tastiera o screen reader, when usa la Guida, then ogni pagina ha un solo H1 (quello del file; l'indice si intitola "Guida"), gerarchia senza salti prodotti dal contenitore, titolo del documento "{Pagina} · Guida · roadmap2yes" e target tocco ≥ 44 px. |
| AC7 | Given il menu, when guarda la sezione che oggi si chiama "Altro", then ha il nome confermato dallo sviluppatore al Gate A+B (Q7; proposto "Opzioni"), la voce interna "Impostazioni nozze" è rinominata solo se il nome scelto la duplica, tutte le voci interne e i collegamenti esistenti funzionano ancora, e le 6 etichette stanno nella barra mobile a 320 px senza troncarsi. |

## Business rules and edge cases
| # | Rule / case | Source |
|---|---|---|
| R1 | Fonte unica: solo `docs/functional`, nessun testo duplicato nel codice. | Roadmap R-02 |
| R2 | Indice = righe della tabella di `README.md`, nel suo ordine, come schede; niente "Altre pagine": la completezza la garantisce il test di AC4. | ARC-5, DES-9 |
| R3 | Una pagina è raggiungibile solo se il suo nome è nell'elenco reale dei file; mai un percorso costruito dall'input. | Sicurezza |
| R4 | Link a `.md` sconosciuti, ancore o percorsi fuori cartella: testo semplice. Link esterni `http(s)`: nuova scheda, `noopener`, avviso. | DES-5, ARC-6 |
| R5 | Il contenitore non inventa né modifica testo; i rimandi tecnici si correggono nel sorgente, non nascondendoli nel renderer. | Developer (Q2) |
| R6 | Testi in italiano, tono "tu". Le docs funzionali aggiornate (F4) includono "Guida" e il nuovo nome della sezione. | `.adf/project.md` |

## Non-functional requirements
Mobile-first, WCAG 2.2 AA, 12 temi (colori da token). Contenuto letto dal server, nessun JavaScript per il Markdown nel browser. I file della guida devono esserci anche nel rilascio su Vercel: controllo su Preview (indice + 1 pagina) prima del merge. Nessun dato personale.

## Decisions
| # | Question | Answer | Date |
|---|---|---|---|
| Q1 | Dove sta la voce? | "come ultima voce del menu, non dentro altro": 6ª voce, percorso proprio, attiva sulla Guida (AC1). | 2026-11-25 |
| Q2 | Rimandi a `docs/technical`? | "la doc tecnica non mi interessa, serve solo la guida funzionale": nessun rimando nella Guida; sorgenti ripuliti (scope, AC3). | 2026-11-25 |
| Q3 | "Storico delle modifiche"? | "concordo": nascosto nell'app (AC3). | 2026-11-25 |
| Q4 | Descrizione scheda in Altro | Superata: la Guida non sta più in "Altro". | 2026-11-25 |
| Q5 | Dipendenza Markdown | "fai te": `react-markdown` + `remark-gfm`, versioni fissate, solo server. | 2026-11-25 |
| Q6 | "Note per chi gestisce l'app" | "no": non mostrato, passa alle docs tecniche. | 2026-11-25 |
| Q4b | "Altro" non piace come nome | "perchè dentro ci sono tipo Impostazioni": rinomina in scope (AC7). | 2026-11-25 |
| Q7 | Nome della sezione | Gate A+B ("Approvo tutto"): **"Opzioni"**, icona ingranaggio; "Impostazioni nozze" resta invariata. | 2026-11-25 |
| Q8 | URL `/altro` | Gate A+B: resta invariato, cambia solo l'etichetta. | 2026-11-25 |

## Open questions
- Nessuna. Q7 e Q8 risolte al Gate A+B (vedi Decisions, 2026-11-25).
