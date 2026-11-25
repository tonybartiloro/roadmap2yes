# FEAT-2026-003 — Invitati: anagrafica, gruppi/famiglie, tavoli facoltativi: requirements brief

| Request | Ticket | Size | Status |
|---|---|---|---|
| "gestione invitati (anagrafica, gruppi/famiglie, tavoli opzionali)" (roadmap R-03) | — | L | in discussion |

## Goal
La coppia costruisce e mantiene la lista degli invitati (persone, nuclei, tavoli facoltativi) e vede sempre quante persone aspettarsi, per scegliere location e catering. Il modello dati non deve bloccare R-04 (RSVP con link personale e stato di presenza per persona/gruppo).

## Scope
- **In:** anagrafica invitato; gruppi/famiglie; tavoli facoltativi con capienza; conteggi e filtri; eliminazione con "Annulla", "Eliminati di recente" ed "Elimina definitivamente"; importazione da CSV/testo ed esportazione CSV; inclusione nell'esportazione completa; area di permessi `guests`; voce di menu; pagina in `docs/functional`; ADR-0002 sui dati personali degli invitati (architetto).
- **Out:** RSVP, link personali, stato di presenza (R-04); pagina pubblica; disposizione grafica della sala; invio messaggi; costi per persona nel budget; accesso di famiglia/planner; import da rubrica; file .xlsx.
- **Costruzione a passi (una sola feature):** 1 anagrafica + gruppi + conteggi + filtri + eliminazione (AC1-AC13); 2 tavoli (AC14-AC16); 3 import/export (AC17-AC22). Tavoli e import possono slittare senza bloccare il resto.

## Users and permissions
| Role | Can | Cannot |
|---|---|---|
| partner (Tony, Jessica) | leggere/scrivere invitati, gruppi, tavoli; eliminare definitivamente | — |
| family, planner (futuri) | nulla (nessun permesso `guests`); la voce di menu è nascosta, l'URL diretto mostra la schermata "su invito" esistente | vedere o modificare invitati |
| non autenticato | nulla | qualsiasi accesso, nessun `anon` mai |

## User stories
- Come partner, voglio aggiungere invitati uno a uno, per famiglia o incollando un elenco, per non ribattere la lista che ho già.
- Come partner, voglio sapere quanti adulti e bambini ho in totale e per lato, per dimensionare location e catering.
- Come partner, voglio dividere gli invitati in tavoli con capienza, solo se mi serve.
- Come partner, voglio recuperare un invitato eliminato per errore, o cancellarlo davvero.

