# FEAT-2026-003 — Invitati: UX/UI design

> **FINALE per il Gate B** — designer, 2026-11-25 (F2). Basato sul brief approvato (23 AC, BR1-BR10, decisioni 1-10), su `plan.md` e su ADR-0002. Riusa il design system di FEAT-2026-001 (mobile-first, shadcn/ui, 12 temi, "tu"). Non ripete il brief: AC/BR per numero. Obiezioni F2 in `reviews/f2-designer.md`.

## 1. Navigazione e Guida (AC23, decisione 1)
- **Barra a 6 voci** (320 px: 53 px a cella, come oggi): Home, Percorso, Scelte, Budget, **Invitati** (icona persone), Opzioni. Nessuna riduzione di etichette. Da 768 px rail laterale con le stesse 6 voci. La voce è assente senza permesso `guests`; `/invitati` senza permesso = pannello "Questo spazio è su invito" in pagina (P5).
- **Guida** esce dalla barra: carta in cima a Opzioni (icona libro, titolo "Guida", testo "Come si usa roadmap2yes, passo passo"), prima delle altre voci e visivamente distinta (bordo `primary`, non solo posizione). Su `/guida/**` la voce attiva della barra è **Opzioni**.
- **Link di aiuto** (`HelpLink`) nell'intestazione di ogni sezione: a destra del titolo, icona punto interrogativo + testo **"Aiuto"** (testo visibile da 360 px; sotto, solo icona con `aria-label="Aiuto su {sezione}"`, bersaglio 44 px). Apre la pagina della Guida di quella sezione. Nelle sottopagine di Opzioni senza pagina propria il link non c'è (niente link generici alla home della Guida).

