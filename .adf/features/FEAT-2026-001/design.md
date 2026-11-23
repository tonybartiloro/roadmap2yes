# FEAT-2026-001 — R1 Fondamenta, onboarding, Percorso e budget: UX/UI design

> **FINALE per il Gate B** — designer, 2026-11-23 (F2). Basato sul brief approvato al Gate A (52 AC attivi, data di nascita rimossa da D26, scenario di riferimento D28) e sul piano dell'architetto. Obiezioni del round 1 in `log.md` ("F2 round 1 — designer objections"). Il catalogo dei 12 temi resta aperto: lo sviluppatore sceglie al Gate B quali approvare (P8).
> Nome dell'app nei testi: **roadmap2yes** (provvisorio, costante `APP_NAME`; vedi domanda Q2 nel log).

## 1. Principi
1. **Una cosa alla volta**: ogni schermata ha un'azione principale evidente; nulla è deciso, quindi la guida viene prima dei dati.
2. **Calma, non allarme** (tono informale, da amici): ritardi e sforamenti con tono caldo, icona + testo, niente rosso pieno.
3. **Tutto è rivedibile**: azioni distruttive con "Annulla"; decisioni con storico; nulla cambia in silenzio (ogni ricalcolo dice perché).
4. **Pollice prima**: azioni primarie in basso, target ≥44 px, form in bottom sheet.
5. **Eleganza sobria, movimento minimo**: serif per i titoli, spazio bianco, animazioni brevi (150–250 ms), `prefers-reduced-motion` rispettato.

## 2. Architettura dell'informazione e navigazione
Mobile (<768 px): barra inferiore fissa a 5 voci.

| Voce | Contenuto R1 | Crescita |
|---|---|---|
| Home | Conto alla rovescia, "Prossimo passo", pagamenti in evidenza, novità | — |
| Percorso | Timeline/checklist per fase, filtri, scenario di riferimento e anteprima | — |
| Scelte | Decisioni (data con scenari e riferimento, location), confronto, storico | R2 fornitori, R4 abiti/testimoni |
| Budget | Riepilogo, categorie, voci, pagamenti, storico totale | — |
| Altro | Profili (tuo e del partner), Impostazioni nozze (risposte onboarding), Invito partner, Aspetto (tema, chiaro/scuro), Promemoria email, Esportazione, Info | R3 Invitati, R5 Tavoli, R6 Giorno live |

Da 768 px: sidebar sinistra con le stesse voci (rail icone + etichette da 1024 px); contenuto max 1120 px, griglia 12 colonne. Azione di aggiunta rapida (+) in basso a destra su Percorso e Budget; nessuna FAB globale. Link "Vai al contenuto" come primo elemento focalizzabile. Titolo del documento diverso per ogni schermata ("Percorso · roadmap2yes").

## 3. Flussi principali

### 3.1 Accesso e invito (DES-1)
1. **Login** (`/accesso`): campo email (`autocomplete="email"`, `inputmode="email"`) → "Mandami il link" → schermata "Controlla la posta" con campo codice a 6 cifre (`autocomplete="one-time-code"`, `inputmode="numeric"`, incollabile, nessun test cognitivo) e "Rimanda il link (tra 30 s)" con conto alla rovescia testuale. Il messaggio è **identico** per email note e sconosciute (AC2): "Se questo indirizzo può entrare, ti abbiamo mandato un link e un codice."
2. **Link dall'email** (`/auth/conferma`): pagina con il pulsante "Entra" (il token si consuma solo al clic, AC8). Funziona in un browser diverso da quello della richiesta. Errore: "Il link è scaduto o è già stato usato. Chiedine uno nuovo" + pulsante "Torna al login".
3. **Dopo l'accesso** (server, nell'ordine): ha uno spazio → home (o ripresa onboarding); ha un invito pendente → entra nello spazio invitante, mai "crea spazio" (BR13); è il primo partner autorizzato → onboarding; altrimenti "Questo spazio è su invito".
4. **Invito** (`/invito/[token]`, pagina pubblica che mostra solo il nome di chi ha invitato): stati e azioni in §7.2.
5. **Altro > Invito partner**: stato (In attesa / Accettato / Scaduto / Revocato), data di scadenza, "Copia link" (per WhatsApp e simili), "Invia di nuovo", "Revoca" (con conferma). Se l'invito non è mai partito (passo saltato): modulo "Invita {nome}" con email precompilata.

### 3.2 Onboarding (DES-2, 8 passi, nessuna data di nascita)
Un solo partner (chi entra per primo) compila per entrambi; l'altro riceve l'invito, entra e può correggere tutto da Altro. Una domanda per schermata; indicatore testuale "Passo 3 di 8" più barra (`role="progressbar"` con `aria-valuenow`, il testo è la fonte primaria); salvataggio a ogni conferma; ripresa dall'ultimo passo non completato ("Bentornato, riprendiamo dal passo 4 di 8"); "Indietro" sempre disponibile; ogni passo valido anche con "Non lo so ancora" (tranne nome ed email di chi compila, AC13). Al cambio passo il focus va al titolo (`h1`, `tabindex=-1`) e il numero di passo è annunciato.

| # | Passo | Contenuto |
|---|---|---|
| 1 | **Tu** | Etichetta (Sposo / Sposa / Altro: scrivi tu / nessuna), nome, cognome. L'email è quella del login, mostrata e non modificabile. |
| 2 | **Il tuo partner** | Stessa scheda con **email**. Sotto: "Gli mandiamo un invito per entrare con te" con interruttore "Invia l'invito alla fine" (attivo; si può rimandare e fare da Altro). Email uguale alla tua o non valida: errore inline. "Non lo so ancora" valido: l'invito si fa dopo. |
| 3 | **Rito** | Civile / Religioso cattolico con effetti civili / Simbolico / Non lo so ancora. Nota: "Cambia le tappe che ti proponiamo." |
| 4 | **Data (scenari)** | Lista di scenari (vedi §3.8), ognuno **data fissa** o **periodo** (da mese/anno a mese/anno), etichetta facoltativa; il primo precompilato 3 settembre 2027; "Aggiungi un altro scenario"; si può restare senza. Avviso non bloccante per date prima del 3/9/2027. |
| 5 | **Invitati** | Fasce: fino a 50 · 50–80 · 80–120 · oltre · non lo so (radio a carte). |
| 6 | **Budget** | Totale in euro (MoneyInput), facoltativo. |
| 7 | **Stile e luogo** | Etichetta di stile (chip a scelta singola: Classico, Rustico, Boho, Moderno, Intimo, Festa grande, Destination, Altro) + nota libera; regione (select delle 20 regioni) e comune (testo). Lo stile in R1 non cambia il Percorso: alla fine compare una frase di consiglio statica per etichetta (D18, contenuti in `content/style-tips.ts`). |
| 8 | **Tema** | Galleria con anteprima dal vivo (§5.4). Predefinito Giardino. |

**Decisione F2**: il passo Tema resta l'**ultimo** (l'ordine è fissato da AC12); l'onboarding parte già "vestito" con Giardino. Riepilogo finale "Ecco il tuo percorso": N tappe preparate, data di riferimento (provvisoria/definitiva/da decidere), stato dell'invito, pulsante "Vai alla home". Se l'onboarding si chiude con risposte parziali la home propone il passo successivo (AC15).

### 3.3 Home e "Prossimo passo" (DES-3)
Ordine dall'alto: saluto → conto alla rovescia → "Prossimo passo" (1 principale + max 2 secondarie, regole AC27: decisione bloccante → compiti scaduti → pagamenti ≤14 gg → compiti ≤30 gg) → pagamenti in evidenza → "Novità dall'ultimo accesso" → "ultimo export: N giorni fa" (promemoria dopo 30 gg).
- Mostra solo ciò che riguarda **te** più ciò che è di Entrambi, con interruttore "Mostra anche i compiti di {partner}" (preferenza locale).
- **Conto alla rovescia** (giorni e settimane, per giorno, fuso Europe/Rome): data definitiva "Mancano 284 giorni (40 settimane)" con badge "definitiva"; data di riferimento provvisoria "Se fosse il 3 settembre 2027: mancano 284 giorni" con badge "provvisoria" e link "Cambia riferimento" a Scelte > Data; nessun riferimento "Data da decidere" + azione "Scegli la data".
- **Prima visita del secondo partner** (previous_seen_at nullo): al posto di "Novità" compare la carta **"Ciao {nome}, ti stavamo aspettando"**: "{Partner} ha già preparato un po' di cose. Dai un'occhiata e correggi quello che non ti torna." con due azioni: "Guarda il Percorso" e "Controlla i tuoi dati" (Altro > Profili). Si chiude con "Ho capito" (salvata in `user_wedding_state`, fallback `localStorage`).

### 3.4 Percorso (DES-4, 5, 6) — gruppi e soglie (risolve P7)
Testata: titolo, riga di stato del riferimento (§3.8: "Scadenze calcolate sul 3 set 2027 · provvisorio"), selettore scenario, "Filtri" con contatore, scorciatoia "Miei / di {partner} / Tutti".
**Soglie** (giorni di calendario rispetto a oggi in Europe/Rome; scadenza = data senza orario, "scaduto" significa `due < oggi`):