## Acceptance criteria
| # | Criterion |
|---|---|
| AC1 | Given un partner autenticato, when apre "Invitati" (320 px e desktop), then vede riepilogo, lista e azioni; senza invitati vede uno stato vuoto con "Aggiungi invitato" e "Importa". |
| AC2 | Given il modulo invitato, when inserisce nome (obbligatorio, max 80), cognome, adulto/bambino (predefinito adulto), lato, telefono, email, note (max 500) e salva, then compare in lista; nome vuoto è rifiutato con messaggio in italiano; telefono: solo `+`, cifre, spazi e `()-./`, 6-20 caratteri; email con regole standard; campi `tel`/`email` con tastiera adatta. |
| AC3 | Given il modulo, when sceglie "Salva e aggiungi un altro", then salva e riapre il modulo mantenendo tipo, lato, gruppo e tavolo, con il focus sul nome. |
| AC4 | Given il campo lato, then le opzioni sono "{partner A}", "{partner B}", "Entrambi", "Non indicato" (predefinito); il valore salvato è A/B/entrambi/vuoto, non il nome. |
| AC5 | Given i gruppi, when usa "Nuova famiglia" (nome + più persone in un solo salvataggio), "Nuovo gruppo…" dal modulo invitato o "Aggiungi persona" dal gruppo, then gruppo e persone sono creati; un invitato ha al massimo un gruppo o nessuno; la lista mostra i gruppi con adulti/bambini (chiusi di default oltre 100 righe). |
| AC6 | Given la modifica di invitato, gruppo o tavolo, when salva su dati cambiati nel frattempo dall'altro partner, then compare il dialogo di conflitto esistente (FEAT-2026-001 AC40); le assegnazioni rapide (scelta gruppo/tavolo, azioni di massa) sono "ultimo salvataggio vince". |
| AC7 | Given invitati selezionati (selezione multipla), when sceglie "Assegna a gruppo", "Assegna a tavolo" o "Elimina", then l'azione si applica a tutti, con "Annulla". |
| AC8 | Given il riepilogo su una riga, then mostra totale persone, adulti, bambini; "Per lato" è comprimibile e dà gli stessi tre numeri per A, B, Entrambi, Non indicato; gli invitati eliminati non sono mai contati. Con filtri attivi il riepilogo dice "12 di 42 persone" e i numeri per lato restano sul totale. |
| AC9 | Given i filtri (lato, gruppo, adulto/bambino, tavolo, "Senza gruppo", "Senza tavolo", ricerca per nome; in uno sheet con chip dei filtri attivi), when li applica, then la lista mostra solo i corrispondenti; tutto usabile da tastiera e lettore di schermo. |
| AC10 | Given un invitato eliminato, then compare "Annulla" per almeno 8 s e resta in "Eliminati di recente" ripristinabile; lo stesso per gruppi (i membri restano e diventano "Senza gruppo"; il ripristino li rimette dentro) e tavoli (idem "Senza tavolo"). |
| AC11 | Given "Eliminati di recente", when sceglie "Elimina definitivamente" (uno) o "Svuota" (tutti), con conferma, then i dati personali sono cancellati dal database e non compaiono in nessuna esportazione; non esiste scadenza automatica. |
| AC12 | Given il matrimonio, when i vivi più gli eliminati di recente raggiungono 1000 invitati, then un nuovo inserimento o import è rifiutato con messaggio in italiano ("Limite di 1000 invitati: elimina definitivamente quelli che non servono"); con 1000 invitati le liste e i conteggi restano completi e corretti. |
| AC13 | Given un utente non partner, un futuro family/planner o `anon`, when legge o scrive invitati, gruppi o tavoli (app o API), then RLS lo nega (pgTAP); nessun dato personale degli invitati finisce nell'audit log né in "Novità" della Home (pgTAP: nome, telefono, email, note assenti); il seed ha solo nomi finti. |
| AC14 | Given i tavoli, when ne crea uno (nome obbligatorio, capienza intera 1-50 facoltativa) e vi assegna persone, then mostra occupati/capienza; un invitato siede al massimo a un tavolo. |
| AC15 | Given un tavolo, when usa "Aggiungi un gruppo intero", then i membri sono assegnati; se qualcuno è già seduto altrove compare una conferma che lo dice. |
| AC16 | Given un tavolo pieno, when assegna una persona in più, then è consentito ma si vede "Oltre la capienza di N" in testo (non solo colore) sul tavolo e nel riepilogo. Given nessun tavolo, then la scheda "Tavoli" mostra un vuoto calmo con "Crea tavolo", e filtro, campo e conteggi sui tavoli compaiono solo quando ne esistono. |
| AC17 | Given "Importa", when incolla testo o carica un CSV (UTF-8, con ripiego Windows-1252, quindi "Niccolò" resta corretto; separatore `;` o `,` rilevato; intestazione facoltativa; colonne nome, cognome, tipo, lato, gruppo, telefono, email, note), then vede un'anteprima a carte. |
| AC18 | Given le righe, then `tipo` ∈ {adulto, bambino, vuoto = adulto} e `lato` ∈ {nome partner A, nome partner B, A, B, entrambi, vuoto} senza distinguere maiuscole; `gruppo` = gruppo esistente con lo stesso nome (senza distinguere maiuscole e spazi) o nuovo; una sola colonna = intero testo nel nome. Valori sconosciuti, nome vuoto, telefono/email non validi = riga con errore; duplicati (stesso nome e cognome senza maiuscole, spazi e accenti) = solo avviso. |
| AC19 | Given l'anteprima, when conferma, then importa le righe valide e dichiara quelle saltate (D2); max 500 righe per importazione; "Torna indietro" conserva il testo; se annulla non viene salvato nulla. |
| AC20 | Given un'importazione appena fatta, then compare "Annulla importazione" per almeno 8 s che rimuove tutto ciò che ha creato (invitati e gruppi nuovi). |
| AC21 | Given "Esporta CSV" (in Invitati e in Opzioni > Esportazione, sempre tutti gli invitati con testo esplicito, anche con filtri attivi), then scarica un CSV con gli stessi campi dell'import, con le formule neutralizzate come nell'esportazione esistente; reimportandolo si ottengono gli stessi dati (test di andata e ritorno, telefoni con `+` inclusi). |
| AC22 | Given l'esportazione completa dell'app, then include invitati, gruppi e tavoli (gli eliminati di recente marcati come tali). |

