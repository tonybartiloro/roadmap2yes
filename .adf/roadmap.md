# roadmap2yes — roadmap

<!-- Owner: product-owner with the architect. Read and updated by the ADF CLI (adf roadmap ...):
     keep the table columns and the "Approval:" line as they are.
     Approving the roadmap approves the requirements of every item at high level (gate A for its features);
     each feature still needs its plan approved (gate B). Adding or changing items needs the developer's approval again. -->

Approval: approved 2026-11-25 by tonybartiloro

Vision: `.adf/project.md → What this project is` · Stack decision: [ADR-0001](../docs/adr/0001-stack-auth-ambienti.md)

## Items

<!-- Size ≤ M (split anything bigger). Status: todo | in-progress | done | dropped.
     Depends on: comma-separated item IDs, or "—". R-00 is always the foundations (walking skeleton). -->

| ID | Title | Size | Depends on | Status | Feature |
|---|---|---|---|---|---|
| R-01 | Fondamenta, onboarding guidato, Percorso e budget | L | — | done | FEAT-2026-001 |
| R-02 | Guida d'uso nell'app | S | R-01 | in-progress | FEAT-2026-002 |
| R-03 | Invitati: anagrafica, gruppi/famiglie, tavoli facoltativi | L | R-01 | todo | |
| R-04 | Conferme di presenza (RSVP) con link personale | L | R-03 | todo | |
| R-05 | Lista nozze | M | R-01 | todo | |

Le voci R-02…R-05 formano insieme la release "R2", approvata dallo sviluppatore il 2026-11-25. Fornitori, scheda location e confronto data×location (indicati come "R2" nel brief di FEAT-2026-001) sono rimandati a dopo questa release. R-03 e R-04 sono L per il rischio (dati personali di terzi, pagina pubblica senza login), non per la quantità di lavoro.

## Details

### R-01 — Fondamenta, onboarding guidato, Percorso e budget
- **Goal:** prima versione usabile dell'app privata della coppia.
- **Scope:** vedi `.adf/features/FEAT-2026-001/brief.md`. In produzione dal 2026-11-24 (PR #1).

### R-02 — Guida d'uso nell'app
- **Goal:** la coppia trova dentro l'app come si usa ogni sezione, senza andare sul repository.
- **Scope:** voce di menu "Guida" che mostra le pagine della documentazione funzionale (`docs/functional`), con indice e collegamenti tra le pagine; il contenuto viene dagli stessi file Markdown, così la guida resta allineata a ogni aggiornamento della documentazione (F4 delle feature successive).
- **Main acceptance criteria (high level):** la Guida è raggiungibile dal menu su mobile e desktop; mostra l'indice e ogni pagina con formattazione leggibile in tutti i temi; i collegamenti tra pagine restano nella Guida; è visibile solo agli utenti autenticati.
- **Out:** ricerca nel testo, guida contestuale nelle singole schermate, modifica dei contenuti dall'app.

### R-03 — Invitati: anagrafica, gruppi/famiglie, tavoli facoltativi
- **Goal:** la coppia costruisce e mantiene la lista degli invitati e sa quante persone aspettarsi.
- **Scope:** anagrafica degli invitati (nome, contatti facoltativi, lato sposo/sposa o entrambi, adulto/bambino, note come allergie); gruppi/famiglie (nuclei) che raggruppano più persone; conteggi e riepiloghi; tavoli facoltativi (si possono creare e assegnare, ma l'app funziona anche senza); importazione/esportazione semplice. Accesso solo alla coppia (RLS).
- **Main acceptance criteria (high level):** aggiungere, modificare, eliminare invitati e gruppi; filtri e conteggi per lato, gruppo, categoria; assegnazione facoltativa ai tavoli con capienza; i dati sono inclusi nell'esportazione; nessun dato reale nel repository.
- **Out:** RSVP (R-04), sito pubblico, disposizione grafica della sala.

### R-04 — Conferme di presenza (RSVP) con link personale
- **Goal:** ogni invitato (o gruppo) conferma la presenza da un link personale, e la coppia vede le risposte in tempo reale.
- **Scope:** link personale non indovinabile per invitato o gruppo, condiviso a mano (copia link / WhatsApp) finché le email sono spente; pagina pubblica senza login con i dati minimi del matrimonio, risposta per ogni persona del gruppo (sì/no, eventuali preferenze alimentari), modifica entro una scadenza; revoca e rigenerazione del link; stato delle risposte nella lista invitati.
- **Main acceptance criteria (high level):** un link mostra solo i dati del proprio invitato/gruppo; link revocato o scaduto non funziona; la coppia vede chi ha risposto e chi no; protezione contro abusi (limiti, nessuna indicizzazione).
- **Out:** invio automatico via email/SMS finché Resend non è attivo, sito pubblico completo del matrimonio.

### R-05 — Lista nozze
- **Goal:** la coppia gestisce la propria lista nozze e tiene traccia dei regali ricevuti.
- **Scope:** voci della lista (regalo, link, prezzo indicativo, quote), stato dei regali, ringraziamenti; visibilità agli invitati da decidere in F1 (se pubblica, passa dalla pagina di R-04 e dipende da R-04).
- **Main acceptance criteria (high level):** aggiungere, modificare, eliminare voci; segnare un regalo come ricevuto e da chi; riepilogo; nessun pagamento gestito dall'app.
- **Out:** pagamenti online, integrazione con negozi.
