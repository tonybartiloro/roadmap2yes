# FEAT-2026-003 — Invitati: UX/UI design

> **BOZZA F1** (designer, 2026-11-25). Da consolidare in F2 dopo le risposte alle obiezioni (`reviews/f1-designer.md`) e alle domande Q1-Q8. Riusa il design system di FEAT-2026-001 (mobile-first, shadcn/ui, 12 temi, "tu"). Non ripete il brief: AC/BR per numero.

## Navigazione (Q4, DES-1)
Barra a 320 px: cella = 45,7 px con 7 voci (oggi 53 px con 6). "Percorso" e "Invitati" a 12 px stanno in ~48 px: non entrano.
| Opzione | Pro | Contro |
|---|---|---|
| **A. 7 voci, etichette a 11 px sotto 360 px** (Home, Percorso, Scelte, Budget, Invitati, Opzioni, Guida) | Rispetta la richiesta esplicita ("Guida ultima voce, non dentro altro"); etichette piene, non vaghe; nessuno sposta nulla | Etichette piccole a 320 px; bersagli 45,7 px (≥44 ok) ma stretti; da verificare su 320 reale |
| B. PO: 6 voci, Guida in Opzioni | Barra leggibile come oggi | Contraddice la richiesta dello sviluppatore di due giorni fa; Guida meno trovabile |
| C. 7 voci solo icone sotto 360 px | Spazio | Etichette sparite: l'utente non le vuole vaghe; accessibilità peggiore |
| D. Invitati dentro Scelte | Nessuna voce nuova | Non è una decisione: meno trovabile, nome fuorviante |
| E. Fondere Home e Percorso | 6 voci | Cambia l'architettura R1, fuori ambito |
**Proposta: A**, con `text-[11px]` e `tracking-tight` solo sotto 360 px (`min-[360px]:text-xs`), padding orizzontale 0; ordine Home, Percorso, Scelte, Budget, **Invitati**, Opzioni, Guida. Verifica a 320 in F3; se non regge, ripiego B (decide lo sviluppatore). Da 768 px (rail laterale) nessun problema. La voce è nascosta a chi non ha permesso `guests` (family/planner futuri).

## Schermate e flussi
Route `/invitati`, due schede (`Tabs`): **Persone** (predefinita) e **Tavoli**. Gruppi gestiti nella scheda Persone (intestazione di gruppo con menu), non in una terza scheda.

### 1. Lista Persone (320-390 px)
Dall'alto: titolo, **riepilogo** su una riga ("42 persone · 35 adulti · 7 bambini"), apri "Per lato" (dettaglio comprimibile: Tony / Jessica / Entrambi / Senza lato, con 3 numeri ciascuno, AC7); barra strumenti: ricerca per nome, pulsante **Filtri (n)** (bottom sheet come `FiltersPanel` del Percorso, chip dei filtri attivi rimovibili sotto la barra), menu "Altro" (Importa, Esporta CSV, Eliminati di recente). Con filtri attivi il riepilogo dice "12 di 42 persone" (AC8: totale filtrato senza confondere con AC7). Pulsante "+ Aggiungi" fisso in basso a destra sopra la barra (come Percorso/Budget).
Vista a **gruppi**: sezioni `h2` per gruppo ("Famiglia Rossi · 2 adulti, 1 bambino"), poi "Senza gruppo"; righe: nome e cognome, badge Bambino (testo), lato in testo, tavolo se esiste. Gruppi chiusi di default oltre 100 righe. Con ricerca o filtri la lista diventa piatta alfabetica con il gruppo come etichetta nella riga. Tocco riga: sheet di dettaglio/modifica.
**Selezione multipla** (non nei brief, DES-5): "Seleziona" nel menu, checkbox 44 px, barra azioni in basso ("Assegna a gruppo", "Assegna a tavolo", "Elimina").

### 2. Aggiunta veloce (DES-2, DES-3)
Sheet "Nuovo invitato": campi in ordine nome, cognome, adulto/bambino (radio a segmenti), lato, gruppo (select con "Nuovo gruppo…" in fondo che apre un campo inline), tavolo (solo se esistono), "Altri dati" comprimibile (telefono, email, note). Due pulsanti: **Salva** e **Salva e aggiungi un altro**: il secondo svuota nome e cognome, **mantiene tipo, lato, gruppo, tavolo**, rimette il focus sul nome e annuncia "Mario Rossi aggiunto" (`aria-live`). Dal menu di un gruppo: "Aggiungi persona" con gruppo precompilato. Avviso duplicato (BR4) inline sotto il nome, non bloccante, nessun passaggio in più.
**Nuova famiglia**: da "Aggiungi" la scelta "Una famiglia": nome gruppo + righe (nome, cognome, adulto/bambino) con "Aggiungi un'altra riga", cognome precompilato dal nome gruppo ("Famiglia Rossi" propone "Rossi"), lato unico per tutti. Un solo salvataggio crea gruppo e persone.

