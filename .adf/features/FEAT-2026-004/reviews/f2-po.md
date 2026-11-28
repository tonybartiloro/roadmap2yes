# FEAT-2026-004 — F2 challenge del product-owner

Verdetto: **il piano copre AC1-AC14 e BR1-BR12**, senza funzioni di R-07 né capacità nuove (`rsvp_responses.source` prepara R-07 ma nessun percorso di scrittura della coppia esiste). Nessuna obiezione bloccante. Q-P1, Q-P2, Q-P3 e P4 non contraddicono decisioni dello sviluppatore: si possono accettare al Gate B, con il testo di AC3 e AC12 da allineare (PO-3, PO-5).

| ID | Gravità | Tema |
|---|---|---|
| PO-1 | should | AC11 "erano già cambiate": il contratto di `rsvp_submit` non permette di rilevarlo |
| PO-2 | should | `undo_guest_import`: "coperto dal link del suo gruppo" cambia Annulla importazione di R-03 |
| PO-3 | note | Q-P1 (AC12): accettata |
| PO-4 | note | Q-P2 (AC10, AC6): accettata, con un test sugli invii |
| PO-5 | note | Q-P3 (AC3): accettata |
| PO-6 | note | P4 (D4): corretta in `brief.md` |
| PO-7 | note | Documentazione e avvisi: niente scadenza delle risposte; avviso "data non scelta" anche su "Crea link per tutti" |

## PO-1 — AC11 "Le risposte di {nome} erano già cambiate" (should)
- **Evidenza.** AC11 (brief) e DES-14: dopo l'invio, se la risposta di una persona era stata cambiata da qualcun altro dopo l'apertura della pagina, l'invitato lo deve sapere. `rsvp_submit` riceve solo `[{id, status, diet, diet_note}]` e fa upsert "vince l'ultimo" (plan, RPC pubbliche): lo stato salvato è sempre quello inviato, quindi il confronto "salvato ≠ proprio" non scatta mai. Eppure il test e2e "due schede sulla stessa persona → erano già cambiate" (Test plan) lo presuppone.
- **Proposta.** Il modulo invia per ogni persona lo stato visto all'apertura (per esempio `answered_at` o `version` di `rsvp_responses`); `rsvp_submit` salva comunque (vince l'ultimo, nessun blocco) e restituisce gli id per cui la base era cambiata, così la pagina mostra la frase. Significato di AC11 da usare in F3: "la tua scelta è salvata; la risposta di {nome} era stata cambiata da qualcun altro dopo che hai aperto la pagina". Nessuna domanda per lo sviluppatore: è l'intento di AC11.

## PO-2 — Annulla importazione e link di gruppo (should)
- **Evidenza.** Plan, Dati: `undo_guest_import` "salta chi ha una risposta o è coperto da un link, personale o del suo gruppo". Chi importa persone in un gruppo esistente che ha già un link (caso normale dopo R-04: "Famiglia Rossi" + due nomi dimenticati) e tocca "Annulla importazione" entro 8 s se le ritroverebbe nella lista. Cambia il comportamento di R-03 (AC20; `docs/functional/invitati.md`, "Annulla importazione rimuove le persone importate che non hai ancora modificato né messo a un tavolo") senza che il brief lo chieda.
- **Proposta.** Saltare solo chi ha una risposta, un link personale o compare nella fotografia di un link condiviso (`rsvp_link_people`): sono i soli casi in cui c'è qualcosa da perdere. La sola copertura da parte del link del gruppo non basta. Se l'architetto ritiene necessaria la regola larga, va scritta in `invitati.md` (Documentation plan) e diventa una domanda per lo sviluppatore (risposta proposta: regola stretta).

## PO-3 — Q-P1, AC12 senza "Crea un nuovo link" dopo la scadenza (note)
- **Evidenza.** D7: il link scade 30 giorni dopo la data scelta, per tutto il matrimonio; un link nuovo nascerebbe già scaduto. AC12 promette "Crea un nuovo link".
- **Posizione.** Accettata: l'errore è nel testo dell'AC, non cambia il risultato voluto da D7. Al Gate B AC12 diventa: "il foglio del link mostra prima 'Scade il {data}' e poi 'Scaduto il {data}', senza azioni di rigenerazione; se la data scelta cambia, i link non revocati tornano a funzionare" (coerente con BR4).

## PO-4 — Q-P2, 429 solo sull'apertura (note)
- **Evidenza.** AC10 chiede 429 + `Retry-After` oltre i limiti; una server action non imposta lo stato HTTP.
- **Posizione.** Accettata: per l'invitato conta il messaggio "Troppi tentativi: riprova tra 15 minuti", che resta identico. Al Gate B AC10 precisa "429 all'apertura; sull'invio, lo stesso messaggio nel modulo". Per AC6 serve lo stesso principio: un invio con link revocato, scaduto o senza destinatario deve dare la **stessa** pagina neutra per tutte le cause (stato e corpo identici tra loro, anche se 200). Proposta: aggiungere il caso al test di accettazione o all'e2e (oggi il 404 identico è provato solo sul GET).

## PO-5 — Q-P3, id e categoria nella funzione pubblica (note)
- **Evidenza.** AC3: "esattamente questi dati più l'identificativo del tema".
- **Posizione.** Accettata: l'id è opaco e serve all'invio; la categoria delle persone del proprio destinatario ("Bambino", "Neonato") è già nella design e non è un dato di contatto né sanitario. Al Gate B AC3 aggiunge "più id e categoria di ogni persona"; il test pgTAP resta sull'insieme esatto delle chiavi.

## PO-6 — P4, rotazione di `RSVP_LINK_SECRET` (note)
- **Evidenza.** D4 nel brief diceva "ruotarlo invalida tutti i link". Il DB confronta lo sha256 del token salvato, quindi i link già condivisi continuano a funzionare; dopo la rotazione la coppia non li può più ricopiare (`getLinkUrl` → "va rigenerato").
- **Posizione.** Non contraddice la decisione (il segreto è approvato; l'invalidazione era una conseguenza descritta, ora più favorevole). Ho corretto il testo di D4 in `brief.md` come correzione di fatto. Da dire allo sviluppatore al Gate B in una riga: "ruotare il segreto non spegne i link; per spegnerli si revocano tutti, poi 'Crea link per tutti'".

## PO-7 — Documentazione e avviso data (note)
- **Documentazione.** Documentation plan, `conferme-di-presenza.md`: "scadenza" deve indicare solo la scadenza dei link (data + 30 giorni); la scadenza delle risposte è R-07 e non va descritta come esistente.
- **Avviso.** BR8 vuole l'avviso "data non ancora scelta" alla creazione dei link; T8 lo mette nel foglio del singolo link. Proposta: lo stesso avviso nella conferma di "Crea link per tutti (N)" (T9).
- **WhatsApp.** AC1 "messaggio modificabile": con `wa.me/?text=` il testo si modifica in WhatsApp prima dell'invio; va bene così, a meno che la design finale preveda un campo nel foglio (allora T8 lo copre).
