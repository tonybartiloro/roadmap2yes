# FEAT-2026-003 — Invitati: anagrafica, gruppi/famiglie, tavoli facoltativi: requirements brief

| Request | Ticket | Size | Status |
|---|---|---|---|
| "gestione invitati (anagrafica, gruppi/famiglie, tavoli opzionali)" (roadmap R-03) | — | L | approved-for-plan 2026-11-25 (Gate A: roadmap; domande risolte dallo sviluppatore) |

## Goal
La coppia costruisce e mantiene la lista degli invitati (persone, nuclei, tavoli facoltativi) e vede sempre quante persone aspettarsi, per scegliere location e catering. Il modello dati non deve bloccare R-04 (RSVP con link personale e stato di presenza per persona/gruppo).

## Scope
- **In:** anagrafica invitato (adulto, bambino, neonato); gruppi/famiglie; tavoli facoltativi con capienza; conteggi e filtri; eliminazione con "Annulla", "Eliminati di recente" ed "Elimina definitivamente"; importazione da CSV/testo ed esportazione CSV; inclusione nell'esportazione completa; area di permessi `guests`; voce di menu; pagina in `docs/functional`; ADR-0002 sui dati personali degli invitati (architetto).
- **Out:** RSVP, link personali, stato di presenza (R-04); pagina pubblica; disposizione grafica della sala (R-06 "Sala: disposizione visuale dei tavoli", dipende da R-03); invio messaggi; costi per persona nel budget; accesso di famiglia/planner; import da rubrica; file .xlsx.
- **Costruzione a passi (una sola feature):** 1 anagrafica + gruppi + conteggi + filtri + eliminazione (AC1-AC13, AC23); 2 tavoli (AC14-AC16); 3 import/export (AC17-AC22). Tavoli e import possono slittare senza bloccare il resto.

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
| AC2 | Given il modulo invitato, when inserisce nome (obbligatorio, max 80), cognome, tipo adulto/bambino/neonato "0-2 anni" (predefinito adulto), lato, telefono, email, note (max 500) e salva, then compare in lista; nome vuoto è rifiutato con messaggio in italiano; telefono: solo `+`, cifre, spazi e `()-./`, 6-20 caratteri; email con regole standard; campi `tel`/`email` con tastiera adatta. |
| AC3 | Given il modulo, when sceglie "Salva e aggiungi un altro", then salva e riapre il modulo mantenendo tipo, lato, gruppo e tavolo, con il focus sul nome. |
| AC4 | Given il campo lato, then le opzioni sono "{partner A}", "{partner B}", "Entrambi", "Non indicato" (predefinito); il valore salvato è A/B/entrambi/vuoto, non il nome. |
| AC5 | Given i gruppi, when usa "Nuova famiglia" (nome + più persone in un solo salvataggio), "Nuovo gruppo…" dal modulo invitato o "Aggiungi persona" dal gruppo, then gruppo e persone sono creati; un invitato ha al massimo un gruppo o nessuno; la lista mostra i gruppi con adulti/bambini (chiusi di default oltre 100 righe). |
| AC6 | Given la modifica di invitato, gruppo o tavolo, when salva su dati cambiati nel frattempo dall'altro partner, then compare il dialogo di conflitto esistente (FEAT-2026-001 AC40); le assegnazioni rapide (scelta gruppo/tavolo, azioni di massa) sono "ultimo salvataggio vince". |
| AC7 | Given invitati selezionati (selezione multipla), when sceglie "Assegna a gruppo", "Assegna a tavolo" o "Elimina", then l'azione si applica a tutti, con "Annulla". |
| AC8 | Given il riepilogo su una riga, then mostra totale persone (adulti + bambini + neonati), adulti, bambini, neonati; "Per lato" è comprimibile e dà gli stessi quattro numeri per A, B, Entrambi, Non indicato; gli invitati eliminati non sono mai contati. Con filtri attivi il riepilogo dice "12 di 42 persone" e i numeri per lato restano sul totale. |
| AC9 | Given i filtri (lato, gruppo, adulto/bambino/neonato, tavolo, "Senza gruppo", "Senza tavolo", ricerca per nome; in uno sheet con chip dei filtri attivi), when li applica, then la lista mostra solo i corrispondenti; tutto usabile da tastiera e lettore di schermo. |
| AC10 | Given un invitato eliminato, then compare "Annulla" per almeno 8 s e resta in "Eliminati di recente" ripristinabile; lo stesso per gruppi (i membri restano e diventano "Senza gruppo"; il ripristino li rimette dentro) e tavoli (idem "Senza tavolo"). |
| AC11 | Given "Eliminati di recente", when sceglie "Elimina definitivamente" (uno) o "Svuota" (tutti), con conferma, then i dati personali sono cancellati dal database e non compaiono in nessuna esportazione; non esiste scadenza automatica. |
| AC12 | Given un numero qualsiasi di invitati (nessun limite; test con più di 1000), then lista, filtri, conteggi ed esportazioni li includono tutti, senza troncamenti silenziosi. |
| AC13 | Given un utente non partner, un futuro family/planner o `anon`, when legge o scrive invitati, gruppi o tavoli (app o API), then RLS lo nega (pgTAP); nessun dato personale degli invitati finisce nell'audit log né in "Novità" della Home (pgTAP: nome, telefono, email, note assenti); il seed ha solo nomi finti. |
| AC14 | Given i tavoli, when ne crea uno (nome obbligatorio, capienza intera 1-50 facoltativa) e vi assegna persone, then mostra posti occupati/capienza; i neonati non occupano posto (se un tavolo deve contarli, si registra la persona come bambino); un invitato siede al massimo a un tavolo. |
| AC15 | Given un tavolo, when usa "Aggiungi un gruppo intero", then i membri sono assegnati; se qualcuno è già seduto altrove compare una conferma che lo dice. |
| AC16 | Given un tavolo pieno, when assegna una persona in più, then è consentito ma si vede "Oltre la capienza di N" in testo (non solo colore) sul tavolo e nel riepilogo. Given nessun tavolo, then la scheda "Tavoli" mostra un vuoto calmo con "Crea tavolo", e filtro, campo e conteggi sui tavoli compaiono solo quando ne esistono. |
| AC17 | Given "Importa", when incolla testo o carica un CSV (UTF-8, con ripiego Windows-1252, quindi "Niccolò" resta corretto; separatore `;` o `,` rilevato; intestazione facoltativa; colonne nome, cognome, tipo, lato, gruppo, telefono, email, note), then vede un'anteprima a carte. |
| AC18 | Given le righe, then `tipo` ∈ {adulto, bambino, neonato, vuoto = adulto} e `lato` ∈ {nome partner A, nome partner B, A, B, entrambi, vuoto} senza distinguere maiuscole; `gruppo` = gruppo esistente con lo stesso nome (senza distinguere maiuscole e spazi) o nuovo; una sola colonna = intero testo nel nome. Valori sconosciuti, nome vuoto, telefono/email non validi = riga con errore; duplicati (stesso nome e cognome senza maiuscole, spazi e accenti) = solo avviso. |
| AC19 | Given l'anteprima, when conferma, then importa le righe valide e l'anteprima elenca quelle saltate con il motivo; max 500 righe per importazione; "Torna indietro" conserva il testo; se annulla non viene salvato nulla. |
| AC20 | Given un'importazione appena fatta, then compare "Annulla importazione" per almeno 8 s che rimuove tutto ciò che ha creato (invitati e gruppi nuovi). |
| AC21 | Given "Esporta CSV" (in Invitati e in Opzioni > Esportazione, sempre tutti gli invitati con testo esplicito, anche con filtri attivi), then scarica un CSV con gli stessi campi dell'import, con le formule neutralizzate come nell'esportazione esistente; reimportandolo si ottengono gli stessi dati (test di andata e ritorno, telefoni con `+` inclusi). |
| AC22 | Given l'esportazione completa dell'app, then include invitati, gruppi e tavoli (gli eliminati di recente marcati come tali). |
| AC23 | Given la barra di navigazione (320 px e desktop), then ha 6 voci con "Invitati" (icona persone) e senza "Guida"; "Guida" è una voce ben visibile nella pagina Opzioni e ogni pagina ha un link di aiuto nell'intestazione verso la sua pagina della Guida; la voce Invitati è nascosta a chi non ha il permesso. |