### 3. Tavoli (scheda, DES-5)
Elenco di carte: nome, "7 / 8" in testo con barra di sola grafica, avviso "Oltre la capienza di 8" con icona (AC10). Tocco: sheet del tavolo con i suoi invitati, "Aggiungi persone" (elenco con checkbox e ricerca, filtrabile "Senza tavolo"; scorciatoia "Aggiungi un gruppo intero": se qualcuno è già seduto altrove chiede conferma "3 di loro sono già al tavolo 2: li sposto?"), "Rimuovi dal tavolo" per riga, modifica e elimina con Annulla. Nessun drag and drop. Capienza facoltativa, intera 1-50.
**AC11**: finché non esistono tavoli: nessun campo "Tavolo" nei moduli, nessun filtro tavolo, nessun conteggio "senza tavolo". La scheda Tavoli resta, con vuoto calmo e un solo pulsante "Crea un tavolo" ("Ti servono i tavoli? Puoi crearli quando vuoi").

### 4. Importa (AC12, DES-6)
Sheet a passi: **1 Incolla o scegli un file** (textarea "Una persona per riga" + "Carica un file CSV"; esempio di formato comprimibile; "Scarica un modello"), **2 Anteprima**: riepilogo "Pronti 38 · Da correggere 2 · Avvisi 3 (duplicati)"; righe come **carte** su mobile (non tabella), errori in testo ("Riga 7: manca il nome"), non solo colore; elenco errori in cima. **3 Conferma**: "Importa 38 invitati" (le righe con errore sono saltate e dichiarate; "Torna indietro" per correggere il testo senza perderlo). Il tipo accetta adulto/bambino/a/ragazzo; il lato accetta i nomi dei partner, "Entrambi", vuoto; altro è errore "Lato non riconosciuto: scrivi {A}, {B} o Entrambi". Dopo l'importazione: toast con **"Annulla importazione"** (≥8 s, rimuove tutti i creati). Oltre 500 righe: errore unico "Sono troppe righe: ne importo al massimo 500 alla volta".

### 5. Eliminazione, Annulla, Eliminati di recente
Stesso schema dei compiti: toast **Annulla ≥ 8 s** (persona, gruppo, tavolo), `aria-live`. "Eliminati di recente" (menu Altro): persone con "Ripristina" (stessa durata dei compiti). Eliminare un gruppo/tavolo: conferma breve che dice la conseguenza ("Le 4 persone restano, senza gruppo") e poi Annulla.

### 6. Esporta
"Esporta CSV" nel menu Altro e anche in Opzioni > Esportazione come quarto pulsante. Esporta **tutti** gli invitati (non solo i filtrati; il testo lo dice). Nome file con data.

### 7. Impostazioni nozze (Q1, BR6)
Con invitati, il campo "Invitati" è sostituito da testo: "Sei a 62 persone: fascia 50-80" con link "Vedi la lista"; con lista vuota resta modificabile. Mai un campo solo disabilitato senza spiegazione.

## Stati
| Schermata | Caricamento | Vuoto | Errore | Successo | Permesso negato |
|---|---|---|---|---|---|
| Lista Persone | skeleton righe | "Ancora nessun invitato" + "Aggiungi invitato" e "Importa" (AC1) | `ErrorState` con "Riprova" | toast "Aggiunto" | voce di menu assente; URL diretto: "Questo spazio è su invito" |
| Risultato filtri | — | "Nessun invitato con questi filtri" + "Azzera filtri" | — | conteggio annunciato | — |
| Gruppo senza persone | — | "Nessuno qui: aggiungi persone" | — | — | — |
| Tavoli | skeleton carte | "Ti servono i tavoli? Creali quando vuoi" | come sopra | toast | come sopra |
| Importa | spinner sul pulsante | "Nessuna riga riconosciuta" | righe errate per riga; file illeggibile ("Non riesco a leggere il file: salvalo come CSV UTF-8") | "38 invitati importati" + Annulla | — |
| Salvataggio | spinner | — | campo inline in italiano; conflitto: `ConflictDialog` di FEAT-2026-001 (BR9) | toast | — |
| Eliminati di recente | skeleton | "Niente di eliminato di recente" | — | "Ripristinato" | — |