| Gruppo | Regola | Note |
|---|---|---|
| **Adesso** | (a) fino a 3 tappe **in evidenza** (location/data, budget, lista invitati preliminare) non completate e scadute, **più** (b) tutti i compiti non completati con scadenza da oggi a +30 giorni, **più** (c) le tappe in evidenza senza scadenza (data non scelta) | Mostra le prime 5 righe + "Mostra tutte (N)". Ordine: scadenza, poi priorità del modello. |
| **Da recuperare** | Tutti gli altri compiti non completati con scadenza passata (compresi quelli aggiunti da te), per priorità del modello, con la loro scadenza calcolata | Mai nascosti, mai compressi (D15). Tono neutro: icona orologio + "di solito si fa prima, ma hai ancora tempo". Sezione aperta di default solo se non è lunga più di 5 righe, altrimenti collassata con contatore. |
| **Prossimi 3 mesi** | Non completati con scadenza tra +31 e +90 giorni | Collassabile. |
| **Più avanti** | Non completati con scadenza oltre +90 giorni **oppure senza scadenza** | I compiti tuoi senza scadenza stanno in testa con l'etichetta "Senza scadenza". |
| **Fatti** | Completati | Collassata, contatore, "Annulla" sul completamento. |

- **Adesso vuoto** (nulla di urgente): "Per ora niente di urgente. Il prossimo passo è «{titolo}», tra {n} settimane."
- Riga compito: checkbox 44 px, titolo, scadenza relativa ("tra 3 settimane", la data esatta nel tooltip e per lo screen reader), categoria, assegnatario (**Entrambi** / nome partner A / nome partner B, iniziali + nome; mai solo colore), eventuale badge "Da rivedere". Tocco → dettaglio in sheet (consiglio, nota "Indicativo: verifica sempre con il comune o la parrocchia" per le tappe burocratiche, note, modifica, elimina con Annulla ≥8 s).
- Form compito: titolo, scadenza (opzionale), categoria, note, "Chi se ne occupa" (3 opzioni, predefinito Entrambi), "Ricordamelo per email" (interruttore, attivo; per i compiti di Entrambi il promemoria va a tutti e due).
- Altre aree del Percorso: casella **"Suggerimenti da rivedere"** (accetta/ignora, AC16), banner **"Data riaperta"** (AC20), "Eliminati di recente" (ripristina), "Da rivedere" con "Va bene così".
- Il raggruppamento si ricalcola ogni giorno (e in anteprima, §3.8) senza spostare di colpo ciò che stai guardando: al cambio di gruppo la riga si sposta con una dissolvenza e un annuncio `aria-live`.