## 2. Schermate e flussi
Route `/invitati`, due schede (`Tabs`): **Persone** (predefinita) e **Tavoli**. I gruppi si gestiscono in Persone (menu dell'intestazione di gruppo). Titolo del documento "Invitati · roadmap2yes".

### 2.1 Persone (320-390 px)
Dall'alto: titolo + "Aiuto"; **riepilogo** su una riga "42 persone · 30 adulti · 8 bambini · 4 neonati"; "Per lato" comprimibile (A, B, Entrambi, Non indicato, ognuno con gli stessi quattro numeri); barra strumenti: ricerca per nome, **Filtri (n)** (sheet), menu "Altro" (Seleziona, Importa, Esporta CSV, Eliminati di recente); sotto, chip dei filtri attivi, ciascuno con "Rimuovi filtro". Con filtri: "12 di 42 persone" (i numeri per lato restano sul totale, AC8). Con tavoli: se qualche tavolo è oltre capienza il riepilogo aggiunge la riga "1 tavolo oltre la capienza" (AC16). Pulsante "+ Aggiungi" fisso in basso a destra sopra la barra (come Percorso/Budget); da qui scelta tra "Una persona" e "Una famiglia".
**Lista per gruppi**: sezioni `h2` "Famiglia Rossi · 2 adulti, 1 bambino" (menu: Aggiungi persona, Rinomina, Elimina gruppo), poi "Senza gruppo". Riga: nome e cognome, tipo in testo se non adulto ("Bambino", "Neonato"), lato in testo, tavolo se esistono tavoli. Con ricerca o filtri la lista è piatta e alfabetica con il gruppo come etichetta nella riga. **Oltre 100 righe** (AC5, AC12): i gruppi sono chiusi con contatore; una sezione o lista piatta con più di 100 righe ne mostra 100 alla volta con "Mostra altre 100 (ne restano 740)": mai troncamenti silenziosi, i conteggi sono sempre sul totale.
**Selezione multipla** (AC7): "Seleziona" nel menu; checkbox 44 px; "Seleziona tutti i {n} filtrati"; barra azioni in basso "{n} selezionati": Assegna a gruppo, Assegna a tavolo (solo con tavoli), Elimina, Fine. Dopo l'azione, toast con Annulla.

### 2.2 Aggiunta veloce (AC2-AC5)
Sheet "Nuovo invitato": nome, cognome, **tipo** (tre segmenti "Adulto / Bambino / Neonato" con sotto "Neonato: 0-2 anni, conta nel totale ma non occupa un posto"), lato, gruppo (select con "Nuovo gruppo…" che apre un campo inline), tavolo (solo con tavoli; per un neonato il suggerimento "I neonati non occupano posto"), "Altri dati" comprimibile (telefono `type=tel`, email `type=email`, note con contatore). Pulsanti: **Salva** e **Salva e aggiungi un altro** (tiene tipo, lato, gruppo, tavolo; svuota nome, cognome e altri dati; focus sul nome; annuncio "Mario Rossi aggiunto"). Duplicato (BR4): avviso inline sotto il nome "Hai già un Mario Rossi", non blocca. "Aggiungi persona" dal gruppo precompila il gruppo.
**Nuova famiglia**: nome del gruppo, lato unico, righe (nome, cognome, tipo) con "Aggiungi un'altra riga"; il cognome della riga propone quello ricavato da "Famiglia Rossi". Un solo salvataggio; errori per riga inline.
Modifica: stesso sheet con "Elimina" in fondo (rosso moderato + icona). Conflitto: `ConflictDialog` (AC6).

### 2.3 Eliminati di recente (AC10, AC11)
Dal menu: pagina/sheet con tre sezioni (Persone, Gruppi, Tavoli; le vuote sono nascoste), ogni riga "Ripristina" e "Elimina definitivamente"; in testa "Svuota" (per sezione e totale). Nessuna scadenza: il testo lo dice ("Restano qui finché non li elimini definitivamente"). Conferma `AlertDialog` con il numero ("Elimini definitivamente 3 persone? Non si può annullare. Spariscono anche dalle esportazioni."), pulsante distruttivo, focus sul pulsante "Annulla" del dialogo. Un gruppo eliminato dice quanti membri ha ("4 persone, rientrano se lo ripristini").

### 2.4 Tavoli (AC14-AC16)
Elenco di carte: nome, "7 / 8 posti" in testo (barra `aria-hidden`), "Oltre la capienza di 8" con icona; "Neonati: 1 (non occupano posto)" quando serve. Tocco: sheet del tavolo con i suoi invitati, "Aggiungi persone" (checkbox, ricerca, filtro "Senza tavolo"), **"Aggiungi un gruppo intero"** (se qualcuno è già seduto altrove: dialogo "3 di loro sono già al tavolo Rossi: li sposto qui?" con "Sposta" / "Lascia dove sono"), "Rimuovi dal tavolo" per riga, modifica (nome, capienza 1-50 facoltativa), elimina con Annulla. Nessun drag and drop; forma e posizione del modello non compaiono (R-06).
**Nessun tavolo** (AC16): scheda Tavoli con vuoto calmo "Ti servono i tavoli? Creali quando vuoi." + "Crea tavolo"; campo tavolo, filtro, "Assegna a tavolo" e conteggi tavoli assenti ovunque.

### 2.5 Importa (AC17-AC20)
Sheet a passi (indicatore testuale "Passo 2 di 3", focus sul titolo a ogni passo):
1. **Incolla o scegli un file**: textarea "Una persona per riga", "Scegli un file CSV", "Scarica un modello", formato in un riquadro comprimibile ("Colonne: nome, cognome, tipo, lato, gruppo, telefono, email, note. Separatore virgola o punto e virgola."). Il file resta nel browser (testo di una riga).
2. **Anteprima a carte**: in testa "Pronte 38 · Da correggere 2 · Avvisi 3"; prima le righe con errore ("Riga 7: manca il nome", "Riga 12: lato non riconosciuto, scrivi {A}, {B} o Entrambi", "Riga 15: email non valida"), poi gli avvisi ("Riga 4: c'è già un Mario Rossi"), poi le valide (100 alla volta); gruppi nuovi elencati ("Creo 3 gruppi: Famiglia Rossi…"). Errori in testo e icona, mai solo colore. "Torna indietro" conserva il testo.
3. **Conferma**: "Importa 38 invitati" (dice che le 2 righe da correggere vengono saltate); a fine importazione l'elenco delle saltate resta leggibile con "Copia le righe saltate" per correggerle e riprovare.
Dopo l'importazione: toast "38 invitati importati" con **"Annulla importazione"** (≥ 8 s). Oltre 500 righe: errore unico "Sono più di 500 righe: importane al massimo 500 alla volta". File non leggibile: "Non riesco a leggere il file. Salvalo come CSV (UTF-8) e riprova."

### 2.6 Eliminazione e Annulla
Persona, gruppo, tavolo, azione di massa: toast `role="status"` con **"Annulla" ≥ 8 s** (resta mentre il mouse o il focus ci sono sopra). Eliminare un gruppo o tavolo apre prima una conferma breve con la conseguenza ("Le 4 persone restano, senza gruppo"), poi il toast.

### 2.7 Esporta, Impostazioni, Percorso
- "Esporta CSV": nel menu Altro e in Opzioni > Esportazione (quarto pulsante). Testo sempre visibile: "Esporta tutti i {N} invitati, anche se hai dei filtri attivi." Nome file con data.
- Impostazioni nozze (BR6): con invitati "Sei a 62 persone: fascia 50-80." + link "Vedi la lista"; con lista vuota il campo resta modificabile.
- Percorso: nel dettaglio dei compiti "lista invitati preliminare" e "raccogli conferme" il link "Vai a Invitati".

## 3. Stati
| Schermata | Caricamento | Vuoto | Errore | Successo | Permesso negato |
|---|---|---|---|---|---|
| Lista Persone | skeleton righe (`loading.tsx`) | "Ancora nessun invitato. Aggiungili uno a uno o incolla la tua lista." + "Aggiungi invitato" e "Importa" (AC1) | `ErrorState` "Non riesco a caricare gli invitati" + "Riprova" (anche schema non ancora migrato) | toast "Aggiunto" | voce assente; URL diretto: pannello "su invito" |
| Risultato filtri | — | "Nessun invitato con questi filtri" + "Azzera filtri" | — | conteggio annunciato (`aria-live`) | — |
| Gruppo | — | "Nessuno qui: aggiungi persone" | — | toast | — |
| Selezione multipla | spinner sul pulsante azione | 0 selezionati: azioni disattivate con testo | "Non sono riuscito a cambiarli tutti" + Riprova | toast + Annulla | — |
| Modulo invitato/famiglia | spinner sul pulsante | — | campo inline in italiano; conflitto: dialogo; salvataggio fallito con bozza conservata | toast o "aggiunto" annunciato | — |
| Tavoli | skeleton carte | "Ti servono i tavoli? Creali quando vuoi." + "Crea tavolo" | `ErrorState` | toast; "Oltre la capienza di N" | come Persone |
| Sheet tavolo | skeleton | "Nessuno qui: aggiungi persone" | errore inline | toast | — |
| Eliminati di recente | skeleton | "Niente di eliminato di recente" | `ErrorState` | "Ripristinato" / "Eliminato per sempre" | come Persone |
| Importa | spinner sul pulsante | "Non ho riconosciuto nessuna riga" | errori per riga; file illeggibile; più di 500 righe; salvataggio fallito: "Non ho importato nulla" + Riprova | "38 invitati importati" + Annulla importazione | come Persone |
| Impostazioni (fascia) | — | lista vuota: campo modificabile | tabella assente = lista vuota senza errore | — | — |
| Esportazione CSV | barra di avanzamento | "Nessun invitato da esportare" (pulsante disattivato con testo) | "Non riesco a preparare il file" | download avviato | — |
| Globali | offline, servizio in pausa, conflitto, sessione scaduta: come FEAT-2026-001 §4 | | | | |

## 4. Componenti
| Bisogno | Riuso (percorso) | Nuovo? |
|---|---|---|
| Sheet e modulo | `src/components/ui/sheet.tsx`, `src/features/timeline/PanelContent.tsx`, schema di `TaskSheet.tsx` | no |
| Filtri in sheet e chip | `src/features/timeline/FiltersPanel.tsx`, `use-media-query.ts` | no (generalizzare solo se serve a un terzo uso) |
| Schede, select, radio, switch, badge, progress, alert-dialog | `src/components/ui/*` | no |
| Vuoto, errore, conflitto | `EmptyState.tsx`, `ErrorState.tsx`, `ConflictDialog.tsx`, `budget/use-conflict.tsx` | no |
| Annulla ≥ 8 s, Eliminati di recente | `timeline/actions.ts`, `Notices.tsx`, `ui/sonner.tsx` | no |
| Aiuto nelle intestazioni | — | `HelpLink.tsx` (piano T3) |
| Riga, gruppo, selezione, tavolo, anteprima | — | `GuestRow`, `GroupHeader`, `SelectionBar`, `TableCard`, `ImportPreview` (specifici) |

## 5. Copy (tono "tu", etichette non vaghe)
Titolo "Invitati"; tipi "Adulto", "Bambino", "Neonato (0-2 anni)"; lato "{A}", "{B}", "Entrambi", "Non indicato"; "Senza gruppo", "Senza tavolo"; "Salva e aggiungi un altro"; "Nuova famiglia"; "Oltre la capienza di 8"; "Annulla importazione"; "Elimina definitivamente"; "Svuota". Mai "Anagrafica", "Elenco", "Gestione" come etichette. Toast brevi, in prima persona quando c'è un errore ("Non sono riuscito a…").

## 6. Accessibilità
Bersagli ≥ 44 px, nessuna azione solo swipe. Gruppi `h2` con `ul`; riga = pulsante con nome "Mario Rossi, adulto, Famiglia Rossi, tavolo 3". Filtri: sheet con focus trap, contatore in `aria-live="polite"`, chip con "Rimuovi filtro X". Ricerca in `role="search"` con etichetta. Occupazione e capienza sempre in testo; barre `aria-hidden`. Toast `role="status"`, Annulla raggiungibile da tastiera e non scade sotto focus. Dialoghi distruttivi: focus iniziale su "Annulla". Selezione: checkbox con nome "Seleziona Mario Rossi", conteggio "n selezionati" annunciato. Tipo: radio a segmenti nativi con descrizione. Errori `aria-invalid` + `aria-describedby`; al salvataggio fallito il focus va al primo campo errato. Import: passi annunciati, errori in testo e icona. Contrasto: solo token dei temi, `accent` mai su `muted`. `prefers-reduced-motion` rispettato.

## 7. Responsive
320-390: una colonna, sheet a tutta altezza, barra a 6 voci. 768+: rail laterale; lista a colonne (nome, tipo, lato, gruppo, tavolo) con dettaglio in sheet laterale; Tavoli a griglia di carte; anteprima import in due colonne. Riepilogo e barra strumenti restano su una o due righe senza scorrimento orizzontale.

## 8. Mockup (320 px)
```
Invitati                        (?) Aiuto
42 persone · 30 ad. · 8 bamb. · 4 neon.
[Per lato v]
[Cerca nome...]  [Filtri (2)] [...]
(Tony x) (Senza tavolo x)
-- Famiglia Rossi · 2 ad., 1 bamb. -- [...]
 Mario Rossi              Tony
 Luca Rossi    Bambino    Tony
-- Senza gruppo --
 Sara Bianchi             Entrambi
 [Mostra altre 100 (ne restano 740)]
                            [+ Aggiungi]
[Home][Percorso][Scelte][Budget][Invitati][Opzioni]
```

## 9. Controlli visivi di accettazione (F3)
- [ ] Barra: 6 voci a 320, 360, 390 px e rail da 768; nessun troncamento; Invitati attiva su `/invitati`, Opzioni attiva su `/guida`; Invitati assente per un utente senza permesso.
- [ ] Opzioni: carta Guida in cima e ben visibile; "Aiuto" nelle intestazioni di Home, Percorso, Scelte, Budget, Invitati e Opzioni, con la pagina giusta della Guida.
- [ ] Lista a 320 px con 0, 1, 40 e 500+ invitati: nessuno scorrimento orizzontale; gruppi chiusi oltre 100; "Mostra altre"; conteggi sul totale.
- [ ] Riepilogo con neonati e per lato; "12 di 42" con filtri; chip rimovibili; vuoto filtri con "Azzera filtri".
- [ ] "Salva e aggiungi un altro" cinque volte: campi tenuti, focus sul nome, annuncio.
- [ ] Nuova famiglia, "Nuovo gruppo…", "Aggiungi persona" dal gruppo; avviso duplicato non bloccante.
- [ ] Selezione multipla: assegna gruppo/tavolo/elimina con Annulla; "Seleziona tutti i filtrati".
- [ ] Nessuna traccia di tavoli (campo, filtro, azione, conteggio) senza tavoli; con tavoli: "n / capienza posti", "Oltre la capienza di N" in testo, neonati senza posto, gruppo intero con conferma.
- [ ] Eliminazione di persona, gruppo e tavolo: Annulla ≥ 8 s; ripristino anche da "Eliminati di recente"; "Elimina definitivamente" e "Svuota" con conferma e numero.
- [ ] Import: anteprima a carte con errori/avvisi/gruppi nuovi, "Torna indietro", saltate elencate, "Annulla importazione", errore oltre 500, file illeggibile.
- [ ] Esporta CSV in Invitati e in Opzioni, testo "tutti gli invitati".
- [ ] Impostazioni: "Sei a N persone: fascia X" con link.
- [ ] 12 temi chiaro/scuro su `/invitati` (contrasto, chip, badge, carte); axe; tastiera e focus in tutti gli sheet e dialoghi.
