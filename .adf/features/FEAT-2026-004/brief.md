# FEAT-2026-004 — Conferme di presenza (RSVP) con link personale: requirements brief

| Request | Ticket | Size | Status |
|---|---|---|---|
| "Conferme di presenza (RSVP) con link personale" (roadmap R-04, approvata 2026-11-25) | — | L | approved 2026-11-26 (Gate A: roadmap; D1-D13 decise dallo sviluppatore) |

## Goal
Ogni invitato (o la sua famiglia) conferma la presenza da un link personale non indovinabile, senza account, condiviso a mano dalla coppia (copia link / WhatsApp) finché le email sono spente. La coppia vede in Invitati, persona per persona, chi viene, chi no e chi deve ancora rispondere. È il nucleo rilasciabile di R-04; gli strumenti operativi della coppia sono in R-07 (D1).

## Scope
- **In:** AC1-AC14; `docs/functional`, Guida "Conferme di presenza", esportazione JSON in Opzioni, nuovo ADR-0003 (architetto).
- **Out:** tutto ciò che è in "Rimandato a R-07" (conteggi e filtri delle presenze, risposta a mano, riepilogo alimentare, scadenza delle risposte, colonne CSV, coda "Invia i link"); invio automatico email/SMS e avvisi email alla coppia (anche con Resend attivo: voce futura); sito pubblico completo (R-05 deciderà sulla lista nozze); +1, correzione nomi o messaggi dalla pagina pubblica (D10); risposta "forse"; menù bambini o portate; QR code e inviti stampati; tavoli sulla pagina pubblica; filtro "Risposte degli ultimi 7 giorni"; accesso family/planner.

## Users and permissions
| Role | Can | Cannot |
|---|---|---|
| partner (Tony, Jessica) | con `guests/write`: gestire i link; con sola lettura: vedere stati e risposte | — |
| invitato con link (nessun account) | quanto in AC3-AC4 | tutto il resto (AC3) |
| family, planner (futuri) | nulla (nessun permesso `guests`, come R-03) | vedere link o risposte |
| `anon` | solo le funzioni pubbliche col token (ADR-0002 §3) | accesso diretto alle tabelle |

## User stories
- Come partner, voglio mandare a ogni famiglia il suo link su WhatsApp, senza telefonare a tutti.
- Come invitato, voglio rispondere per me e la mia famiglia dal telefono, senza registrarmi, e cambiare idea finché il link funziona.
- Come partner, voglio vedere chi ha risposto e cosa, e a chi devo ancora mandare il link.