### 3.5 Scelte (DES-7, 8)
Elenco decisioni (stato: Aperta / Presa / Da rivedere). Dettaglio: domanda, opzioni come carte (campi leggeri, pro/contro con icone +/−, reazioni "Preferisco / Dubbioso" visibili all'altro come indicazione), "Confronta 2" (mobile: tabella con colonna etichette fissa e scorrimento orizzontale; da 768 px colonne affiancate), "Scegli", opzioni scartate collassate, storico cronologico in sola lettura con "Aggiungi nota". Conferma di scelta con riepilogo della conseguenza ("Le scadenze del Percorso si calcoleranno su questa data"). Riapertura: sheet con motivo obbligatorio (contatore, errore inline). La decisione **Data** ha in più badge di riferimento e azioni descritte in §3.8.

### 3.6 Budget (DES-9, 10)
Riepilogo: totale (con "Modifica" + motivo opzionale e "Storico"), non assegnato sempre visibile (sticky), barra complessiva. Categorie (una barra + un numero chiave, testo equivalente "62% concordato"), dettaglio categoria → voci (Previsto / Concordato / Annullata) → pagamenti (acconto/saldo/altro, scadenza, pagato o da pagare). "Prossimi pagamenti" in ordine di scadenza. Avvisi: icona + testo caldo (ambra/terracotta). Eliminare una categoria con voci: "Sposta in…" prima (P5). Importi solo con campi numerici (nessuno slider).

### 3.7 Altro
- **Profili**: tuo e del partner (etichetta, nome, cognome, email). L'email di chi ha già accettato è in sola lettura (P3); quella di chi non ha ancora accettato è modificabile con nuovo invito.
- **Impostazioni nozze**: rito, scenari di data, invitati, stile, luogo, budget iniziale. Ogni modifica genera "Suggerimenti da rivedere" in Percorso (AC16, AC48), mai cancellazioni automatiche.
- **Invito partner** (§3.1).
- **Promemoria email** (risolve P7): **due interruttori**, per te e indipendenti: **"Promemoria delle scadenze"** (7 giorni prima e il giorno stesso, solo per i compiti tuoi o di Entrambi con promemoria attivo) e **"Riepilogo del lunedì"** (compiti in scadenza o da recuperare, pagamenti in arrivo, novità di {partner}; non arriva se non c'è nulla). Nessuna categoria "pagamenti": i pagamenti compaiono solo nel riepilogo (AC50 copre solo i compiti). Sotto, la nota: "Le email di accesso e di invito non si possono disattivare." Ogni email ha il link di disattivazione (§7.2).
- **Aspetto**: tema (galleria §5.4) + chiaro / scuro / sistema (preferenza del dispositivo).
- **Esportazione**: 3 pulsanti (JSON completo, CSV compiti, CSV budget), barra di avanzamento con testo, nome file con data, "ultimo export".
- **Info**: versione, ultimo heartbeat del servizio ("Ultimo controllo del servizio: oggi alle 06:12"), link alle linee guida sul servizio.

### 3.8 Scenari di data e riferimento (AC24, AC32, BR3, D28)
**Concetti in parole semplici** (testo d'aiuto "Cos'è?" in un popover accanto al badge): *Riferimento* = la data su cui il Percorso calcola le scadenze. *Provvisorio* = finché la data non è scelta. *Definitivo* = dopo che la coppia ha scelto la data. *Anteprima* = guardare come cambierebbero le scadenze con un altro scenario, senza salvare nulla.

**Badge** (`ReferenceBadge`, testo + icona, mai solo colore): sullo scenario di riferimento "Riferimento · provvisorio" (icona puntina) oppure "Riferimento · definitivo" (icona lucchetto). Presente in: carta scenario (Scelte > Data), testata del Percorso, conto alla rovescia della Home, elenco scenari in onboarding/Impostazioni.

**Carta scenario** (Scelte > Data del matrimonio): etichetta, data o periodo (per un periodo "mag–giu 2028 · calcolata dal 1 mag"), badge di riferimento, reazioni, azioni:
- su ogni scenario aperto che non è il riferimento: **"Imposta come riferimento"**; apre un foglio di conferma con la conseguenza ("Le scadenze dei compiti si ricalcolano sul 14 maggio 2028. I compiti già completati o con scadenza modificata da te restano come sono. {N} scadenze cambiano.") e pulsanti "Imposta come riferimento" / "Annulla". Dopo l'esito, toast con **"Annulla"** (≥8 s) che ripristina il riferimento precedente;
- su un riferimento impostato a mano: **"Torna automatico (il più vicino)"** (richiede `set_reference_scenario(null)`, DES-18);
- **"Anteprima"** su tutti gli scenari diversi dal riferimento (porta al Percorso in anteprima);
- **"Scegli questa data"** (decisione, flusso §3.5).

**Regole di stato**
| Situazione | UI |
|---|---|
| Nessuno scenario | Nessun riferimento. Home "Data da decidere", Percorso senza compiti legati alla data, invito "Aggiungi il primo scenario". |
| Un solo scenario | È il riferimento (provvisorio), nessuna azione "Imposta" né anteprima. |
| Più scenari, default | Riferimento = il più vicino tra i non cancellati; badge "provvisorio"; riga di spiegazione "Il più vicino: lo usiamo per non farti arrivare tardi". |
| Riferimento impostato a mano | Badge "provvisorio · scelto da {nome}"; azione "Torna automatico". |
| Decisione presa | Lo scenario scelto è "definitivo"; gli altri sono "scartati"; **"Imposta come riferimento", "Anteprima" e selettore scompaiono** (la decisione comanda). Spiegazione: "La data è scelta: per cambiare le scadenze riapri la scelta." |
| Decisione riaperta | Lo stesso scenario resta riferimento e torna "provvisorio"; banner "Data riaperta: scadenze calcolate sull'ultima data scelta" (AC20) + badge "Da rivedere" sui compiti dipendenti. |
| Scenario di riferimento eliminato | Il riferimento torna automatico; toast "Il riferimento ora è il 14 mag 2028 (il più vicino)". |
| Scenario più vicino aggiunto da {partner} | Il riferimento automatico cambia: compare in **Novità** ("{Partner} ha aggiunto un'opzione: ora le scadenze seguono il 12 mar 2027") e, sul Percorso, una striscia "Scadenze ricalcolate" per la sessione successiva (DES-19). |
| Data prima del 3/9/2027 | Avviso non bloccante nel form ("È prima della data che desideravate: ricontrolla con la location"). |

**Selettore scenario nel Percorso** (`ScenarioPicker`): pulsante in testata "Scenario: 3 set 2027 · provvisorio ▾" (visibile solo con decisione aperta e ≥2 scenari). Su mobile apre un bottom sheet, da 768 px un popover, con un gruppo radio: ogni voce riporta etichetta, data, badge di riferimento. La prima voce "Riferimento attuale" riporta alla vista normale. Scegliere un altro scenario entra in **Anteprima** senza scrivere nulla (lo stato vive nell'URL `?anteprima=<id>`: il ricaricamento e il tasto indietro funzionano; uscire dalla pagina chiude l'anteprima).

**Banner di anteprima** (`ScenarioPreviewBanner`, fisso sotto l'intestazione, non chiudibile, `role="status"`): "Anteprima: 14 mag 2028 — nulla è salvato" (periodo: "calcolata dal 1 mag"), sotto "{N} scadenze cambiano rispetto al riferimento" e tre azioni: **Esci** (secondaria), **Imposta come riferimento** (apre il foglio di conferma sopra), **Scegli questa data** (porta alla decisione). Su 360 px le prime due sono visibili e "Scegli questa data" sta in un menu "Altro" nel banner; le tre sono tutte raggiungibili da tastiera in ordine logico. Se lo scenario in anteprima è già il riferimento, il banner non compare. Si passa liberamente da uno scenario all'altro dal selettore.
**Stile delle righe in anteprima** (distinto, non solo cromatico): bordo sinistro tratteggiato, etichetta "Anteprima" sulla scadenza, scadenza nuova in evidenza con la precedente barrata ("12 mar → 20 ago"). Il riferimento non cambia e nessuna richiesta di scrittura parte durante l'anteprima.

**Storico** (`HistoryList`): evento "{Nome} ha impostato il 14 mag 2028 come riferimento provvisorio" e "{Nome} è tornato al riferimento automatico".

## 4. Elenco schermate e stati
Legenda: C=caricamento, V=vuoto, E=errore, S=successo, P=permesso negato. "—" non applicabile.

| Schermata | C | V | E | S | P |
|---|---|---|---|---|---|
| Login / codice | spinner sul pulsante | — | link scaduto, codice errato o scaduto, invio fallito, limite email (429), attesa 30 s | "Controlla la posta" | — |
| Conferma accesso (`/auth/conferma`) | spinner sul pulsante | — | link scaduto o usato | accesso e reindirizzamento | — |
| "Questo spazio è su invito" | — | — | — | — | è la schermata di permesso negato: nessun dato, nessuna creazione |
| Invito (`/invito/[token]`) | skeleton | — | scaduto, già usato, revocato, altro account (email mascherata), spazio completo (§7.2) | "{Nome} ti ha invitato" + Entra | — |
| Altro > Invito partner | skeleton | "Nessun invito: invita {nome}" | email non valida / già invitata / invio fallito (con "Copia link") | stato "In attesa" + toast | solo partner |
| Onboarding passi 1–7 | — | "Non lo so ancora" valido; nessuno scenario ammesso | salvataggio fallito con bozza locale; email partner uguale alla tua o non valida | riepilogo + invito inviato | — |
| Galleria temi | skeleton carte | — | font non caricato: tema applicato con font di riserva | tema applicato (toast) | — |
| Home | skeleton card | "Scegli la data" come primo passo; "Budget da definire"; "Adesso" vuoto | card errore con "Riprova" | toast su completamento | — |
| Home, prima visita del partner B | — | — | — | carta di benvenuto | — |
| Percorso | skeleton righe | "Nessun compito: aggiungi il primo"; "Adesso" vuoto | riga con "Riprova" | snackbar + Annulla | — |
| Anteprima scenario | skeleton | nessuno scenario: invito ad aggiungerne uno | scenario cancellato da {partner} durante l'anteprima: l'anteprima si chiude con un avviso | — | — |
| Scelte (elenco/dettaglio) | skeleton carte | "Nessuna opzione: aggiungi la prima" | errore inline | momento "Data scelta" sobrio | — |
| Imposta riferimento | spinner sul pulsante | — | conflitto di versione (dialog) | toast + Annulla | — |
| Riapertura | — | — | motivo mancante (errore inline) | toast | — |
| Budget riepilogo/categoria | skeleton barre | "Budget da definire" + CTA | errore importo inline, conflitto | toast salvato | — |
| Pagamenti | skeleton | "Nessun pagamento in programma" | errore salvataggio | toast | — |
| Promemoria email (Altro) | skeleton | — | salvataggio fallito (l'interruttore torna indietro) | toast | solo sulle proprie preferenze |
| Disattivazione email (`/email/disattiva`) | spinner sul pulsante | — | link non valido o manomesso (§7.2) | "Fatto" | — |
| Esportazione | barra di avanzamento | — | "Non riesco a preparare il file" | download avviato | — |
| Globali | — | — | **Offline** (banner), **servizio in pausa** (pagina, §7.3), **servizio non raggiungibile** (pagina, §7.3), **conflitto** (dialog, §4.1) | — | sessione scaduta → login con messaggio "La sessione è scaduta, entra di nuovo" |

### 4.1 Conflitto di modifica (BR9, AC40)
Dialog (`AlertDialog`, sopra eventuali sheet, focus trap annidato con ritorno del focus allo sheet): titolo "{Partner} ha modificato questo elemento {2 minuti} fa". Contenuto: tabella "Cosa è cambiato" con colonne **Tu / {Partner}** e righe con etichette italiane dei campi ("Titolo", "Scadenza", "Chi se ne occupa", "Importo previsto"…; mappa campo→etichetta per entità nel codice, solo i campi diversi). Azioni: **Vedi cosa è cambiato** (espande la tabella), **Salva comunque** (riprova con la versione corrente), **Annulla** (chiude e ricarica la versione dell'altro, la tua bozza resta copiabile). Mai sovrascrittura silenziosa.

## 5. Temi (D7: catalogo da approvare al Gate B)
Il tema è una scelta **per matrimonio** (non per utente): i due partner vedono lo stesso aspetto. Si sceglie all'onboarding (passo 8, anteprima dal vivo) e si cambia in Altro > Aspetto. Chiaro/scuro è invece una preferenza **per dispositivo** (sistema, chiaro, scuro), valida per ogni tema. A Gate B lo sviluppatore approva quali temi restano; il catalogo parte da 12, l'app ne mostra solo gli approvati.
Preferito dallo sviluppatore: **Giardino** (tema predefinito).

### 5.1 Catalogo
| Tema | Atmosfera | Font titoli + corpo (Google Fonts, supportano l'italiano) |
|---|---|---|
| Giardino | Avorio caldo e salvia: sobrio, botanico, senza tempo | Fraunces + Figtree |
| Sera | Blu notte su carta rosata, accento terracotta: editoriale e contemporaneo | Instrument Serif + Manrope |
| Mediterraneo | Bianco calce e blu mare: luce, brezza, costa | DM Serif Display + DM Sans |
| Toscana | Terracotta, cotto e ulivo: campagna calda e conviviale | Cormorant Garamond + Nunito Sans |
| Essenziale | Monocromo minimale: bianco, nero, nessuna distrazione | Newsreader + Inter |
| Rosa antico | Cipria e malva: romantico, morbido, delicato | Playfair Display + Lato |
| Art déco | Nero e oro, geometrie e lusso anni Venti | Poiret One + Jost |
| Boho | Sabbia, ruggine e salvia secca: terroso, libero, naturale | Bellefair + Karla |
| Provenza | Lavanda e grigio perla: campi di lavanda, profumo di estate | Cormorant + Work Sans |
| Vivace | Colore pieno e moderno: fucsia, cobalto, energia | Bricolage Grotesque + Public Sans |
| Velluto | Bordeaux e inverno: serale, intimo, ricco | Libre Baskerville + Source Sans 3 |
| Amalfi | Limone, azzurro e bianco: solare, fresco, vivace | Gloock + Outfit |

Note sui font: titoli sempre ≥24 px per le serif sottili (Cormorant, Cormorant Garamond, Bellefair, Poiret One, Instrument Serif); Poiret One solo per titoli e numeri grandi, mai per frasi; Gloock, DM Serif Display, Instrument Serif, Poiret One e Bellefair hanno un solo peso (nessun grassetto sintetico: se serve enfasi si usa la dimensione). **Budget di caricamento** (DES-22): sottoinsieme `latin` (copre l'italiano e l'euro), `display: swap` con metriche di riserva (`size-adjust`) per non spostare il layout, **al massimo 2 pesi per famiglia nell'interfaccia** (titoli: 1 peso; corpo: 400 e 600) e **al massimo 4 file woff2 per tema, circa 120 KB in tutto** (controllo nello script di build). Si scarica solo il font del tema attivo; gli altri solo se la galleria li mostra (vedi 5.4).

### 5.2 Token e verifica di contrasto
Token per tema e modalità: `background`, `foreground`, `card`, `muted`, `mutedForeground`, `primary`, `primaryForeground`, `accent`, `border`, più `input` (bordo dei campi) e `ring` = `primary`. Mappatura su shadcn: `--background`, `--foreground`, `--card`, `--muted`, `--muted-foreground`, `--primary`, `--primary-foreground`, `--accent`, `--border`, `--input`, `--ring`. `accent` è solo grafico (filetti, icone, barre, ≥3:1), **mai testo**; `border` è decorativo; `primary` è usato anche come colore di testo/link (quindi ≥4,5:1). Stati semantici (`success`, `warning`, `destructive`) sono condivisi da tutti i temi, ricalcolati per modalità: success #2F6B4F / #8FD1AE, warning testo #7A4A00 su #FFF1D0 / #F2C46D, destructive #A23B3B / #F0A3A3 (come nella bozza precedente, già verificati).
Soglie verificate (calcolate): testo ≥4,5:1 (foreground su background e card; mutedForeground su background e muted; primaryForeground su primary; primary su background e card) e componenti UI ≥3:1 (accent e input su background/card) in chiaro e scuro, per tutti i temi: **0 fallimenti** dopo le correzioni. Colonne della tabella: foreground/background · mutedForeground/muted · primaryForeground/primary · primary/background · accent/background.
| Tema | Font | Chiaro | Scuro |
|---|---|---|---|
| Giardino | Fraunces + Figtree | 13.5 / 4.8 / 7.4 / 7.4 / 3.1 | 15.5 / 6.5 / 8.4 / 9.5 / 9.6 |
| Sera | Instrument Serif + Manrope | 14.3 / 5.3 / 5.6 / 5.6 / 3.2 | 15.4 / 6.3 / 7.7 / 8.0 / 8.0 |
| Mediterraneo | DM Serif Display + DM Sans | 14.2 / 4.9 / 6.6 / 6.6 / 3.2 | 15.1 / 6.0 / 8.3 / 8.2 / 7.2 |
| Toscana | Cormorant Garamond + Nunito Sans | 13.6 / 5.4 / 5.4 / 5.4 / 3.2 | 15.4 / 6.7 / 7.4 / 7.7 / 8.1 |
| Essenziale | Newsreader + Inter | 18.9 / 6.1 / 18.9 / 18.9 / 3.5 | 18.1 / 7.2 / 18.1 / 18.1 / 6.1 |
| Rosa antico | Playfair Display + Lato | 13.1 / 5.2 / 6.1 / 6.1 / 3.1 | 15.5 / 6.7 / 8.8 / 9.3 / 7.7 |
| Art déco | Poiret One + Jost | 17.5 / 5.8 / 11.4 / 17.5 / 3.1 | 16.3 / 7.3 / 11.4 / 11.8 / 9.2 |
| Boho | Bellefair + Karla | 11.7 / 5.2 / 6.0 / 6.0 / 3.1 | 14.9 / 7.0 / 6.8 / 7.2 / 8.3 |
| Provenza | Cormorant + Work Sans | 14.1 / 5.3 / 7.3 / 7.3 / 3.1 | 15.5 / 6.9 / 8.2 / 8.6 / 6.9 |
| Vivace | Bricolage Grotesque + Public Sans | 16.1 / 5.6 / 6.0 / 5.7 / 6.5 | 16.9 / 7.6 / 7.6 / 7.7 / 6.6 |
| Velluto | Libre Baskerville + Source Sans 3 | 15.9 / 5.6 / 9.4 / 9.4 / 3.1 | 16.1 / 7.3 / 7.4 / 7.8 / 8.4 |
| Amalfi | Gloock + Outfit | 12.9 / 5.0 / 6.0 / 6.0 / 3.1 | 16.0 / 6.6 / 9.2 / 9.8 / 11.0 |

**Correzioni applicate** (accent chiari scuriti per arrivare a ≥3:1 su background): Mediterraneo #4FA3C7→#4895B7, Toscana #C98A4B→#B87E45, Rosa antico #D98CA3→#BE7B8F, Art déco #B8912F→#AC882C, Boho #9AA27A→#878E6B, Provenza #9B87C9→#9784C4, Velluto #B9876A→#B18165, Amalfi #E3B505→#B18D03, Giardino #B08A3E→#AC873C (era 3,0 al limite), Sera #C9786A→#C47567. Nessuna correzione sui token di testo. Da riverificare in F3 sul rendering reale.

**Verifica aggiuntiva F2** (calcolata sui token di §5.3): oltre alle coppie sopra, anche foreground/muted, mutedForeground/card, primary/muted, input/muted, accent/card e i colori semantici (success, warning, destructive) su background, card e muted danno **0 fallimenti**, con **un'eccezione**: `accent` su `muted` scende a 2,67–2,86:1 in 10 temi chiari (Giardino, Sera, Mediterraneo, Toscana, Rosa antico, Art déco, Boho, Provenza, Velluto, Amalfi). Regola: **`accent` è solo grafico e si usa solo su `background` e `card`, mai su `muted`** (barre e icone nelle zone `muted` usano `primary`). Il test di contrasto del piano deve includere tutte queste coppie, così la regola è verificata e non solo dichiarata.

### 5.3 Dati per la galleria (leggibili da macchina)
`id`, `name`, `mood`, `fonts{heading,body}`, `light{}`, `dark{}`; colori esadecimali; raggio condiviso (12/10/999 px).
```json
[
 {
  "id": "giardino",
  "name": "Giardino",
  "mood": "Avorio caldo e salvia: sobrio, botanico, senza tempo",
  "fonts": {
   "heading": "Fraunces",
   "body": "Figtree"
  },
  "light": {
   "background": "#FBF7F0",
   "foreground": "#2B2A26",
   "card": "#FFFFFF",
   "muted": "#F1EBDF",
   "mutedForeground": "#6B665B",
   "primary": "#43573F",
   "primaryForeground": "#FBF7F0",
   "accent": "#AC873C",
   "border": "#E4DCCB",
   "input": "#8C8574"
  },
  "dark": {
   "background": "#171611",
   "foreground": "#F2EDE2",
   "card": "#1F1E17",
   "muted": "#2A281F",
   "mutedForeground": "#B3AC9C",
   "primary": "#A9C3A5",
   "primaryForeground": "#1A2418",
   "accent": "#D9B96A",
   "border": "#35322A",
   "input": "#7C7767"
  }
 },
 {
  "id": "sera",
  "name": "Sera",
  "mood": "Blu notte su carta rosata, accento terracotta: editoriale e contemporaneo",
  "fonts": {
   "heading": "Instrument Serif",
   "body": "Manrope"
  },
  "light": {
   "background": "#FAF5F2",
   "foreground": "#1F2430",
   "card": "#FFFFFF",
   "muted": "#F0E7E3",
   "mutedForeground": "#625C62",
   "primary": "#9C4A3A",
   "primaryForeground": "#FAF5F2",
   "accent": "#C47567",
   "border": "#E6D9D4",
   "input": "#8A7F83"
  },
  "dark": {
   "background": "#14161D",
   "foreground": "#F1ECEA",
   "card": "#1C1F28",
   "muted": "#272A35",
   "mutedForeground": "#B0AAB0",
   "primary": "#E39A8A",
   "primaryForeground": "#2A140F",
   "accent": "#E39A8A",
   "border": "#323645",
   "input": "#7D7F8E"
  }
 },
 {
  "id": "mediterraneo",
  "name": "Mediterraneo",
  "mood": "Bianco calce e blu mare: luce, brezza, costa",
  "fonts": {
   "heading": "DM Serif Display",
   "body": "DM Sans"
  },
  "light": {
   "background": "#F7FAFB",
   "foreground": "#13293D",
   "card": "#FFFFFF",
   "muted": "#E6EEF3",
   "mutedForeground": "#566877",
   "primary": "#1B5E8C",
   "primaryForeground": "#F7FAFB",
   "accent": "#4895B7",
   "border": "#D3E0E8",
   "input": "#6F8797"
  },
  "dark": {
   "background": "#0D1B27",
   "foreground": "#E8F0F5",
   "card": "#142634",
   "muted": "#1D3446",
   "mutedForeground": "#9FB4C4",
   "primary": "#7DB9E0",
   "primaryForeground": "#0A1A26",
   "accent": "#5FB0D6",
   "border": "#26414F",
   "input": "#6E8799"
  }
 },
 {
  "id": "toscana",
  "name": "Toscana",
  "mood": "Terracotta, cotto e ulivo: campagna calda e conviviale",
  "fonts": {
   "heading": "Cormorant Garamond",
   "body": "Nunito Sans"
  },
  "light": {
   "background": "#FBF4EC",
   "foreground": "#35241B",
   "card": "#FFFFFF",
   "muted": "#F2E4D5",
   "mutedForeground": "#6F5646",
   "primary": "#A5472A",
   "primaryForeground": "#FBF4EC",
   "accent": "#B87E45",
   "border": "#E8D5C0",
   "input": "#8E7461"
  },
  "dark": {
   "background": "#1A120D",
   "foreground": "#F4E9DD",
   "card": "#241913",
   "muted": "#30221A",
   "mutedForeground": "#BFA793",
   "primary": "#E5946F",
   "primaryForeground": "#2B120A",
   "accent": "#D9A066",
   "border": "#3D2B20",
   "input": "#8A7160"
  }
 },
 {
  "id": "essenziale",
  "name": "Essenziale",
  "mood": "Monocromo minimale: bianco, nero, nessuna distrazione",
  "fonts": {
   "heading": "Newsreader",
   "body": "Inter"
  },
  "light": {
   "background": "#FFFFFF",
   "foreground": "#111111",
   "card": "#FFFFFF",
   "muted": "#F4F4F4",
   "mutedForeground": "#5C5C5C",
   "primary": "#111111",
   "primaryForeground": "#FFFFFF",
   "accent": "#8A8A8A",
   "border": "#E4E4E4",
   "input": "#7A7A7A"
  },
  "dark": {
   "background": "#0B0B0B",
   "foreground": "#F5F5F5",
   "card": "#141414",
   "muted": "#1F1F1F",
   "mutedForeground": "#ABABAB",
   "primary": "#F5F5F5",
   "primaryForeground": "#0B0B0B",
   "accent": "#8F8F8F",
   "border": "#2E2E2E",
   "input": "#7A7A7A"
  }
 },
 {
  "id": "rosa-antico",
  "name": "Rosa antico",
  "mood": "Cipria e malva: romantico, morbido, delicato",
  "fonts": {
   "heading": "Playfair Display",
   "body": "Lato"
  },
  "light": {
   "background": "#FDF6F6",
   "foreground": "#3A2630",
   "card": "#FFFFFF",
   "muted": "#F6E6E8",
   "mutedForeground": "#735A64",
   "primary": "#9A3F5E",
   "primaryForeground": "#FDF6F6",
   "accent": "#BE7B8F",
   "border": "#EDD6DA",
   "input": "#8F7380"
  },
  "dark": {
   "background": "#1B1216",
   "foreground": "#F6E9EC",
   "card": "#251A1F",
   "muted": "#33242B",
   "mutedForeground": "#C2A9B2",
   "primary": "#EFA3BB",
   "primaryForeground": "#2E1019",
   "accent": "#E58FAA",
   "border": "#412D35",
   "input": "#86707A"
  }
 },
 {
  "id": "art-deco",
  "name": "Art déco",
  "mood": "Nero e oro, geometrie e lusso anni Venti",
  "fonts": {
   "heading": "Poiret One",
   "body": "Jost"
  },
  "light": {
   "background": "#FAF7F0",
   "foreground": "#14120E",
   "card": "#FFFFFF",
   "muted": "#EFE9DA",
   "mutedForeground": "#5E5848",
   "primary": "#14120E",
   "primaryForeground": "#E8C766",
   "accent": "#AC882C",
   "border": "#DDD3BC",
   "input": "#827A63"
  },
  "dark": {
   "background": "#0E0D0A",
   "foreground": "#F3EBD6",
   "card": "#17150F",
   "muted": "#221F16",
   "mutedForeground": "#B5AC93",
   "primary": "#E8C766",
   "primaryForeground": "#14120E",
   "accent": "#D4AF37",
   "border": "#35301F",
   "input": "#7C7556"
  }
 },
 {
  "id": "boho",
  "name": "Boho",
  "mood": "Sabbia, ruggine e salvia secca: terroso, libero, naturale",
  "fonts": {
   "heading": "Bellefair",
   "body": "Karla"
  },
  "light": {
   "background": "#F8F2E9",
   "foreground": "#3B2F25",
   "card": "#FFFDF9",
   "muted": "#EDE2D1",
   "mutedForeground": "#6A5A4B",
   "primary": "#8C4A2F",
   "primaryForeground": "#F8F2E9",
   "accent": "#878E6B",
   "border": "#DFD0BB",
   "input": "#857462"
  },
  "dark": {
   "background": "#18130E",
   "foreground": "#F0E6D6",
   "card": "#211B14",
   "muted": "#2C241B",
   "mutedForeground": "#BDAE9A",
   "primary": "#D9916D",
   "primaryForeground": "#2A1409",
   "accent": "#A9B38A",
   "border": "#3A3025",
   "input": "#80705E"
  }
 },
 {
  "id": "provenza",
  "name": "Provenza",
  "mood": "Lavanda e grigio perla: campi di lavanda, profumo di estate",
  "fonts": {
   "heading": "Cormorant",
   "body": "Work Sans"
  },
  "light": {
   "background": "#F8F6FB",
   "foreground": "#2A2238",
   "card": "#FFFFFF",
   "muted": "#EBE6F3",
   "mutedForeground": "#625A75",
   "primary": "#5B4590",
   "primaryForeground": "#F8F6FB",
   "accent": "#9784C4",
   "border": "#DDD6EA",
   "input": "#82789A"
  },
  "dark": {
   "background": "#15121C",
   "foreground": "#EEE9F6",
   "card": "#1D1926",
   "muted": "#292335",
   "mutedForeground": "#B4ABC7",
   "primary": "#B9A6EB",
   "primaryForeground": "#1D1230",
   "accent": "#A793DB",
   "border": "#352E45",
   "input": "#7D7595"
  }
 },
 {
  "id": "vivace",
  "name": "Vivace",
  "mood": "Colore pieno e moderno: fucsia, cobalto, energia",
  "fonts": {
   "heading": "Bricolage Grotesque",
   "body": "Public Sans"
  },
  "light": {
   "background": "#FFF9F5",
   "foreground": "#1E1B2E",
   "card": "#FFFFFF",
   "muted": "#FDE9EE",
   "mutedForeground": "#5F5A74",
   "primary": "#C0175D",
   "primaryForeground": "#FFFFFF",
   "accent": "#2F4BD8",
   "border": "#F3D8E0",
   "input": "#857D93"
  },
  "dark": {
   "background": "#13111C",
   "foreground": "#F7F2FA",
   "card": "#1B1826",
   "muted": "#271F33",
   "mutedForeground": "#B8B0C9",
   "primary": "#FF7AAE",
   "primaryForeground": "#2A0615",
   "accent": "#7A93FF",
   "border": "#352C45",
   "input": "#7C7494"
  }
 },
 {
  "id": "velluto",
  "name": "Velluto",
  "mood": "Bordeaux e inverno: serale, intimo, ricco",
  "fonts": {
   "heading": "Libre Baskerville",
   "body": "Source Sans 3"
  },
  "light": {
   "background": "#FBF5F3",
   "foreground": "#2B1519",
   "card": "#FFFFFF",
   "muted": "#F2E3E0",
   "mutedForeground": "#6E5256",
   "primary": "#7A1F36",
   "primaryForeground": "#FBF5F3",
   "accent": "#B18165",
   "border": "#E7D2CF",
   "input": "#8C6E72"
  },
  "dark": {
   "background": "#170C0F",
   "foreground": "#F6E8E6",
   "card": "#211216",
   "muted": "#2F1A1F",
   "mutedForeground": "#C3A6A9",
   "primary": "#E8899F",
   "primaryForeground": "#2B0A13",
   "accent": "#D2A27F",
   "border": "#3E2429",
   "input": "#85686C"
  }
 },
 {
  "id": "amalfi",
  "name": "Amalfi",
  "mood": "Limone, azzurro e bianco: solare, fresco, vivace",
  "fonts": {
   "heading": "Gloock",
   "body": "Outfit"
  },
  "light": {
   "background": "#FFFEF7",
   "foreground": "#1F3340",
   "card": "#FFFFFF",
   "muted": "#FBF3CF",
   "mutedForeground": "#5A6B73",
   "primary": "#0F6C80",
   "primaryForeground": "#FFFEF7",
   "accent": "#B18D03",
   "border": "#F0E8BC",
   "input": "#788A92"
  },
  "dark": {
   "background": "#0F1A1F",
   "foreground": "#F6F4E6",
   "card": "#162329",
   "muted": "#20323A",
   "mutedForeground": "#A9BAC0",
   "primary": "#6FCFE0",
   "primaryForeground": "#05222A",
   "accent": "#F0C830",
   "border": "#2B3F48",
   "input": "#6C838C"
  }
 }
]
```

### 5.4 Come funziona il tema (runtime)
- **Token**: ogni tema è un set di variabili CSS. Selettori **non legati a `:root`**: `[data-theme="<id>"]` (chiaro) e `[data-theme="<id>"][data-mode="dark"]` (scuro), così la stessa regola vale sull'`<html>` e su una singola carta di anteprima nella galleria (DES-21). Ogni tema definisce anche `--font-heading` e `--font-body`. I componenti leggono solo i token, mai colori letterali. Nessun ricaricamento al cambio.
- **Applicazione senza lampo**: il root layout legge `theme_id` del matrimonio e scrive `<html data-theme>`; se la lettura fallisce (database in pausa, pagine pubbliche senza sessione) usa il cookie `r2y-theme` (solo l'id del tema, nessun dato personale, aggiornato a ogni salvataggio) e infine `giardino`. Un id non più tra i temi approvati ricade su `giardino`. Chiaro/scuro: piccolo script inline prima del paint (`localStorage`, default `prefers-color-scheme`) che imposta `data-mode` e aggiorna `<meta name="theme-color">` con il `background` del tema attivo.
- **Font** (DES-22): una dichiarazione `next/font/google` per ogni famiglia dei **soli temi approvati**, `subsets: ['latin']`, `display: 'swap'`, pesi come in 5.1, `preload: false`, esposta come variabile CSS (`--font-fraunces`…); il tema mappa `--font-heading`/`--font-body` su queste variabili. Il browser scarica solo le facce effettivamente usate dal tema attivo (due famiglie, di solito 3-4 file). Nessun preload dinamico è possibile con `next/font`: con `swap` il testo del LCP (saluto, conto alla rovescia) compare subito con il font di riserva e il passaggio al font del tema non sposta il layout. Se la misura in e2e (4G simulato, cache fredda) supera 2,5 s di LCP si passa a `next/font/local` con `<link rel="preload">` dei soli due file del tema attivo.
- **Galleria** (onboarding passo 8 e Altro > Aspetto): carte con mini-schermata Home (titolo in serif, pulsante, barra budget, carta compito), ognuna dentro un contenitore con `data-theme` e `data-mode` propri. Le carte non attive mostrano solo il **font dei titoli** (e il testo di anteprima in un font di sistema per il corpo); il font del corpo di un tema si carica solo quando lo selezioni. Prima di applicare un tema in modo provvisorio si attende `document.fonts.load()` (max 1,5 s) per evitare il salto.
- **Anteprima provvisoria**: toccare una carta applica subito il tema all'intera interfaccia con "Usa questo tema" / "Annulla"; interruttore chiaro/scuro nell'anteprima; carte selezionabili con tastiera (`radiogroup`, frecce, `aria-checked`), nome del tema in testo. "Usa questo tema" salva (server action); l'altro partner lo vede al caricamento successivo; in quel caricamento non c'è lampo perché `data-theme` arriva già nell'HTML.
- Il contrasto è garantito dai token (nessun colore personalizzato in R1). Scelta emotiva e personale, tutto gratuito (nessuna immagine), peso minimo (variabili CSS + 2 famiglie attive).

### 5.5 Movimento e forma (comuni a tutti i temi)
Transizioni 150–250 ms ease-out; sheet con slide-up; spunta del checkbox con micro-animazione; un solo momento "festa" per decisione presa (≤1 s); con `prefers-reduced-motion` dissolvenza o statico; mai animazioni infinite. Tipografia: titoli 28/34 e 22/28, corpo 16/24 (input ≥16 px), `tabular-nums` per gli importi.

## 6. Componenti (approccio shadcn/ui)
Greenfield: nessun componente da riusare; i percorsi seguono la struttura del piano (§2): `src/components/ui/*` (shadcn copiato nel repo), `src/components/*` (condivisi), `src/features/<area>/*` (di una sola area). I componenti usati da più aree stanno in `src/components/*` e sono del task T3 (DES-23).

| Esigenza | Base shadcn/ui | Nuovo? (percorso) |
|---|---|---|
| Pulsanti, campi, label, select, checkbox, switch, tabs, radio | Button, Input, Label, Select, Checkbox, Switch, Tabs, RadioGroup (`components/ui/*`) | no |
| Sheet di dettaglio/form su mobile | Drawer (vaul) / Sheet | no |
| Dialog di conferma e conflitto | AlertDialog / Dialog | **ConflictDialog** (`components/ConflictDialog.tsx`) |
| Toast con Annulla | Sonner | no |
| Date | input nativo `type=date` su mobile; Calendar (react-day-picker, locale it) su desktop | **DateField** (`components/DateField.tsx`) |
| Periodo (mese/anno → mese/anno) | Select | **MonthYearField** (`components/MonthYearField.tsx`) |
| Importi | Input | **MoneyInput** (`components/MoneyInput.tsx`, it-IT, `inputmode=decimal`) |
| Barra di avanzamento con testo | Progress | **BudgetBar** (`components/BudgetBar.tsx`) |
| Conto alla rovescia | — | **Countdown** (`components/Countdown.tsx`, `aria` statico) |
| Carta opzione di decisione, storico | Card | **OptionCard**, **HistoryList** (`features/decisions/*`) |
| Navigazione | — | **AppNav** (`components/AppNav.tsx`) |
| Stati vuoti/errore/offline | Alert | **EmptyState**, **ErrorState**, **OfflineBanner**, **ServiceDownPage** (`components/*`) |
| Badge di riferimento (provvisorio/definitivo) | Badge | **ReferenceBadge** (`components/ReferenceBadge.tsx`) |
| Elenco scenari (data fissa/periodo) con badge e azioni | ToggleGroup, Input | **DateScenarioList** (`components/DateScenarioList.tsx`, usato da onboarding, Impostazioni e Scelte) |
| Selettore scenario del Percorso | Drawer / Popover + RadioGroup | **ScenarioPicker** (`features/timeline/ScenarioPicker.tsx`) |
| Banner anteprima scenario | Alert | **ScenarioPreviewBanner** (`features/timeline/*`) |
| Galleria temi con anteprima | RadioGroup, Card | **ThemeGallery** (`components/ThemeGallery.tsx`), **ThemeProvider** |
| Scheda persona (etichetta, nome, cognome, email) | Input, Select, Label | **PersonForm** (`features/onboarding/PersonForm.tsx`, riusato da Profili) |
| Assegnatario + promemoria | RadioGroup, Switch | **AssigneeField**, **ReminderToggle** (`features/timeline/*`) |
| Carta di benvenuto del secondo partner | Card | **WelcomeCard** (`features/home/*`) |
| Pagine pubbliche senza dati (invito, su-invito, disattiva, servizio in pausa) | — | **PublicShell** (`components/PublicShell.tsx`: logo, tema da cookie, nessun dato) |
| Template email | — | `src/lib/email/templates/*` (§7.2), niente componenti UI |

## 7. Copy (linee guida e campioni)

### 7.1 Linee guida e campioni
Tono: **informale, "tu"**, caldo e diretto, come un amico che ti aiuta; ti rivolgi sempre alla persona che ha fatto l'accesso ("Ciao Tony", "hai completato"), mai al "voi". Per il partner o per cose di coppia usa il nome ("Jessica ha scelto la location"; "il vostro matrimonio" solo come nome dell'oggetto). Frasi brevi, niente burocratese, niente emoji nei testi di sistema (ammesse poche in momenti di festa, mai nelle email), mai colpevolizzare; stati vuoti con una frase + un'azione. Le etichette di ruolo (Sposo/Sposa/altra) non compaiono mai nel testo corrente: si usano i nomi; se il nome manca si ripiega sull'etichetta e infine su "il tuo partner" (`displayName`). In interfaccia mai "impegnato": si dice **Concordato**.

| Dove | Testo |
|---|---|
| Saluto Home | "Ciao Tony, ecco cosa ti aspetta oggi" |
| Home, senza data | "Il primo passo: scegli la data" |
| Conto alla rovescia provvisorio | "Se fosse il 3 settembre 2027: mancano 284 giorni" |
| Conto alla rovescia definitivo | "Mancano 284 giorni (40 settimane)" |
| Benvenuto del secondo partner | "Ciao Jessica, ti stavamo aspettando. Tony ha già preparato un po' di cose: dai un'occhiata e correggi quello che non ti torna." |
| Onboarding, passo 1 | "Iniziamo da te: come ti chiami?" |
| Onboarding, passo 2 | "Ora il tuo partner. Gli mandiamo un invito per entrare con te." |
| Onboarding, ripresa | "Bentornato, riprendiamo dal passo 4 di 8" |
| Onboarding, "non so" | "Non lo so ancora" |
| Scenari di data | "Hai più opzioni? Aggiungile pure: una data fissa o un periodo" |
| Spiegazione riferimento | "Il riferimento è la data su cui calcoliamo le scadenze. Resta provvisorio finché non scegliete." |
| Imposta come riferimento (conferma) | "Le scadenze si ricalcolano sul 14 maggio 2028. Quello che hai già completato o spostato a mano resta com'è." |
| Anteprima (banner) | "Anteprima: 14 mag 2028 — nulla è salvato" |
| Anteprima, differenze | "14 scadenze cambiano rispetto al riferimento" |
| Riferimento tornato automatico | "Il riferimento ora è il 14 mag 2028 (il più vicino)." |
| Tappa in ritardo | "Di solito si fa prima, ma hai ancora tempo: ecco come recuperare" |
| Adesso vuoto | "Per ora niente di urgente. Il prossimo passo è «Prenotare il fotografo», tra 6 settimane." |
| Stato vuoto compiti | "Ancora nessun compito. Aggiungi il primo." |
| Assegnatario | "Chi se ne occupa? Entrambi / Tony / Jessica" |
| Promemoria (interruttore) | "Ricordamelo per email, 7 giorni prima e il giorno stesso" |
| Preferenze email | "Promemoria delle scadenze" · "Riepilogo del lunedì" · "Le email di accesso e di invito non si possono disattivare." |
| Stato vuoto budget | "Budget da definire. Parti da una cifra indicativa: potrai cambiarla." |
| Riapertura | "Perché vuoi riaprire questa scelta?" (obbligatorio) |
| Conflitto | "Jessica ha modificato questo elemento 2 minuti fa." |
| Sforamento | "Sei oltre di € 1.200 su Catering." |
| Errore importo | "Inserisci un importo in euro, ad esempio 1.500,00." |
| Errore email partner | "Questa è la tua email: inserisci quella del tuo partner." |
| Offline | "Sei offline. Le modifiche non sono ancora salvate." |
| Avviso tappe burocratiche | "Indicativo: verifica sempre con il comune o la parrocchia." |
| Data prima del 3/9/2027 | "È prima della data che desideravate: ricontrolla con la location." |
| Sessione scaduta | "La sessione è scaduta. Entra di nuovo: non hai perso nulla." |
| Tema | "Scegli lo stile della tua app. Lo puoi cambiare quando vuoi." |
Vocabolario fisso: Previsto, Concordato, Pagato, Ancora da pagare, Assegnato; Scelte (decisioni), Percorso (timeline), Scenario (data/periodo candidato), Riferimento (provvisorio/definitivo), Anteprima, Entrambi.

### 7.2 Pagine pubbliche ed email
**Login e accesso**
| Dove | Testo |
|---|---|
| Login, titolo | "Entra in roadmap2yes" · campo "La tua email" · pulsante "Mandami il link" |
| Controlla la posta | "Controlla la posta. Se questo indirizzo può entrare, ti abbiamo mandato un link e un codice a 6 cifre." · "Rimanda il link (tra 30 s)" |
| Codice errato o scaduto | "Il codice non è giusto o è scaduto. Controlla le cifre o chiedine uno nuovo." |
| Limite email | "Hai chiesto troppe email. Riprova tra qualche minuto." |
| Conferma accesso | "Sei quasi dentro." · pulsante "Entra" |
| Link scaduto/usato | "Il link è scaduto o è già stato usato. Chiedine uno nuovo." · "Torna al login" |
| Su invito | "Questo spazio è su invito. Chiedi a chi te l'ha condiviso di mandarti un invito." |

**Invito** (`/invito/[token]`, la pagina mostra solo il nome di chi invita)
| Stato | Titolo e azione |
|---|---|
| Valido | "Tony ti ha invitato a organizzare il matrimonio insieme." · "Continua con la tua email" (email precompilata) |
| Scaduto | "Questo invito è scaduto (valeva 7 giorni)." · "Chiedi a Tony di mandarne uno nuovo." |
| Già usato | "Questo invito è già stato usato." · "Se eri tu, entra dal login." |
| Revocato | "Questo invito è stato annullato." · "Chiedi a Tony di mandarne uno nuovo." |
| Altro account | "Questo invito è per un altro indirizzo (j***@…). Entra con quell'email o chiedi un invito per questa." |
| Spazio completo | "In questo spazio ci siete già in due. Se pensi sia un errore, chiedi a Tony." |

**Disattivazione email** (`/email/disattiva`, pagina pubblica con token firmato; il GET non cambia nulla)
| Stato | Testo |
|---|---|
| Conferma | "Vuoi disattivare i promemoria?" · "Non riceverai più le email con le scadenze. Quelle di accesso e di invito continuano ad arrivare." · [Sì, disattiva] [No, lascia stare] (per il riepilogo: "Vuoi disattivare il riepilogo del lunedì?") |
| Fatto | "Fatto. Non riceverai più i promemoria." · "Cambi idea? Puoi riattivarli da Altro > Promemoria." |
| Link non valido | "Questo link non funziona più. Entra nell'app e cambia le preferenze da Altro > Promemoria." |

**Email** — regole comuni (DES-25): oggetto breve e specifico, senza emoji; **anteprima (preheader)** di una riga; larghezza max 560 px, tabelle e stili inline, sfondo chiaro col `background` e il `primary` del tema del matrimonio (con `primaryForeground` per il testo del pulsante: coppie già verificate ≥4,5:1) o, per le email di Supabase Auth che non conoscono il matrimonio, la palette Giardino; titolo in Georgia, corpo in font di sistema (nessun web font nelle email); pulsante "a prova di client" ≥44 px con sotto il link in chiaro; versione solo testo equivalente; `lang="it"`; il testo scritto dall'utente (nomi, titoli dei compiti) è sempre **escapato** in HTML e ripulito da a-capo negli oggetti e nelle intestazioni; ora e date in italiano, Europe/Rome; nessuna immagine tracciante, nessun tracciamento dei clic; i link portano ai percorsi dell'app (si entra comunque dal login).

| Email | Oggetto | Corpo (tu) | Pulsante · piè di pagina |
|---|---|---|---|
| **Codice/link di accesso** (template Supabase) | "Il tuo accesso a roadmap2yes" | "Ciao, ecco il tuo accesso. **123456** (codice grande, a cifre separate da spazio sottile, selezionabile). Apri il link oppure scrivi il codice nell'app. Valgono un'ora. Se non l'hai chiesto tu, ignora questa email: senza il codice nessuno può entrare." | "Entra" · nessun link di disattivazione (non disattivabile) |
| **Invito al partner** | "Tony ti ha invitato su roadmap2yes" | "Ciao Jessica, Tony ha iniziato a organizzare il vostro matrimonio e vuole farlo insieme a te. Entra per vedere cosa ha già preparato e dire la tua. Il link vale 7 giorni (fino al 30 novembre) ed è solo per questo indirizzo. Se non te l'aspettavi, ignora questa email: non succede niente." | "Entra nello spazio" · "Questa email non si può disattivare perché è un invito." |
| **Promemoria, 7 giorni prima** | "Tra 7 giorni: Prenotare la location" (più compiti: "Tra 7 giorni: 3 cose da fare") | "Ciao Tony, tra una settimana (lunedì 30 novembre) scade: **Prenotare la location**. Se è già fatto, segnalo nell'app con un tocco." Più compiti: elenco (max 5, poi "e altri 2"). | "Apri il Percorso" · "Non vuoi più questi promemoria? Disattivali con un tocco." |
| **Promemoria, giorno stesso** | "Oggi: Prenotare la location" | "Ciao Tony, oggi è il giorno per: **Prenotare la location**. Non ce la fai? Nessun problema: puoi spostare la scadenza dal compito." | come sopra |
| **Riepilogo del lunedì** | "Il tuo riepilogo della settimana" | "Ciao Tony, ecco cosa ti aspetta questa settimana. **Da fare** (in scadenza o da recuperare, max 5), **Pagamenti in arrivo** (descrizione, importo, scadenza), **Novità di Jessica** (max 3). Niente da segnalare: non ti scriviamo." Le tappe in ritardo sono "Da recuperare", tono neutro. | "Apri roadmap2yes" · "Non vuoi più il riepilogo del lunedì? Disattivalo con un tocco." + "Cambi idea? Altro > Promemoria." |

Raggruppamento (DES-26): un utente riceve **al massimo un'email di promemoria al giorno**, che raccoglie tutti i compiti di quel giorno (sia "tra 7 giorni" sia "oggi", in due blocchi); l'idempotenza resta per compito nel log.

### 7.3 Servizio in pausa o non raggiungibile (risolve R9; DES-16)
Un progetto Supabase gratuito in pausa **non si risveglia da solo**: va ripristinato dal pannello. Le due situazioni hanno testi diversi e nessuno promette un risveglio automatico.
| Situazione (come si riconosce) | Titolo e testo |
|---|---|
| **Servizio in pausa** (risposta del servizio "progetto in pausa", HTTP 540) | "L'app è in pausa." · "Il servizio gratuito che conserva i tuoi dati si ferma dopo qualche giorno senza uso e non riparte da solo. I dati non sono stati toccati: serve solo che chi gestisce l'app lo riattivi dal pannello." · pulsante "Riprova" · dettagli comprimibili: "Per chi gestisce l'app: apri il pannello Supabase e premi «Ripristina progetto»; la guida è in docs/technical/ambienti-e-rilascio.md." Dopo un nuovo tentativo fallito: "È ancora in pausa." |
| **Servizio non raggiungibile** (rete, timeout, altri 5xx) | "Non riesco a raggiungere il servizio." · "Controlla la connessione e riprova tra poco. Se continua, avvisa chi gestisce l'app." · pulsante "Riprova" |
| **Offline** (browser senza rete) | banner "Sei offline. Le modifiche non sono ancora salvate." (la pagina resta usabile, bozza locale conservata) |
La pagina è renderizzata senza leggere il database (tema da cookie o Giardino, nessun dato), ha `noindex`, titolo "L'app è in pausa · roadmap2yes" e `role="alert"` sul titolo. Nessun polling automatico: solo "Riprova" manuale.

## 8. Accessibilità (WCAG 2.2 AA, DES-12)
- Tastiera: tutto operabile; ordine logico; focus visibile (anello 2 px + offset, ≥3:1); sheet/dialog con focus trap (anche annidati, es. conflitto sopra uno sheet) e ritorno del focus; scorciatoie mai esclusive; "Vai al contenuto".
- Focus non oscurato: `scroll-padding-bottom` ≥ altezza di barra di navigazione e barre d'azione sticky; `scroll-padding-top` ≥ altezza del banner di anteprima.
- Target ≥44×44 px per azioni primarie (minimo 24 px WCAG); spaziatura tra target.
- Etichette sempre visibili; errori inline con `aria-describedby`, riepilogo errori all'invio; nessun placeholder come etichetta.
- Stati non solo cromatici (icona + testo, anche per badge di riferimento e righe in anteprima); barre con testo equivalente; il conto alla rovescia non è una live region.
- Toast in `aria-live="polite"`; Annulla ≥8 s e, per le eliminazioni, sempre raggiungibile anche da "Eliminati di recente" (il toast è l'ultimo elemento del DOM e può non essere a portata di tastiera).
- Onboarding: titolo del passo con il focus a ogni cambio, progresso in testo; galleria temi come `radiogroup` con frecce.
- Banner di anteprima: `role="status"`, azioni in ordine di lettura; selettore scenario come gruppo radio.
- Nessuna azione solo-trascinamento; niente slider per importi; autenticazione senza test cognitivi (codice copiabile, `autocomplete="one-time-code"`).
- `lang="it"`, zoom al 200% senza scroll orizzontale, testo ridimensionabile, `prefers-reduced-motion`, `prefers-color-scheme`.
- Email: struttura a tabella con ruoli di presentazione, testo alternativo assente perché nessuna immagine informativa, contrasto del pulsante ≥4,5:1, versione solo testo.

## 9. Comportamento responsivo
- 360–430 px: riferimento (barra inferiore, sheet a pieno schermo parziale, carte impilate, banner di anteprima su due righe).
- 768 px: sidebar rail, due colonne in Home e Budget, confronto opzioni affiancato, selettore scenario come popover.
- 1024 px+: sidebar estesa, pannello dettaglio a destra su Percorso e Scelte.
- Landscape su telefono: nessuna barra fissa oltre la navigazione; `env(safe-area-inset-*)`.
- Email: colonna unica da 320 a 560 px.

## 10. Mockup (ASCII, 360 px)
```
Home                                  Percorso (anteprima)
+--------------------------------+    +--------------------------------+
|  Ciao Tony                     |    | Percorso      [Filtri] [Miei v]|
|  Se fosse il 3 set 2027        |    | Scadenze sul 3 set 2027        |
|  mancano 284 giorni (40 sett.) |    |   [puntina Riferimento provv.] |
|  [Riferimento · provvisorio]   |    | Scenario: 14 mag 2028 v        |
| +----------------------------+ |    +--------------------------------+
| | PROSSIMO PASSO             | |    | ANTEPRIMA: 14 mag 2028         |
| | Scegli la data             | |    |  nulla e' salvato              |
| | [ Confronta le date   ]    | |    |  14 scadenze cambiano          |
| +----------------------------+ |    |  [Esci] [Imposta come rif.] ...|
| Pagamenti in evidenza (0)      |    +--------------------------------+
| Novita': Jessica ha ...        |    | Adesso                         |
+--------------------------------+    | |[ ] Scegliere la data  12 mar |
|Home|Percorso|Scelte|Budget|Altro |    | |     -> 20 ago   (T)         |
+--------------------------------+    | Da recuperare (3)  >           |
                                      +--------------------------------+

Scelte > Data: carta scenario          Servizio in pausa
+--------------------------------+    +--------------------------------+
| 14 mag 2028   (Mamma Rosa)     |    |        L'app e' in pausa       |
| [puntina]                      |    | Il servizio gratuito si ferma  |
| Riferimento · provvisorio      |    | dopo qualche giorno senza uso  |
| calcolata dal 1 mag (periodo)  |    | e non riparte da solo.         |
| [Preferisco][Dubbioso]         |    | I dati non sono stati toccati. |
| [Anteprima][Imposta come rif.] |    | [ Riprova ]                    |
| [ Scegli questa data ]         |    | > Per chi gestisce l'app       |
+--------------------------------+    +--------------------------------+

Email: promemoria
+--------------------------------+
| roadmap2yes                    |
| Tra 7 giorni: Prenotare la     |
| location                       |
| Ciao Tony, tra una settimana   |
| (lun 30 novembre) scade ...    |
| [   Apri il Percorso   ]       |
| Non vuoi piu' questi           |
| promemoria? Disattivali.       |
+--------------------------------+
```

## 11. Controlli di accettazione visiva (F3)
**Layout e tema**
- [ ] Tutte le schermate a 360, 390, 768 e 1280 px: nessun scroll orizzontale, nessun contenuto coperto dalla barra fissa o dal banner di anteprima.
- [ ] Tutti i temi approvati (chiaro e scuro) su Home, Percorso, Budget, Scelte, Altro: nessun testo illeggibile, focus visibile, nessun colore letterale residuo, `accent` mai su zone `muted`; cambio tema senza ricarica e senza lampo al primo render (anche per il secondo partner).
- [ ] Galleria: ogni carta con il proprio tema e font, selezionabile da tastiera, anteprima provvisoria annullabile, nessun salto di font al "Usa questo tema".
- [ ] **LCP Home < 3 s** su 4G simulato a cache fredda con i font self-hosted; nessun peso eccessivo (al massimo 4 file woff2 per tema); nessun CLS visibile al passaggio al font del tema.
**Flussi**
- [ ] Tastiera: login → onboarding (8 passi, ripresa a metà) → completare un compito → scegliere e riaprire una decisione → registrare un pagamento.
- [ ] Onboarding: dati di entrambi i partner (nessuna data di nascita in alcun campo), invito inviato, errore su email duplicata, "Non lo so ancora" su ogni passo.
- [ ] **Riferimento**: badge provvisorio/definitivo in carta scenario, testata Percorso e Home; "Imposta come riferimento" con conferma, effetto e "Annulla"; "Torna automatico"; scomparsa delle azioni a decisione presa; stesso scenario "provvisorio" dopo la riapertura.
- [ ] **Anteprima**: selettore, banner fisso non chiudibile, passaggio libero tra scenari, nessuna scrittura (rete), stile distinto delle righe, "Esci", "Scegli questa data", periodo "calcolata dal primo giorno", ricaricamento e tasto indietro coerenti.
- [ ] Percorso: gruppi e soglie come §3.4 (con un orologio finto: scadute in evidenza max 3, "Da recuperare" ordinato per priorità, "Adesso" vuoto con il prossimo passo, compiti senza scadenza).
- [ ] Scenari multipli (data fissa e periodo), assegnatario Entrambi/partner, interruttore promemoria, opt-out raggiungibile da Altro e da link.
**Stati e pagine pubbliche**
- [ ] Ogni stato di §4 raggiungibile e verificato (vuoto, caricamento, errore, offline, conflitto, permesso negato).
- [ ] **Servizio in pausa e non raggiungibile**: le due pagine con testi diversi, nessun "si sta svegliando", visibili anche con il database spento (stack locale fermo) e senza lampo di tema.
- [ ] Invito: i 6 stati di §7.2 con azione; login con messaggio identico per email nota e sconosciuta; `/auth/conferma` e `/email/disattiva` (conferma, fatto, non valido).
**Email** (lette dal mail catcher locale)
- [ ] Le 5 email (accesso, invito, promemoria 7 giorni e giorno stesso, riepilogo) a 320 e 560 px, con immagini disattivate e in versione solo testo; contrasto del pulsante; link funzionanti; nessun contenuto utente non escapato (prova con nome contenente `<b>` e a-capo).
- [ ] Email di accesso e invito senza link di disattivazione; promemoria e riepilogo con link e intestazioni `List-Unsubscribe`; un solo promemoria al giorno per utente.
**Accessibilità e testi**
- [ ] Contrasti dei token verificati su rendering reale (testo ≥4,5:1, componenti ≥3:1) in chiaro e scuro; avvisi budget e ritardi comprensibili in scala di grigi (icona + testo).
- [ ] `prefers-reduced-motion` e zoom 200% rispettati; focus visibile e non oscurato nei bottom sheet con tastiera mobile aperta.
- [ ] Copy in italiano coerente col vocabolario fisso (§7.1); tutto in "tu", nessun "voi" rivolto all'utente; nessun "impegnato"; nessuna etichetta "sposo/sposa" nel testo corrente.

## 12. Decisioni F2 e punti chiusi
- Passo Tema: resta ultimo (AC12). Soglie delle fasi: §3.4. Categorie di promemoria: due (scadenze, riepilogo). Testo "servizio in pausa": §7.3. Data di nascita: rimossa ovunque.
- Layout del confronto opzioni: carte impilate con "Confronta 2" su mobile (AC17), colonne da 768 px.
- Suggerimenti per stile: una frase statica per etichetta nel riepilogo onboarding (nessun effetto sul Percorso in R1).
- Icone: Lucide (già in shadcn), sempre con testo o `aria-label`.
- Aperti, da decidere al Gate B dallo sviluppatore: quali dei 12 temi approvare (P8); nome dell'app (Q2); riformulazione di AC39 (Q1).