## Componenti
| Bisogno | Riuso (percorso) | Nuovo? |
|---|---|---|
| Sheet/modulo, focus | `src/components/ui/sheet.tsx`, `src/features/timeline/PanelContent.tsx`, schema di `TaskSheet.tsx` | no |
| Filtri in sheet, chip | `src/features/timeline/FiltersPanel.tsx`, `use-media-query.ts` | generalizzare solo se serve a un terzo uso |
| Schede, select, radio, switch, badge, progress | `src/components/ui/*` | no |
| Vuoto, errore, conflitto | `EmptyState.tsx`, `ErrorState.tsx`, `ConflictDialog.tsx`, `src/features/budget/use-conflict.tsx` | no |
| Annulla con toast ≥ 8 s, Eliminati di recente | schema timeline (`actions.ts`, `sonner.tsx`) | no |
| Etichette campi per il conflitto | `field-labels.ts` (budget/timeline) | `guests/field-labels.ts` |
| Riga invitato, intestazione gruppo, carta tavolo, anteprima import | — | sì, specifici (`GuestRow`, `GroupHeader`, `TableCard`, `ImportPreview`) |
| Pagina in Opzioni e menu | `src/app/(app)/altro/page.tsx`, `AppNav.tsx` | no |

## Copy (tono "tu")
Titolo "Invitati"; vuoto "Ancora nessun invitato. Aggiungili uno a uno o incolla la tua lista."; "Salva e aggiungi un altro"; "Senza gruppo"; "Oltre la capienza di 8"; "Eliminato. Annulla"; Lato: "{A}", "{B}", "Entrambi", "Non indicato". Tipo: "Adulto", "Bambino". Niente "Lista", "Elenco" né "Anagrafica" come etichette (vaghe).

## Accessibilità
Bersagli ≥ 44 px, nessuna azione solo swipe. Gruppi come `h2` con `ul` di righe; riga = pulsante con nome accessibile "Mario Rossi, adulto, Famiglia Rossi, tavolo 3". Filtri: sheet con focus trap, contatore risultati in `aria-live="polite"`, chip con pulsante "Rimuovi filtro X". Ricerca con `role="search"` e etichetta. Capienza e occupazione sempre in testo; barra `aria-hidden`. Toast con `role="status"`; "Salva e aggiungi un altro" riporta il focus sul nome. Errori collegati con `aria-describedby`/`aria-invalid`. Contrasto: solo token dei 12 temi, `accent` mai su `muted`. Anteprima import: errori in testo e icona.

## Responsive
320-390: una colonna, riepilogo compatto, sheet a tutta altezza. 768+: rail laterale, lista con colonne (nome, tipo, lato, gruppo, tavolo) e dettaglio in sheet laterale; Tavoli a griglia di carte. Voci di barra: vedi sopra.

## Mockup (320 px)
```
Invitati
42 persone · 35 adulti · 7 bambini
[Per lato v]
[Cerca nome...] [Filtri (2)] [...]
(Tony x) (Senza tavolo x)
-- Famiglia Rossi · 2 ad., 1 bamb. --
 Mario Rossi         Tony
 Anna Rossi          Tony
 Luca Rossi  Bambino Tony
-- Senza gruppo --
 Sara Bianchi        Entrambi
                          [+ Aggiungi]
[Home][Percorso][Scelte][Budget][Invitati][Opzioni][Guida]
```

## Controlli visivi di accettazione (F3)
- [ ] Barra a 7 voci a 320, 360, 390 px: nessun troncamento, etichette intere, bersagli ≥ 44 px, in 3 temi chiari e scuri.
- [ ] Lista con 0, 1, 40 e 500 invitati su 320 px: nessuno scorrimento orizzontale, riepilogo leggibile.
- [ ] Filtri: stato vuoto risultati, chip, contatore "n di N".
- [ ] "Salva e aggiungi un altro" x5 di fila: campi conservati e focus sul nome.
- [ ] Nessun riferimento ai tavoli finché non ne esistono; tavolo pieno: testo "Oltre la capienza".
- [ ] Import: anteprima con errori, annulla senza salvare, "Annulla importazione".
- [ ] Elimina persona/gruppo/tavolo: Annulla ≥ 8 s; "Eliminati di recente".
- [ ] axe senza violazioni in 12 temi chiaro/scuro; tastiera completa.
