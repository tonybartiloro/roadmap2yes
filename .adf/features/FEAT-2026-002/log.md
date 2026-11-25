# FEAT-2026-002 — decision log

<!-- One section per phase transition, checkpoint or discussion round: who decided what, and why, in a few lines. Details stay in reviews/ and in the commits. Length target: method → Keep files short. -->

## F0 intake — 2026-11-25
- Request (verbatim): "R2 di roadmap2yes: gestione invitati (anagrafica, gruppi/famiglie, tavoli opzionali), conferme di presenza (RSVP) con link personale per ogni invitato, lista nozze. Aggiungi anche una voce di menu "Guida" nell'app che mostra la guida d'uso (oggi in docs/functional)."
- Epic: quattro capacità rilasciabili separatamente → `.adf/roadmap.md` creato con R-02…R-05 (R-01 = FEAT-2026-001, done) e approvato dallo sviluppatore il 2026-11-25. Si parte da R-02 (questa feature).
- Housekeeping: FEAT-2026-001 chiusa (`done`; PR #1 unita il 2026-11-24, produzione rilasciata).
- Size: S — una voce di menu e una pagina che legge `docs/functional`; nessun dato, nessuna migrazione, solo utenti autenticati.
- Team: product-owner, designer, developer, qa-engineer, reviewer.
- Evidenze: menu in `src/components/AppNav.tsx:15` (5 voci, barra mobile piena; commento: nuove aree sotto "Altro"); guida = 12 pagine Markdown in `docs/functional/` con link relativi e un indice in `README.md`.
- Ticket: nessun tracker.

## F1 round 1 — sintesi per ruolo (esito PO) — 2026-11-25
Size S confermata. Nessun dato, nessuna migrazione, nessun cambio ad auth. Conteggio designer: blocking 0, should 9, note 4. Dettagli in `plan.md → Solution` e `design.md`.

Architect:
- ARC-1 (should) file `docs/` nel bundle Vercel, pagine dinamiche → accepted: NFR "letto dal server, nessun JS per il Markdown", controllo su Preview.
- ARC-2 (should) dipendenza Markdown → accepted as question (Q5).
- ARC-3 (should) route e slug da allowlist → accepted: slug solo da elenco reale dei file, `notFound` (R3, AC5).
- ARC-4 (note) auth già presente → accepted: nessun nuovo guard, AC5 via e2e.
- ARC-5 (should) indice completo → accepted: indice = tabella di `README`, più test (R2, AC4).
- ARC-6 (note) regole per link e sezioni → accepted: R4; taglio "Storico" in Q3.
- ARC-7 (note) 320 px, stile senza plugin → accepted: AC2.
- ARC-B (question) "Note per chi gestisce l'app" → accepted as question (Q6).

Designer:
- DES-1 (should) 6ª voce vs "Altro" → accepted (proposta: scheda in Altro); superata da Q1 dello sviluppatore.
- DES-2 (should) H1 e title → accepted: AC6, un solo H1, indice "Guida".
- DES-3 (should) link `../technical` → accepted: testo senza link (Q2, R5).
- DES-4 (should) tabelle a 320 px → accepted: AC2.
- DES-5 (should) riscrittura dei link `.md` → accepted: R4, AC3.
- DES-6 (should) "Storico delle modifiche" → accepted: Q3.
- DES-7 (should) stati mancanti (404, errore, non autenticato) → accepted: AC5.
- DES-8 (should) focus e gerarchia → accepted: AC3, AC6.
- DES-9 (should) indice come schede → accepted; "Altre pagine" rejected (il test AC4 garantisce l'indice completo).
- DES-10, DES-11 (note) leggibilità e link sottolineati → accepted: AC2.
- DES-12 (note) link "← Guida" → accepted; precedente/successiva out.
- DES-13 (note) riga "Guida" in `altro.md` → accepted, rinviata a F4.
- Q4 (descrizione scheda) → superata.

## F1 — risposte dello sviluppatore — 2026-11-25
"Q1 Guida = ultima voce del menu (6ª), non in Altro; Q2 nessuna doc tecnica nella Guida, sorgenti ripuliti; Q3 "Storico" nascosto; Q4 superata, ma "Altro" va rinominato (nuovo AC7, nome finale = Q7 aperta); Q5 `react-markdown` + `remark-gfm` delegato al team; Q6 "Note per chi gestisce l'app" non mostrato, passa alle docs tecniche."

## F2 — design e piano
- `design.md` finale (designer): Guida = 6ª voce, `/guida`; DES-1 superata. Q7: "Impostazioni" non entra nella barra a 320 px; raccomandato "Opzioni", alternativa "Profilo".
- `plan.md` (architect): route `/guida` e `/guida/[...pagina]` (slug da allowlist, 404 propria); lettura server di `docs/functional` con `outputFileTracingIncludes`; renderer `react-markdown@10.1.0` + `remark-gfm@4.0.1` solo server; 6ª voce. 3 step, 10 task. Nessuna migrazione, nessun cambio ad auth, nessun ADR.
- Decisioni: D1 URL `/altro` invariato (proposta, Q8); D3/D4 rinomina `altro.md` → `opzioni.md` in F3, slug = nome confermato; S2 parte solo dopo Q7.

## F2 round 1 — sintesi per ruolo (esito architect) — 2026-11-25
Blocking 0 per PO, designer e QA.

Product owner:
- PO-1 (should) D1 presentata come decisione → accepted in parte: D1 in attesa (Q8); correzione della testata respinta (Gate A già registrato via R-02).
- PO-2 (should) S2 dipende da Q7 → accepted: S2 solo dopo Q7; etichetta in `src/components/section-label.ts`.
- PO-3 (note) testi "Altro > X" in email e onboarding → accepted, elencato per il Gate B.
- PO-4 (note) AC7 con etichetta neutra → preso atto, AC7 neutro.

Designer:
- DES-14 (should) link sottolineati e icona link esterno nel piano → accepted: Solution 3, test di render e stile in e2e.
- DES-15 (should) `th scope="col"` → accepted, test unit.
- DES-16 (should) `px-0.5` spostato in T6 → accepted.
- DES-17 (should) `altro.md` → `opzioni.md` in T8, con link e riga README → accepted.
- DES-18 (note) stati vuoti non nel piano → rejected (irraggiungibili con i file reali).
- DES-19 (note) 1024 px → accepted in `guida.nav.spec.ts`; 360/390 px solo in verifica visiva.

QA:
- QA-1 (should) misura "etichetta che trabocca" a 320 px falsa → accepted: 12 temi × 320/768/1024, `Range` su `li`, dopo `document.fonts.ready`.
- QA-2 (should) contrasto di `/guida/budget` → accepted: in `SCREENS` di `themes.spec.ts` (T9); coppie in `contrast.test.ts` (T4).
- QA-3 (should) test AC3/AC4 non provati → accepted con variante: `checkIndex` puro con fixture; `guide-docs.test.tsx` rende i file veri con `GuideMarkdown`; H1 e salti di livello in unit; e2e su 2 pagine.
- QA-4 (should) accesso alla Preview → accepted: T11, lo sviluppatore entra da sé (risposta sotto).
- QA-5 (should) anonimo e 404 → accepted: `/guida/xyz` in `login.spec` con `maxRedirects:0`; nessuna asserzione sullo stato 404; `aria-current` sulla pagina 404.
- QA-6 (should) target 44 px, tastiera, sottolineatura → accepted: asserzioni nel test a 320 px.
- QA-7 (note) test su "Altro" in `altro.spec` → accepted: H1 e voce nav da costante; commenti invariati.
- QA-8 (note) focus sull'H1 → accepted: focus dopo clic interno, nessun focus al primo caricamento, `goBack()` senza asserire il focus.
- QA-9 (note) ordine T9/T10 → accepted: T9 dopo S1, T10 dopo S2.

## Gate A+B — risposte dello sviluppatore
- Gate B: "Approvo tutto".
- Q7 = "Opzioni"; Q8 = URL `/altro` invariato; T11 = lo sviluppatore entra da sé sull'anteprima nel browser integrato; dipendenze `react-markdown@10.1.0` e `remark-gfm@4.0.1` approvate.

## Gate A (roadmap) e Gate B — 2026-11-25
- Gate A registrato tramite roadmap R-02; Gate B approvato dallo sviluppatore ("Approvo tutto"), copre anche commit, push del branch e PR (repo pubblico). Merge = produzione → Gate C.
- F3 avviata: S1 con developer A (T1–T5) e developer B (T6) in parallelo.

## Checkpoint S1 — 2026-11-25
- Commit: 7b2e364 (T1), 1c67bf2 (T2, finito per errore nel commit del log del coordinatore: nessuna riscrittura della storia), 2f80f1e (T3), 982a97d (T4), 91abfea (T5), 54fe384 + 78b9af4 (T6), 2126a2e (T9 e2e).
- Revisioni: `code-1` (T6) e `code-2` (T1–T5) approvate al primo giro, 0 blocking / 0 should, 7 note. REV-4 (focus all'H1 entrando nella Guida da un'altra sezione solo dopo la prima visita) → da verificare nel controllo visivo del designer. REV-5 → verificato: le tracce di build includono `docs/functional` per `/guida` e `/guida/[...pagina]`.
- Test: unit 1124/1124; e2e (5 spec, mobile+desktop) 115 passed, 1 skip preesistente; `adf verify` pass.
- Aperto: scorrimento orizzontale delle tabelle non provato con contenuto reale (nessuna tabella dei docs supera 320 px).
- Prossimo: S2 (T7 rinomina "Altro" → "Opzioni" in UI/email; T8 docs `altro.md` → `opzioni.md`), poi T10 e2e menu.
- Lo sviluppatore chiede di proseguire senza checkpoint fino a fine F3.

## S2, integrazione e uscita F3 — 2026-11-25
- S2: 4d26199 (T7), cb2ffc3 (T8), 58ce733 (T10 e2e menu). `code-3`: REV-8/REV-9 ("Altro" in README radice e docs tecniche) rimandati a F4 come da Documentation plan; REV-10 accettato.
- Integrazione: `adf verify --with-e2e` fallito solo per ambiente (porta 3000 occupata da un'altra app Docker sulla macchina). Run pulito del QA (`qa-1`, `E2E_PORT=3300`): 264 test, 259 pass, 1 skip, 4 fail non legati al branch (3 WebKit non installato in locale, 1 flake Percorso che passa 3/3 da solo). Nessun bug.
- Design (`design-1`): approvato; DES-20 (focus solo navigando dentro la Guida) e DES-21 (H1 sulla pagina non trovata) corretti in 565d775; REV-11 (`code-4`, robustezza col caricamento in streaming) risolto in 271f1d5 con `GuideShell` nel layout della Guida; e2e 34/34 su build di produzione; tracce di build con `docs/functional` verificate.
- Seguiti proposti: nota `E2E_PORT` nei comandi di `.adf/project.md` (serve approvazione); flake Percorso (chore a parte); commenti "Altro >" nel codice.

## F4 — 2026-11-25
- Sviluppatore: "Sì, con la nota" → nota `E2E_PORT=3300` aggiunta ai Gotchas di `.adf/project.md`.
- Documentazione (e92033f): docs tecniche (architettura, sicurezza, sviluppo-locale-e-test, ambienti-e-rilascio, README), README radice, righe "Storico" nelle pagine funzionali toccate. REV-8 e REV-9 chiusi. Test dei docs 72/72.
