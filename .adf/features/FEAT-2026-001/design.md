# FEAT-2026-001 — R1 Fondamenta, onboarding, timeline e budget: UX/UI design

> **BOZZA F1 (round 2)** — designer. Aggiornata con le risposte dello sviluppatore (sezione "F1 developer answers" in `log.md`): catalogo di 12 temi, onboarding con i dati di entrambi i partner, scenari di data multipli, assegnatari e promemoria email, tono "tu". Riferimenti: DES-n nel log.

## 1. Principi
1. **Una cosa alla volta**: ogni schermata ha un'azione principale evidente; nulla è deciso, quindi la guida viene prima dei dati.
2. **Calma, non allarme** (e tono informale, da amici): ritardi e sforamenti sono comunicati con tono caldo, icona + testo, niente rosso pieno.
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
| Altro | Impostazioni (profilo tuo e del partner, risposte onboarding, tema, promemoria email), invito partner, esportazione, aree future | R3 Invitati, R5 Tavoli, R6 Giorno live |

Da 768 px: sidebar sinistra con le stesse voci (rail icone + etichette da 1024 px); contenuto max 1120 px, griglia 12 colonne. Azione di aggiunta rapida (+) in basso a destra su Percorso e Budget; nessuna FAB globale.

## 3. Flussi principali
### 3.1 Accesso e invito (DES-1)
1. Login: campo email → "Mandami il link" → schermata "Controlla la posta" con campo codice a 6 cifre e "Rimanda il link (tra 30 s)". Registrazione chiusa: entra solo chi è stato invitato o è il primo partner.
2. Chi ha un invito pendente entra direttamente nello spazio che lo ha invitato, senza mai vedere "crea spazio". Chi non ha invito né spazio vede "Questo spazio è su invito" (nessun dato, nessuna creazione).
3. Dopo l'onboarding l'invito al secondo partner parte dall'email inserita al passo "Partner" (vedi 3.2); da Altro > "Invito" si vede lo stato (In attesa / Accettato / Scaduto), con "Rimanda" e "Revoca" e la scadenza.
4. Errori: link scaduto/usato, email diversa da quella invitata, invio non riuscito → messaggio chiaro + azione.

### 3.2 Onboarding (DES-2)
Un solo partner (chi è entrato per primo) compila per entrambi; l'altro riceve l'invito, entra e può correggere tutto da Altro.
Passi, una domanda per schermata, progresso testuale "Passo 3 di 8", salvataggio a ogni passo, ripresa dall'ultimo non completato:
1. **Tu**: etichetta ruolo (Sposo / Sposa / Altro: scrivi tu), nome, cognome, data di nascita. L'email è quella del login (non modificabile qui).
2. **Il tuo partner**: stessa scheda (etichetta, nome, cognome, **email**, data di nascita). Sotto, testo: "Gli mandiamo un invito per entrare con te" con interruttore "Invia l'invito alla fine" (attivo di default; si può rimandare). Se l'email coincide con la tua: errore inline.
3. **Rito**: Civile / Religioso cattolico con effetti civili / Simbolico, più "Non lo so ancora". Cambia le tappe proposte.
4. **Data (scenari)**: lista di scenari, ognuno **data fissa** (es. quella imposta dalla location) o **periodo** (da mese/anno a mese/anno), con etichetta facoltativa; "Aggiungi un altro scenario" (nessun limite pratico, tipico 1–4); si può restare senza scenari. Avviso non bloccante per date prima del 3/9/2027 (BR3).
5. **Invitati**: fasce (fino a 50, 50–80, 80–120, oltre, non lo so).
6. **Budget** totale (facoltativo).
7. **Stile e luogo**: etichetta di stile + nota libera, regione/comune.
8. **Tema**: galleria dei temi approvati con **anteprima dal vivo** (vedi 5.4); si cambia quando vuoi da Altro > Aspetto.
Riepilogo "Ecco il tuo percorso" → Home. Il tema è applicato già dal passo 8; per vederne l'effetto subito, il passo 8 può essere spostato in testa (passo 1) se lo sviluppatore preferisce un onboarding già "vestito" (da decidere in F2).