## Acceptance criteria
| # | Criterion |
|---|---|
| AC1 | Given Invitati, then il titolo di un gruppo "insieme" e il foglio della persona (senza gruppo o in gruppo "separato") mostrano lo stato del link e "Invia", che apre il foglio "Link di {destinatario}". Senza link: "Crea link"; da "Altro", "Crea link per tutti (N)" crea quelli mancanti. Con link attivo: "Copia link", "Condividi" (foglio di sistema, dove c'è) e "WhatsApp" (messaggio precompilato e modificabile; saluto con i nomi di battesimo dei membri, al massimo 3, altrimenti "Ciao a tutti!"; contatto scelto in WhatsApp), con un solo tocco anche su iOS. Il link attivo si ricopia quando serve (D3). Senza `guests/write` le azioni sono nascoste con "Serve il permesso di modifica". |
| AC2 | Given un link, then contiene un token imprevedibile (almeno 128 bit) su un percorso pubblico proprio (non `/invito`) e si apre senza login su 320 px e desktop, anche nel browser interno di WhatsApp e senza JavaScript. |
| AC3 | Given un link valido, then la pagina mostra solo: "{A} e {B} si sposano" (nomi di battesimo, senza marchio dell'app), data se la decisione "Data" è presa (altrimenti "Data da confermare"), location con nome e comune se "Location" è presa (altrimenti "Luogo da confermare"), nome e cognome delle persone del destinatario con le loro risposte, nota privacy (D6) e "Manca qualcuno o c'è un nome sbagliato? Scrivi a chi ti ha invitato.", nel tema del matrimonio. La funzione pubblica restituisce esattamente questi dati più l'identificativo del tema e, per ogni persona, un identificativo opaco e la categoria (adulto, bambino, neonato) (pgTAP sull'insieme delle chiavi): mai altri invitati, contatti, note, lato, tavolo. |
| AC4 | Given la pagina, when l'invitato sceglie Sì o No per una o più persone ("Vengono tutti" con 2+ persone; contatore "Hai scelto per 3 di 4"), indica facoltativamente le preferenze di chi dice Sì (D9) e tocca "Invia le risposte", then le scelte sono salvate e vede "Grazie! Abbiamo ricevuto le risposte" con riepilogo e "Modifica"; chi non ha scelto resta "In attesa"; con zero scelte una riga spiega cosa manca (pulsante non muto). Riaprendo il link ritrova le risposte. |
| AC5 | Given un gruppo "insieme", then chi ha il link risponde per tutte le persone attuali del gruppo, neonati compresi, una risposta per persona (nessun capofamiglia, R-03 BR2). |
| AC6 | Given un token sconosciuto, revocato, scaduto o senza destinatario, when si apre il link o si invia, then compare sempre la stessa pagina neutra ("Questo link non funziona più. Se pensi sia un errore, scrivi a chi ti ha invitato."), all'apertura sempre 404; all'invio, lo stesso contenuto neutro per tutte le cause (stato 200: una server action non può cambiarlo), tema predefinito, senza dire se il link sia esistito. La pagina di servizio (Supabase in pausa) ha un testo adatto anche a un invitato. |
| AC7 | Given un link attivo, when il partner sceglie "Nuovo link" o "Revoca link" (conferme che dicono la conseguenza), then il vecchio link dà subito la pagina neutra; dopo la revoca il pulsante diventa "Crea un nuovo link"; le risposte restano. Un destinatario ha al massimo un link attivo. |
| AC8 | Given la lista, then ogni persona mostra "In attesa", "Sì" o "No" in testo e icona (non solo colore) e il gruppo lo riepiloga ("2 sì · 1 in attesa"); ogni destinatario mostra lo stato del link: Nessun link, Da condividere, Condiviso il {data} (registrato al tocco su Copia/Condividi/WhatsApp, con Annulla; D11), Da rimandare, Scaduto ({data}). Il foglio dell'invitato mostra presenza, preferenze, origine e data della risposta, in sola lettura (la modifica a mano è in R-07). |
| AC9 | Given i cambi di BR3-BR5 (spostamenti, modalità del gruppo, eliminazione, ripristino, eliminazione definitiva), then i link funzionano o no come descritto e "Da rimandare" compare secondo la definizione di BR3. |
| AC10 | Given la pagina pubblica, then: `noindex` (meta, `X-Robots-Tag`, robots), `Referrer-Policy: no-referrer` (`same-origin` sulla pagina del modulo, D15), `Cache-Control: private, no-store`, nessuna risorsa di terzi; anteprima del link statica ("Conferma la tua presenza", "Ci vuole un minuto"), senza nomi né immagini di terzi; aprire il link non modifica dati del matrimonio; all'apertura, oltre il limite per IP di BR9, risponde 429 con `Retry-After` e "Troppi tentativi: riprova tra 15 minuti"; sull'invio, oltre il limite per link, lo stesso messaggio compare nel modulo. |
| AC11 | Given salvataggi concorrenti o cambi durante la compilazione, then vince l'ultimo per persona; dopo l'invio la pagina mostra lo stato salvato e, se diverso dal proprio, "Le risposte di {nome} erano già cambiate: ecco quelle salvate"; link revocato o scaduto nel frattempo → pagina neutra; persone uscite dal destinatario → ignorate; doppio invio senza effetti doppi; nessuna bozza salvata nel dispositivo. |
| AC12 | Given la regola di D7, when il link è scaduto, then dà la pagina neutra; il foglio del link mostra prima "Scade il {data}" e poi "Scaduto il {data}. Se sposti la data, i link tornano a funzionare da soli.", senza azioni di creazione o rigenerazione ("Crea link per tutti" disattivato con spiegazione); se la data scelta cambia, i link non revocati tornano a funzionare (BR4). |
| AC13 | Given l'esportazione completa (JSON), then include per ogni invitato presenza, preferenze, origine e data della risposta, e lo stato dei link (attivo/revocato, date, condiviso il), mai il token né il segreto. |
| AC14 | Given risposte e preferenze, then non entrano in audit log (colonne escluse come le note, ADR-0002 §1), "Novità", log o analytics; "Elimina definitivamente" cancella fisicamente risposte, preferenze e link; RLS nega tutto a `anon`, altri matrimoni e family/planner (pgTAP); la pagina pubblica passa solo dalle funzioni col token. |

## Rimandato a R-07 (D1)
Fuori da questa feature; i testi completi restano nella storia git di questo file (round 1 di F1) e si riprendono nella F1 di R-07.
- Ex AC15: riepilogo "Presenze" (Sì con adulti/bambini/neonati e "28 posti", No, In attesa) cliccabile come filtro; invito "Invia i link" senza link; avviso se la data è scelta dopo le prime risposte (D6, D12).
- Ex AC16: filtri "Presenza", "Con preferenze alimentari", "Link" (stati di AC8).
- Ex AC17: risposta a mano dal modulo invitato (origine "inserita da voi", dialogo di conflitto di R-03); "Segna presenza" multipla con conferma e Annulla che ripristina anche le preferenze (DES-7).
- Ex AC18: riepilogo alimentare per il catering sui soli Sì, note di R-03 separate.
- Ex AC19: scadenza delle risposte facoltativa (23:59 Europe/Rome), poi pagina in sola lettura; spostarla in avanti riapre (D7).
- Ex AC20: colonne "presenza" e "preferenze alimentari" nel CSV, ignorate dall'importazione (D13).
- Ex AC21: coda "Invia i link" con WhatsApp/Copia e contatore "Ne restano N su M" (D11).

## Business rules and edge cases
| # | Rule / case | Source |
|---|---|---|
| BR1 | **Destinatario** = gruppo vivo in modalità "insieme" (predefinita), oppure persona viva senza gruppo vivo o in un gruppo "separato". Il destinatario si calcola sempre dallo stato attuale; una persona è coperta da un solo link funzionante. La modalità del gruppo si sceglie dal suo menu. | D2, ARC-5 |
| BR2 | Il link vale per le persone **attuali** del destinatario; la risposta resta legata alla persona, non al link. | D2 |
| BR3 | Un link funziona se non è revocato, non è scaduto e il suo bersaglio è ora un destinatario. **Da rimandare** = destinatario senza link funzionante di cui almeno una persona era coperta da un link già condiviso che ora non la copre più. Cambiare modalità di un gruppo chiede una conferma che lo dice. | ARC-5, D8 |
| BR4 | Un link "dormiente" torna a funzionare quando il suo bersaglio ridiventa destinatario (gruppo ripristinato, persona che esce di nuovo dal gruppo), se non revocato né scaduto. | ARC-5, D8 |
| BR5 | "Elimina definitivamente" cancella fisicamente risposte, preferenze e link della persona o del gruppo. | ADR-0002 §2 |
| BR6 | Stati per persona: In attesa, Sì, No; il neonato risponde come gli altri (R-03 BR1). | roadmap, R-03 |
| BR7 | In questa feature non c'è scadenza delle risposte (arriva con R-07): si risponde e si modifica finché il link funziona; il link scade 30 giorni dopo la data scelta, mai finché la data non è scelta. | D1, D7 |
| BR8 | La pagina pubblica non mostra mai data o location provvisorie; se la decisione viene riaperta torna "da confermare". I link si possono creare e condividere anche senza data scelta, con un avviso alla coppia nel foglio del link. | D6 |
| BR9 | Limiti (schema dei tentativi di login, tabella propria): link non validi 10 per IP in 15 min, invii 20 per link in 15 min, poi blocco di 15 min; i link validi non consumano il limite per IP (reti condivise). Il codice dell'app non scrive mai il token nei log; residuo Vercel in ADR-0003 (D5). | ARC-2, ARC-3, DES-17 |
| BR10 | Email spente: nessun invio né avviso automatico; condivisione solo manuale; nessun avviso di nuove risposte. | roadmap, D11 |
| BR11 | Preferenze (D9) = dati sanitari di terzi: minime, solo per chi dice Sì, trattate come le note (ADR-0002). Dire No cancella le preferenze della persona. | D9, ADR-0002 |
| BR12 | Repository pubblico: seed e test con nomi finti ed email `@example.test`; nessun token o segreto reale in fixture. | project.md |

## Non-functional requirements
- **Accessibilità e mobile:** pagina pubblica da 320 px, testo base 18 px, bersagli ≥ 44 px, scelte etichettate col nome della persona, errori in testo, axe senza violazioni; pulsante "Invia" nel flusso (non fisso); verificata su Safari iOS e nel browser interno di WhatsApp.
- **Aspetto:** tema del matrimonio dal risultato della funzione pubblica, senza lampeggio; chiaro/scuro dal dispositivo; tono "tu".
- **Sicurezza:** ADR-0002 e ADR-0003 (token derivato, `RSVP_LINK_SECRET`); round di sicurezza in F3.
- **Test:** orologio iniettabile anche lato server per la scadenza dei link, con la regola di `r2y-test-now` (ignorato in produzione).
- **Prestazioni e costi:** pagina pubblica < 2 s su 4G, nessuna libreria di terzi; Invitati entro i limiti di R-03; solo servizi gratuiti.

## Risposte alle obiezioni F1
- **Accettate (30):** ARC-1 (D3, D4, NFR), ARC-2 (BR9), ARC-3 opzione (a) (BR9, D5), ARC-4 ("Crea link" esplicito, AC1), ARC-5 (BR1, BR3, BR4, D8), ARC-6 (note per F2), ARC-8 (D1: divisione in R-04 e R-07), ARC-9 (AC6, AC10, NFR), ARC-10 (NFR); DES-1 (AC3, NFR), DES-2 (AC1), DES-3 (AC4), DES-4 (R-07, D11), DES-5 (AC7), DES-6 (AC1, AC8, D11), DES-7 (R-07), DES-8 (AC3), DES-9 (AC3, D6), DES-10 (R-07, D12), DES-11 (AC8; filtri in R-07), DES-12 (AC11), DES-13 (R-07, D6), DES-14 (AC11), DES-15 (AC8, per F2), DES-16 (D3), DES-18 (AC2, NFR), DES-19 (AC12), DES-20 (AC1), DES-22 (AC10), DES-23 (Scope).
- **Accettate in parte (1):** DES-17: soglie generose e limite per IP solo sui link non validi (BR9); respinto il messaggio identico alla pagina neutra: un invitato con link valido bloccato penserebbe che il link sia morto e chiederebbe un nuovo link; il 429 non rivela nulla sul token (ARC-9).
- **Respinte (2):** ARC-7 alternativa semplice (No multiplo senza Annulla per le preferenze): perdere dati di terzi con un tocco contraddice lo schema Annulla di R-03; vale DES-7 (in R-07). DES-21 ("Risposte degli ultimi 7 giorni"): fuori dalla roadmap, la data della risposta è già in lista; seguito possibile.

## Decisions
Tutte decise dallo sviluppatore il 2026-11-26 ("Accetto tutte"): vale la risposta proposta.
| # | Question | Answer | Date |
|---|---|---|---|
| D1 | Divisione in passi o in due voci | Dividere: FEAT-2026-004 = nucleo (AC1-AC14); gli strumenti della coppia diventano R-07 (taglia M, dipende da R-04). | 2026-11-26 |
| D2 | Granularità del link | Un link per gruppo, con modalità "rispondono insieme" (predefinita) o "ognuno per sé"; senza gruppo, link personale (BR1-BR2). | 2026-11-26 |
| D3 | Ricopiare il link in qualsiasi momento | Sì, con token derivato (HMAC del segreto e dell'id del link), nel DB solo l'hash; nuovo ADR-0003 che precisa ADR-0002 §3. | 2026-11-26 |
| D4 | Nuovo segreto `RSVP_LINK_SECRET` | Sì: Vercel produzione e preview, valori diversi, Sensitive. Correzione di fatto (F2, plan P4): ruotarlo **non** invalida i link già condivisi (il DB confronta lo sha256), impedisce solo di ricopiarli (serve "Nuovo link"); per invalidarli si revocano tutti (runbook). | 2026-11-26 |
| D5 | Token nel percorso e log delle richieste di Vercel | Residuo accettato (breve conservazione, visibile solo al proprietario; anche cronologia del browser), scritto in ADR-0003. | 2026-11-26 |
| D6 | Pagina pubblica con data/location non scelte | Link condivisibili con avviso alla coppia; "Data/Luogo da confermare"; nota privacy "Le risposte le vedono solo {A} e {B}, servono per organizzare il matrimonio; per farle cancellare scrivi a loro"; data scelta dopo le risposte: solo avviso (R-07). | 2026-11-26 |
| D7 | Scadenze | Scadenza delle risposte facoltativa, nessuna predefinita, dopo sola lettura (R-07); il link scade 30 giorni dopo la data scelta, mai finché la data non è scelta. | 2026-11-26 |
| D8 | "Da rimandare" e link dormienti | Sì alla definizione di BR3 e alla riattivazione di BR4. | 2026-11-26 |
| D9 | Preferenze alimentari | Vegetariano, Vegano, Senza glutine, Senza lattosio + "Allergie o altro" (max 200), solo per chi dice Sì, separate dalle note. | 2026-11-26 |
| D10 | Altro oltre a sì/no e preferenze | No (niente +1, nomi, messaggio libero); la pagina dice di scrivere a chi ha invitato. | 2026-11-26 |
| D11 | "Condiviso il", saluto, coda e avvisi | "Condiviso il" registrato al tocco (con Annulla); saluto e messaggio come AC1; coda "Invia i link" in R-07; nessun avviso di nuove risposte. | 2026-11-26 |
| D12 | Numeri per il catering | "Sì 30" con accanto "28 posti" (neonati esclusi); preferenze contate sui Sì, neonati compresi (R-07). | 2026-11-26 |
| D13 | Export | JSON con risposte e stato dei link (mai token) qui; colonne CSV, ignorate dall'importazione, in R-07. | 2026-11-26 |
| D14 | Gate B | Gate B 2026-11-26: modifiche AC3/AC6/AC10/AC12 approvate dallo sviluppatore (Q-P1..Q-P3). | 2026-11-26 |
| D15 | `Referrer-Policy` della pagina del modulo (DES-37: con `no-referrer` Chromium invia `Origin: null` e Next rifiuta la server action senza JS) | `same-origin` sulla pagina del modulo; la neutra e il 429 restano `no-referrer`. AC10 aggiornato; ADR-0003 aggiornato in T12. | 2026-11-27 |

## Open questions
Nessuna.
