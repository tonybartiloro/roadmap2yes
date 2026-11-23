# FEAT-2026-001 — R1 Fondamenta, onboarding, timeline e budget: UX/UI design

> **BOZZA F1 (round 1)** — designer. Da completare in F2 dopo le risposte dello sviluppatore (D1–D7 in `log.md`). Riferimenti: DES-n nel log.

## 1. Principi
1. **Una cosa alla volta**: ogni schermata ha un'azione principale evidente; nulla è deciso, quindi la guida viene prima dei dati.
2. **Calma, non allarme**: ritardi e sforamenti sono comunicati con tono caldo, icona + testo, niente rosso pieno.
3. **Tutto è rivedibile**: azioni distruttive con "Annulla"; decisioni con storico.
4. **Pollice prima**: azioni primarie in basso, target ≥44 px, form in bottom sheet.
5. **Eleganza sobria, movimento minimo**: serif per i titoli, spazio bianco, animazioni brevi (150–250 ms), rispetto di `prefers-reduced-motion`.

## 2. Architettura dell'informazione e navigazione
Mobile (<768 px): barra inferiore fissa a 5 voci.

| Voce | Contenuto R1 | Crescita |
|---|---|---|
| Home | Conto alla rovescia, "Prossimo passo", pagamenti in evidenza, novità | — |
| Percorso | Timeline/checklist per fase, filtri, anteprima scenario | — |
| Scelte | Decisioni (data, location), confronto, storico | R2 fornitori, R4 abiti/testimoni |
| Budget | Riepilogo, categorie, voci, pagamenti, storico totale | — |
| Altro | Impostazioni (risposte onboarding, nomi), invito partner, esportazione, tema, aree future | R3 Invitati, R5 Tavoli, R6 Giorno live |

Da 768 px: sidebar sinistra con le stesse voci (rail icone + etichette da 1024 px); contenuto max 1120 px, griglia 12 colonne. Azione di aggiunta rapida (+) in basso a destra su Percorso e Budget; nessuna FAB globale.

## 3. Flussi principali
### 3.1 Accesso e invito (DES-1)
1. Login: campo email → "Inviami il link" → schermata "Controlla la posta" con campo codice a 6 cifre e "Invia di nuovo (tra 30 s)".
2. Utente con invito pendente → entra direttamente nello spazio invitante, mai la schermata "crea spazio". Utente senza invito e senza spazio → "Questo spazio è su invito" (nessun dato, nessuna creazione).
3. Primo partner (spazio creato dal bootstrap) → onboarding. In Altro > "Invita il partner": email → stato "In attesa" con "Revoca" e "Invia di nuovo"; scadenza visibile.
4. Errori: link scaduto/usato, email diversa dall'invito, invio non riuscito → messaggio + azione.

### 3.2 Onboarding (DES-2)
Passo 0 nomi → 1 rito → 2 data obiettivo e (facoltativo) alternative → 3 invitati (fasce) → 4 budget totale → 5 stile (+nota) → 6 regione/comune → riepilogo "Ecco il vostro percorso" → Home. Ogni passo: titolo serif, 1 domanda, "Non lo so ancora" secondario ma ben visibile, "Indietro", progresso testuale "Passo 3 di 6". Salvataggio per passo; ripresa dall'ultimo passo non completato.

### 3.3 Home e "Prossimo passo" (DES-3)
Card principale (1) + secondarie (max 2) con ordine: decisione bloccante → compiti scaduti → pagamenti ≤14 gg → compiti ≤30 gg. Sotto: conto alla rovescia (giorni e settimane; "provvisoria" se la data non è scelta), pagamenti in evidenza, "Novità dall'ultimo accesso".

### 3.4 Percorso (DES-4, 5, 6)
Sezioni: Adesso · Da recuperare (tappe in ritardo con scadenza "suggerita") · Prossimi 3 mesi · Più avanti · Fatti. Riga compito: checkbox 44 px, titolo, scadenza relativa ("tra 3 settimane"), categoria, assegnatario (iniziali + nome). Tocco → dettaglio in sheet (consiglio, note, modifica, elimina con Annulla). Anteprima scenario: banner fisso "Anteprima — nulla è salvato".