### 3.3 Home e "Prossimo passo" (DES-3)
Card principale (1) + secondarie (max 2) con ordine: decisione bloccante → compiti scaduti → pagamenti ≤14 gg → compiti ≤30 gg. Mostra solo ciò che riguarda **te** più ciò che è di entrambi, con interruttore "Mostra anche i compiti di {partner}". Conto alla rovescia (giorni e settimane; "provvisoria" se la data non è scelta), pagamenti in evidenza, "Novità dall'ultimo accesso".

### 3.4 Percorso (DES-4, 5, 6)
Sezioni: Adesso · Da recuperare (tappe in ritardo con scadenza "suggerita") · Prossimi 3 mesi · Più avanti · Fatti. Riga compito: checkbox 44 px, titolo, scadenza relativa ("tra 3 settimane"), categoria, assegnatario (**Entrambi** / partner A / partner B, con iniziali + nome; mai solo colore). Nel form compito il campo "Chi se ne occupa" è un gruppo di 3 opzioni (default Entrambi) e subito sotto "Promemoria via email" (interruttore, attivo di default, "ricordamelo 7 giorni prima e il giorno stesso"; per i compiti di Entrambi il promemoria va a tutti e due, per quelli assegnati solo alla persona interessata). Tocco → dettaglio in sheet (consiglio, note, modifica, elimina con Annulla). Anteprima scenario: banner fisso "Anteprima — nulla è salvato".

### 3.5 Scelte (DES-7, 8)
Elenco decisioni (stato: Aperta / Presa / Da rivedere). Dettaglio: domanda, opzioni come carte (campi leggeri, pro/contro con icone +/−, reazioni dei partner), "Confronta 2", "Scegli", opzioni scartate collassate, storico cronologico in sola lettura con "Aggiungi nota". Riapertura: sheet con motivo obbligatorio. Conferma di scelta con riepilogo della conseguenza ("La timeline si ricalcolerà su questa data").

### 3.6 Budget (DES-9, 10)
Riepilogo: totale (con "Modifica" + motivo opzionale e "Storico"), non assegnato, barra complessiva. Elenco categorie (una barra + un numero chiave), dettaglio categoria → voci (Previsto / Concordato / Annullata) → pagamenti (acconto/saldo/altro, scadenza, stato). Vista "Prossimi pagamenti" in ordine di scadenza. Avvisi: icona + testo caldo, ambra/terracotta.

### 3.7 Altro
Profilo (tuo e del partner: etichetta, nome, cognome, email di contatto, data di nascita, tutto modificabile), Invito, Impostazioni nozze (rito, scenari di data, invitati, stile; modifiche → "Suggerimenti da rivedere" in Percorso), **Promemoria email** (interruttore generale per te, per categoria: compiti miei, scadenze di entrambi, pagamenti; ogni email ha il link "Non voglio più questi promemoria" — opt-out per persona, sempre disponibile), **Aspetto** (tema + chiaro/scuro/sistema), esportazione (JSON/CSV), informazioni.

## 4. Elenco schermate e stati
Legenda: C=caricamento, V=vuoto, E=errore, S=successo, P=permesso negato. "—" non applicabile.

| Schermata | C | V | E | S | P |
|---|---|---|---|---|---|
| Login / codice | spinner sul pulsante | — | link scaduto, invio fallito, limite email | "Controlla la posta" | "Questo spazio è su invito" |
| Invito partner | skeleton | "Nessun invito: invita Jessica" | email non valida / già invitata | stato "In attesa" + toast | solo partner |
| Onboarding passi (persona, partner, rito, scenari, tema) | — | risposta "non lo so" valida; nessuno scenario ammesso | salvataggio fallito con bozza locale; email partner uguale alla tua o non valida | riepilogo + invito inviato | — |
| Galleria temi | skeleton carte | — | font non caricato: tema applicato con font di riserva | tema applicato (toast) | — |
| Impostazioni promemoria | skeleton | — | salvataggio fallito | toast | solo sulle proprie preferenze |
| Home | skeleton card | "Scegli la data" come primo passo; "Budget da definire" | card errore con "Riprova" | toast su completamento | — |
| Percorso | skeleton righe | "Nessun compito: aggiungi il primo" | riga con "Riprova" | snackbar + Annulla | — |
| Anteprima scenario | skeleton | nessuno scenario: invito ad aggiungerne uno | — | — | — |
| Scelte (elenco/dettaglio) | skeleton carte | "Nessuna opzione: aggiungi la prima" | errore inline | momento "Data scelta" sobrio | — |
| Riapertura | — | — | motivo mancante (errore inline) | toast | — |
| Budget riepilogo/categoria | skeleton barre | "Budget da definire" + CTA | errore importo inline, conflitto | toast salvato | — |
| Pagamenti | skeleton | "Nessun pagamento in programma" | errore salvataggio | toast | — |
| Esportazione | barra di avanzamento | — | "Non riesco a preparare il file" | download avviato | — |
| Globali | — | — | Offline (banner), DB in pausa (pagina dedicata), conflitto BR9 (dialog) | — | sessione scaduta → login |

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