## Business rules and edge cases
| # | Rule / case | Source |
|---|---|---|
| BR1 | Un conteggio è per persona (una riga = una persona); "bambino" è scelta manuale, "neonato" = 0-2 anni. Totale = adulti + bambini + neonati; il neonato è contato nel totale e ha un conteggio proprio ma non occupa posto al tavolo. "Senza lato" = lato non indicato. | proposta, ARC-11 |
| BR2 | Il gruppo è solo un'etichetta di raggruppamento, senza capofamiglia; nome modificabile. | proposta |
| BR3 | Invitato senza gruppo, tavolo o lato è valido. Il +1 è un invitato "Accompagnatore di X". | proposta, Q3 |
| BR4 | Un duplicato non blocca: avviso inline non bloccante (anche in import: avviso, non errore). | DES-13 |
| BR5 | Ogni invitato e gruppo ha un identificativo stabile; lato salvato come A/B/entrambi; nessun accesso `anon`; nessuno stato di presenza qui. R-04 si aggiunge senza migrazioni distruttive. Nomi tabelle `guests`, `guest_groups`, `guest_tables` (R-04 userà `rsvp_*`). | ARC-8, ARC-9 |
| BR6 | `guest_band` resta la stima di onboarding; con invitati esistenti le impostazioni mostrano il testo "Sei a 62 persone: fascia 50-80" con link alla lista (mai solo un campo disabilitato); la fascia è calcolata al volo, non salvata. | Q1, ARC-10, DES-9 |
| BR7 | Eliminazione = nascosto ma conservato fino a "Elimina definitivamente"; nessuna cancellazione automatica (a differenza di quanto scritto nella prima bozza, i compiti non si svuotano). | ARC-2, QD-A |
| BR8 | Permessi: area `guests` solo per `partner` (read/write/delete); family/planner nessuno. | roadmap |
| BR9 | Il modulo di modifica usa il controllo di versione (AC6); le azioni rapide no. | ARC-3 |
| BR10 | Ogni tavolo ha nel modello dati una forma e una posizione, non usate dalla UI di R-03, così R-06 (sala visuale) non richiede migrazioni distruttive. | sviluppatore (decisione 7) |