## Business rules and edge cases
| # | Rule / case | Source |
|---|---|---|
| BR1 | Un conteggio è per persona (una riga = una persona); "bambino" è scelta manuale, nessuna soglia di età. Totale = adulti + bambini. "Senza lato" = lato non indicato. | proposta, ARC-11 |
| BR2 | Il gruppo è solo un'etichetta di raggruppamento, senza capofamiglia; nome modificabile. | proposta |
| BR3 | Invitato senza gruppo, tavolo o lato è valido. Il +1 è un invitato "Accompagnatore di X". | proposta, Q3 |
| BR4 | Un duplicato non blocca: avviso inline non bloccante (anche in import: avviso, non errore). | DES-13 |
| BR5 | Ogni invitato e gruppo ha un identificativo stabile; lato salvato come A/B/entrambi; nessun accesso `anon`; nessuno stato di presenza qui. R-04 si aggiunge senza migrazioni distruttive. Nomi tabelle `guests`, `guest_groups`, `guest_tables` (R-04 userà `rsvp_*`). | ARC-8, ARC-9 |
| BR6 | `guest_band` resta la stima di onboarding; con invitati esistenti le impostazioni mostrano il testo "Sei a 62 persone: fascia 50-80" con link alla lista (mai solo un campo disabilitato); la fascia è calcolata al volo, non salvata. | Q1, ARC-10, DES-9 |
| BR7 | Eliminazione = nascosto ma conservato fino a "Elimina definitivamente"; nessuna cancellazione automatica (a differenza di quanto scritto nella prima bozza, i compiti non si svuotano). | ARC-2, QD-A |
| BR8 | Permessi: area `guests` solo per `partner` (read/write/delete); family/planner nessuno. | roadmap |
| BR9 | Il modulo di modifica usa il controllo di versione (AC6); le azioni rapide no. | ARC-3 |

## Non-functional requirements
Dati personali di terzi: RLS unico livello di autorizzazione, nessun dato personale (nome, contatti, note/allergie) in audit log, log o analytics; nessun dato reale nel repository. Mobile-first, bersagli ≥ 44 px, nessuna azione solo-swipe, contrasto nei 12 temi, axe senza violazioni. Prestazioni: e2e con 500 invitati seminati, lista visibile in < 1 s su desktop CI. Solo servizi gratuiti.

## Risposte alle obiezioni
Accettate: ARC-1 (AC13, NFR), ARC-2 (AC11, BR7), ARC-3 (AC6, BR9), ARC-5 (AC21), ARC-6 (AC17-18), ARC-7 (AC12), ARC-8/9/10/11 (BR1, BR4-BR6), DES-2 (AC3), DES-3 (AC5), DES-4 (AC8-9), DES-5 (AC7, AC15), DES-6 (AC17-19), DES-7 (AC20), DES-8 (AC10: includo gruppi e tavoli nel ripristino, costo basso per ARC-9), DES-9 (BR6), DES-10 (AC16), DES-11 (AC21), DES-12 (permessi), DES-13/14/15 (BR4, AC2, AC5), DES-16 (tipo estendibile: all'architetto). ARC-4/DES-1 non decisi dal PO: diventano la domanda 1 per lo sviluppatore. ARC-1/ARC-2 e ADR-0002: accettati. Nessuna obiezione respinta.

## Decisions
| # | Question | Answer | Date |
|---|---|---|---|

## Open questions
Tutte `question-for-developer` (proposta tra parentesi):
1. **Menu**: A) sette voci con Guida ultima, scritte più piccole sotto 360 px; B) "Invitati" nel menu e "Guida" dentro Opzioni più un link di aiuto in ogni pagina. (A, come hai chiesto oggi per la Guida; B solo se su telefono piccolo non si legge bene.)
2. **Cancellazione**: gli eliminati restano finché non scegli "Elimina definitivamente" (nessuna scadenza automatica). (Sì; l'alternativa è la cancellazione automatica dopo 30 giorni.)
3. **Import con righe sbagliate**: importare quelle valide e mostrare quelle saltate, oppure bloccare tutto finché non sono corrette? (Importare le valide.)
4. **Fascia invitati**: con la lista compilata la fascia dell'onboarding diventa un calcolo dal numero reale. (Sì.)
5. **Adulti/bambini**: solo due categorie, i neonati si aggiungono dopo se servono. (Sì.)
6. **+1**: nessun campo speciale, si inserisce "Accompagnatore di X". (Sì.)
7. **Tavoli pieni**: si può superare la capienza, con avviso scritto. (Sì.)
8. **Budget**: nessun legame per ora. (Sì.)
9. **Percorso**: il compito sugli invitati ha un link a questa sezione, senza completarsi da solo. (Sì.)
10. **Limite**: massimo 1000 invitati per matrimonio, eliminati di recente compresi. (Sì.)