Note sui font: titoli sempre ≥24 px per le serif sottili (Cormorant, Cormorant Garamond, Bellefair, Poiret One, Instrument Serif); Poiret One solo per titoli e numeri grandi, mai per frasi; Gloock e DM Serif Display hanno un solo peso (nessun grassetto sintetico). Self-hosting con `next/font` solo per il tema attivo (gli altri caricano il font nell'anteprima, on demand) per rispettare LCP < 3 s.

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
- Ogni tema è un set di variabili CSS su `:root[data-theme="<id>"]` (chiaro) e `:root[data-theme="<id>"][data-mode="dark"]` (scuro); i componenti shadcn leggono solo i token, mai colori letterali. Nessun ricaricamento pagina al cambio.
- Font: `--font-heading` e `--font-body` impostati dal tema; caricati con `next/font` (self-hosted, `display: swap`).
- Salvataggio: `theme_id` nelle impostazioni del matrimonio (condiviso). Il tema scelto è applicato già al primo render lato server (attributo `data-theme` nell'HTML) per evitare il lampo di tema sbagliato. Chiaro/scuro: preferenza locale con default `prefers-color-scheme`.
- Anteprima dal vivo (onboarding e Aspetto): galleria a carte (mini-schermata Home con titolo serif, pulsante, barra budget, carta compito) per ogni tema; toccare una carta applica subito il tema all'intera interfaccia in modo **provvisorio** con "Usa questo tema" / "Annulla"; interruttore chiaro/scuro nell'anteprima; carte selezionabili con tastiera (radio group, `aria-checked`), nome del tema in testo, non solo l'aspetto.
- Il contrasto è garantito dai token (nessun colore personalizzato dall'utente in R1).
- Motivi: scelta emotiva e personale dei due partner; tutto resta gratuito (nessuna immagine), peso minimo (variabili CSS + 2 font per tema).

### 5.5 Movimento e forma (comuni a tutti i temi)
Transizioni 150–250 ms ease-out; sheet con slide-up; spunta del checkbox con micro-animazione; un solo momento "festa" per decisione presa (≤1 s); con `prefers-reduced-motion` dissolvenza o statico; mai animazioni infinite. Tipografia: titoli 28/34 e 22/28, corpo 16/24 (input ≥16 px), `tabular-nums` per gli importi.


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
| Galleria temi con anteprima | RadioGroup, Card | **ThemeGallery**, **ThemeProvider** (variabili CSS) |
| Scheda persona (etichetta, nome, cognome, email, nascita) | Input, Select, Label | **PersonForm** |
| Scenari di data (fissa/periodo, lista) | Tabs/ToggleGroup, Input | **DateScenarioList** |
| Assegnatario + promemoria | RadioGroup, Switch | **AssigneeField**, **ReminderToggle** |

## 7. Copy (linee guida e campioni)
Tono: **informale, "tu"**, caldo e diretto, come un amico che ti aiuta; ti rivolgi sempre alla persona che ha fatto l'accesso ("Ciao Tony", "hai completato"), mai al "voi". Per il partner o per cose di coppia usa il nome ("Jessica ha scelto la location", "il vostro matrimonio" solo come nome dell'oggetto). Frasi brevi, niente burocratese, niente emoji nei testi di sistema (ammesse poche in momenti di festa), mai colpevolizzare; stati vuoti con una frase + un'azione. Le etichette di ruolo (Sposo/Sposa/altra scelta dalla persona) non compaiono mai nel testo corrente: si usano i nomi.
| Dove | Testo |
|---|---|
| Saluto Home | "Ciao Tony, ecco cosa ti aspetta oggi" |
| Home, senza data | "Il primo passo: scegli la data" |
| Conto alla rovescia provvisorio | "Se fosse il 3 settembre 2027: mancano 284 giorni" |
| Onboarding, passo 1 | "Iniziamo da te: come ti chiami?" |
| Onboarding, passo 2 | "Ora il tuo partner. Gli mandiamo un invito per entrare con te." |
| Onboarding, "non so" | "Non lo so ancora" |
| Scenari di data | "Hai più opzioni? Aggiungile pure: una data fissa o un periodo" |
| Tappa in ritardo | "Di solito si fa prima, ma hai ancora tempo: ecco come recuperare" |
| Stato vuoto compiti | "Ancora nessun compito. Aggiungi il primo." |
| Assegnatario | "Chi se ne occupa? Entrambi / Tony / Jessica" |
| Promemoria (interruttore) | "Ricordamelo per email, 7 giorni prima e il giorno stesso" |
| Email promemoria, piè di pagina | "Non vuoi più questi promemoria? Disattivali con un tocco." |
| Stato vuoto budget | "Budget da definire. Parti da una cifra indicativa: potrai cambiarla." |
| Riapertura | "Perché vuoi riaprire questa scelta?" (obbligatorio) |
| Conflitto | "Jessica ha modificato questo elemento 2 minuti fa." |
| Sforamento | "Sei oltre di € 1.200 su Catering." |
| Errore importo | "Inserisci un importo in euro, ad esempio 1.500,00." |
| Errore email partner | "Questa è la tua email: inserisci quella del tuo partner." |
| Offline | "Sei offline. Le modifiche non sono ancora salvate." |
| Avviso tappe burocratiche | "Indicativo: verifica sempre con il comune o la parrocchia." |
| Accesso su invito | "Questo spazio è su invito. Chiedi a chi te l'ha condiviso di mandarti un invito." |
| Tema | "Scegli lo stile della tua app. Lo puoi cambiare quando vuoi." |
Vocabolario fisso: Previsto, Concordato, Pagato, Ancora da pagare, Assegnato; Scelte (decisioni), Percorso (timeline), Scenario (data/periodo candidato); Entrambi (assegnatario condiviso).

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
|  Ciao Tony                     |    | Percorso      [Filtri] [Miei v]|
|  Se fosse il 3 set 2027        |    | ANTEPRIMA: 3 set 2027 - nulla  |
|  mancano 284 giorni (40 sett.) |    |   e' salvato  [Esci][Scegli]   |
|  provvisoria                   |    | Adesso                         |
| +----------------------------+ |    | [ ] Scegliere la data   (T)    |
| | PROSSIMO PASSO             | |    | [ ] Fissare il budget   (J)    |
| | Scegli la data             | |    | Da recuperare (suggerita)      |
| | [ Confronta le date   ]    | |    | [ ] Prenotare location         |
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
- [ ] Tutti i 12 temi (chiaro e scuro) applicati alle schermate chiave: nessun testo illeggibile, focus visibile, nessun colore letterale residuo; il cambio tema non ricarica la pagina e senza lampo al primo render.
- [ ] Anteprima dal vivo: provvisoria, annullabile, selezionabile da tastiera.
- [ ] Onboarding con i dati di entrambi i partner, invito inviato, errore su email duplicata.
- [ ] Scenari multipli (data fissa e periodo) creabili e modificabili; assegnatario Entrambi/partner e interruttore promemoria; opt-out email raggiungibile.
- [ ] Tutto il testo è in "tu"; nessun "voi" rivolto all'utente.

## 12. Aperti per F2
Decidere se il passo Tema va in testa all'onboarding; chiusura dei temi approvati al Gate B; layout dettagliato del confronto opzioni; contenuti dei suggerimenti per stile; icone (Lucide, già in shadcn).