### 3.5 Scelte (DES-7, 8)
Elenco decisioni (stato: Aperta / Presa / Da rivedere). Dettaglio: domanda, opzioni come carte (campi leggeri, pro/contro con icone +/−, reazioni dei partner), "Confronta 2", "Scegli", opzioni scartate collassate, storico cronologico in sola lettura con "Aggiungi nota". Riapertura: sheet con motivo obbligatorio. Conferma di scelta con riepilogo della conseguenza ("La timeline si ricalcolerà su questa data").

### 3.6 Budget (DES-9, 10)
Riepilogo: totale (con "Modifica" + motivo opzionale e "Storico"), non assegnato, barra complessiva. Elenco categorie (una barra + un numero chiave), dettaglio categoria → voci (Previsto / Concordato / Annullata) → pagamenti (acconto/saldo/altro, scadenza, stato). Vista "Prossimi pagamenti" in ordine di scadenza. Avvisi: icona + testo caldo, ambra/terracotta.

### 3.7 Altro
Impostazioni (modifica risposte onboarding → "Suggerimenti da rivedere" in Percorso), invito partner, esportazione (JSON/CSV), tema (sistema/chiaro/scuro), informazioni.

## 4. Elenco schermate e stati
Legenda: C=caricamento, V=vuoto, E=errore, S=successo, P=permesso negato. "—" non applicabile.

| Schermata | C | V | E | S | P |
|---|---|---|---|---|---|
| Login / codice | spinner sul pulsante | — | link scaduto, invio fallito, limite email | "Controlla la posta" | "Questo spazio è su invito" |
| Invito partner | skeleton | "Nessun invito: invitate Jessica" | email non valida / già invitata | stato "In attesa" + toast | solo partner |
| Onboarding passi | — | risposta "non lo so" valida | salvataggio fallito con bozza locale | riepilogo | — |
| Home | skeleton card | "Scegliete la data" come primo passo; "Budget da definire" | card errore con "Riprova" | toast su completamento | — |
| Percorso | skeleton righe | "Nessun compito: aggiungete il primo" | riga con "Riprova" | snackbar + Annulla | — |
| Anteprima scenario | skeleton | nessuno scenario: invito ad aggiungerne uno | — | — | — |
| Scelte (elenco/dettaglio) | skeleton carte | "Nessuna opzione: aggiungete la prima" | errore inline | momento "Data scelta" sobrio | — |
| Riapertura | — | — | motivo mancante (errore inline) | toast | — |
| Budget riepilogo/categoria | skeleton barre | "Budget da definire" + CTA | errore importo inline, conflitto | toast salvato | — |
| Pagamenti | skeleton | "Nessun pagamento in programma" | errore salvataggio | toast | — |
| Esportazione | barra di avanzamento | — | "Non riesco a preparare il file" | download avviato | — |
| Globali | — | — | Offline (banner), DB in pausa (pagina dedicata), conflitto BR9 (dialog) | — | sessione scaduta → login |

## 5. Direzione visiva (da scegliere: D7)
**A — "Giardino" (consigliata).** Avorio caldo, verde salvia/oliva profondo, oro antico come dettaglio. Serif **Fraunces** (titoli, ≥24 px, variabile, caldo) + sans **Figtree** (corpo/UI). Atmosfera botanica, sobria, senza tempo; tema scuro "notte nel giardino".
**B — "Sera".** Inchiostro blu notte su carta rosata, accento terracotta. Serif **Instrument Serif** + sans **Manrope**. Più editoriale e contemporanea, meno "classico".
Raccomandazione: A, perché resta elegante a tutte le dimensioni e il verde evita la lettura "allarme" nei contatori budget.
Font self-hosted via `next/font` (gratuito, nessuna richiesta a terzi), max 2 famiglie e 3 pesi totali.