## Non-functional requirements
Dati personali di terzi: RLS unico livello di autorizzazione, nessun dato personale (nome, contatti, note/allergie) in audit log, log o analytics; nessun dato reale nel repository. Mobile-first, bersagli ≥ 44 px, nessuna azione solo-swipe, contrasto nei 12 temi, axe senza violazioni. Prestazioni (nessun tetto al numero di invitati): e2e con 500 invitati seminati, lista visibile in < 1 s su desktop CI. Solo servizi gratuiti.

## Risposte alle obiezioni
Accettate: ARC-1 (AC13, NFR), ARC-2 (AC11, BR7), ARC-3 (AC6, BR9), ARC-5 (AC21), ARC-6 (AC17-18), ARC-7 (AC12: il tetto di 1000 proposto è stato respinto dallo sviluppatore, resta l'obbligo di non troncare), ARC-8/9/10/11 (BR1, BR4-BR6), DES-2 (AC3), DES-3 (AC5), DES-4 (AC8-9), DES-5 (AC7, AC15), DES-6 (AC17-19), DES-7 (AC20), DES-8 (AC10: includo gruppi e tavoli nel ripristino, costo basso per ARC-9), DES-9 (BR6), DES-10 (AC16), DES-11 (AC21), DES-12 (permessi), DES-13/14/15 (BR4, AC2, AC5), DES-16 (tipo estendibile: all'architetto). ARC-4/DES-1: deciso dallo sviluppatore (Decisions 1). ARC-1/ARC-2 e ADR-0002: accettati. Nessuna obiezione respinta.

## Decisions
| # | Question | Answer | Date |
|---|---|---|---|
| 1 | Menu | B: "Invitati" nella barra (6 voci), "Guida" dentro Opzioni più link di aiuto nelle intestazioni (AC23). Inverte la decisione di FEAT-2026-002 (Guida ultima voce della barra) per scelta esplicita dello sviluppatore: vanno aggiornati `guida.nav.spec` e la documentazione. | 2026-11-25 |
| 2 | Cancellazione | Gli eliminati restano in "Eliminati di recente" fino a "Elimina definitivamente"/"Svuota"; nessuna scadenza automatica (AC11). | 2026-11-25 |
| 3 | Import con righe errate | Si importano le valide, le saltate sono elencate (AC19). | 2026-11-25 |
| 4 | Fascia invitati | Con invitati presenti è calcolata dal numero reale, in sola lettura con link alla lista (BR6). | 2026-11-25 |
| 5 | Categorie | Adulto, bambino, neonato (0-2 anni): il neonato conta nel totale e ha il proprio conteggio, non occupa posto al tavolo; se un tavolo deve contarlo, si registra come bambino (BR1, AC14). | 2026-11-25 |
| 6 | +1 | Nessun campo speciale: "Accompagnatore di X" (BR3). | 2026-11-25 |
| 7 | Tavoli pieni e sala | Capienza superabile con avviso scritto (AC16). La sala visuale è la nuova voce R-06; qui il tavolo ha forma e posizione nel modello dati, non usate dalla UI (BR10). | 2026-11-25 |
| 8 | Budget | Nessun legame per ora. | 2026-11-25 |
| 9 | Percorso | Milestone e compito sugli invitati con link a Invitati, senza completamento automatico. | 2026-11-25 |
| 10 | Limite invitati | Nessun tetto; nessun troncamento silenzioso (AC12, NFR). | 2026-11-25 |

## Open questions
Nessuna.