### 5.1 Token colore (direzione A) — rapporti calcolati WCAG
| Token (shadcn) | Chiaro | Scuro | Note |
|---|---|---|---|
| `--background` | #FBF7F0 | #171611 | |
| `--foreground` | #2B2A26 | #F2EDE2 | 13,45:1 / 15,52:1 |
| `--card` | #FFFFFF | #1F1E17 | |
| `--muted` | #F1EBDF | #2A281F | |
| `--muted-foreground` | #6B665B | #B3AC9C | 5,35:1 su bg (4,81:1 su muted) / 8,02:1 |
| `--primary` | #43573F | #A9C3A5 | 7,35:1 / 9,52:1 su bg |
| `--primary-foreground` | #FBF7F0 | #1A2418 | 7,35:1 / 8,43:1 |
| `--accent-gold` (testo) | #7A5C1E | #D9B96A | 5,82:1 / 9,57:1 |
| `--accent-gold` (solo decorativo) | #B08A3E | — | 3,0:1, mai per testo |
| `--border` | #E4DCCB | #35322A | decorativo |
| `--input` (bordo campi) | #8C8574 | #7C7767 | 3,44:1 / 4,05:1 (componenti UI ≥3:1) |
| `--ring` | #43573F | #A9C3A5 | focus 2 px + offset 2 px |
| `--success` | #2F6B4F | #8FD1AE | 5,89:1 / 10,26:1 |
| `--warning` (testo su #FFF1D0) | #7A4A00 | #F2C46D | 6,68:1 / 11,12:1 |
| `--destructive` | #A23B3B | #F0A3A3 | 6,10:1 / 9,03:1; usato solo per eliminazioni, non per i ritardi |

Valori da riverificare in F3 sul rendering reale. Raggio: 12 px (carte), 10 px (campi), 999 px (chip).

### 5.2 Tipografia
Titoli serif 28/34 (h1), 22/28 (h2), 600; corpo sans 16/24 (minimo 16 px su input); numeri tabellari (`tabular-nums`) per importi; importi sempre con `€` e formato italiano.

### 5.3 Movimento
Transizioni 150–250 ms ease-out; sheet con slide-up; checkbox con micro-animazione di spunta; un solo momento "festa" per decisione presa (animazione sobria ≤1 s, nessuna confetti ripetuta); con `prefers-reduced-motion` tutto diventa dissolvenza o statico. Mai animazioni infinite.

## 6. Componenti (approccio shadcn/ui)
Greenfield: nessun componente esistente da riusare; i percorsi saranno `components/ui/*` (shadcn, copiati nel repo).

| Esigenza | Base shadcn/ui | Nuovo? |
|---|---|---|
| Pulsanti, campi, label, select, checkbox, switch, tabs | Button, Input, Label, Select, Checkbox, Switch, Tabs | no (tema A) |
| Sheet di dettaglio/form su mobile | Drawer (vaul) / Sheet | no |
| Dialog di conferma e conflitto | AlertDialog / Dialog | no |
| Toast con Annulla | Sonner | no |
| Date | input nativo `type=date` su mobile; Calendar (react-day-picker, locale it) su desktop | wrapper `DateField` (selezione data/periodo) |
| Importi | Input | **MoneyInput** (formato it-IT, `inputmode=decimal`) |
| Barra di avanzamento con testo | Progress | **BudgetBar** (barra + equivalente testuale) |
| Conto alla rovescia | — | **Countdown** (per giorno, `aria` statico) |
| Carta opzione di decisione, storico | Card | **OptionCard**, **HistoryList** |
| Navigazione | — | **AppNav** (barra inferiore / sidebar) |
| Stati vuoti/errore/offline | — | **EmptyState**, **ErrorState**, **OfflineBanner** |
| Banner anteprima scenario | Alert | **ScenarioPreviewBanner** |

## 7. Copy (linee guida e campioni)
Tono: caldo, sobrio, incoraggiante; "voi" per la coppia, nomi propri per le attribuzioni; frasi brevi; niente emoji nei testi di sistema; mai colpevolizzare.
| Dove | Testo |
|---|---|
| Home, senza data | "Il primo passo: scegliere la data" |
| Conto alla rovescia provvisorio | "Se fosse il 3 settembre 2027: mancano 284 giorni" |
| Tappa in ritardo | "Di solito si fa prima, ma c'è ancora tempo: ecco come recuperare" |
| Stato vuoto compiti | "Ancora nessun compito. Aggiungete il primo." |
| Stato vuoto budget | "Budget da definire. Partite da una cifra indicativa: si potrà cambiare." |
| Riapertura | "Perché volete riaprire questa scelta?" (obbligatorio) |
| Conflitto | "Jessica ha modificato questo elemento 2 minuti fa." |
| Sforamento | "Siete oltre di € 1.200 su Catering." |
| Errore importo | "Inserite un importo in euro, ad esempio 1.500,00." |
| Offline | "Siete offline. Le modifiche non sono ancora salvate." |
| Avviso tappe burocratiche | "Indicativo: verificate sempre con il comune o la parrocchia." |
| Invito su richiesta | "Questo spazio è su invito. Chiedete a chi ve l'ha condiviso di mandarvi un invito." |
Vocabolario fisso: Previsto, Concordato, Pagato, Ancora da pagare, Assegnato; Scelte (decisioni), Percorso (timeline), Scenario (data/periodo candidato).

## 8. Accessibilità (WCAG 2.2 AA, DES-12)
- Tastiera: tutto operabile; ordine logico; focus visibile (anello 2 px + offset, ≥3:1); sheet/dialog con focus trap e ritorno del focus; scorciatoie mai esclusive.
- Focus non oscurato: `scroll-padding-bottom` ≥ altezza di barra di navigazione e barre d'azione sticky.
- Target ≥44×44 px per azioni primarie (minimo 24 px WCAG); spaziatura tra target.
- Etichette sempre visibili sui campi; errori inline collegati con `aria-describedby`, riepilogo errori all'invio; nessun placeholder come etichetta.
- Stati non solo cromatici (icona + testo); barre con testo equivalente; il conto alla rovescia non è una live region.
- Toast in `aria-live="polite"`; Annulla raggiungibile da tastiera e con durata ≥8 s.
- Nessuna azione solo-trascinamento; niente slider per importi.
- Dati non da reinserire (bozze locali); autenticazione senza test cognitivi (codice copiabile).
- `lang="it"`, zoom al 200% senza scroll orizzontale, testo ridimensionabile, `prefers-reduced-motion`, `prefers-color-scheme`.

## 9. Comportamento responsivo
- 360–430 px: riferimento (barra inferiore, sheet a pieno schermo parziale, carte impilate).
- 768 px: sidebar rail, due colonne in Home e Budget, confronto opzioni affiancato.
- 1024 px+: sidebar estesa, pannello dettaglio a destra su Percorso e Scelte.
- Orientamento landscape su telefono: nessuna barra fissa oltre la navigazione; `env(safe-area-inset-*)`.

## 10. Mockup (ASCII, 360 px)
```
Home                                  Percorso
+--------------------------------+    +--------------------------------+
|  Buongiorno, Tony e Jessica    |    | Percorso      [Filtri] [Miei v]|
|  Se fosse il 3 set 2027        |    | ANTEPRIMA: 3 set 2027 - nulla  |
|  mancano 284 giorni (40 sett.) |    |   e' salvato  [Esci][Scegli]   |
|  provvisoria                   |    | Adesso                         |
| +----------------------------+ |    | [ ] Scegliere la data   (T)    |
| | PROSSIMO PASSO             | |    | [ ] Fissare il budget   (J)    |
| | Scegliete la data          | |    | Da recuperare (suggerita)      |
| | [ Confrontate le date ]    | |    | [ ] Prenotare location         |
| +----------------------------+ |    | Prossimi 3 mesi  v             |
| Pagamenti in evidenza (0)      |    | Fatti (2)  >                   |
| Novita': Jessica ha ...        |    |                          ( + ) |
+--------------------------------+    +--------------------------------+
|Home|Percorso|Scelte|Budget|Altro |    |Home|Percorso|Scelte|Budget|Altro |
+--------------------------------+    +--------------------------------+
```

## 11. Controlli di accettazione visiva (F3) — bozza
- [ ] Tutte le schermate a 360, 390, 768 e 1280 px: nessun scroll orizzontale, nessun contenuto coperto dalla barra fissa.
- [ ] Tema chiaro e scuro: contrasti dei token verificati (testo ≥4,5:1, componenti ≥3:1) su rendering reale.
- [ ] Tastiera: percorso completo login → onboarding → completare un compito → scegliere e riaprire una decisione → registrare un pagamento.
- [ ] Focus visibile e non oscurato su ogni campo in bottom sheet con tastiera mobile aperta.
- [ ] Ogni stato della tabella §4 raggiungibile e verificato (vuoto, caricamento, errore, offline, conflitto, permesso negato).
- [ ] Avvisi budget e ritardi comprensibili in scala di grigi (icona + testo).
- [ ] `prefers-reduced-motion` e zoom 200% rispettati.
- [ ] Copy in italiano coerente col vocabolario fisso (§7); nessun termine "impegnato" nell'interfaccia.
- [ ] LCP Home su 4G simulato < 3 s con i font self-hosted.

## 12. Aperti per F2
D1–D7 del log; layout dettagliato del confronto opzioni; contenuti dei suggerimenti per stile; icone (Lucide, già in shadcn).
