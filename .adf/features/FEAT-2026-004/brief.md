# FEAT-2026-004 — Conferme di presenza (RSVP) con link personale: requirements brief

| Request | Ticket | Size | Status |
|---|---|---|---|
| "Conferme di presenza (RSVP) con link personale" (roadmap R-04, approvata 2026-11-25) | — | L | in discussion (F1 round 1) |

## Goal
Ogni invitato (o la sua famiglia) conferma la presenza da un link personale non indovinabile, senza account, condiviso a mano dalla coppia (copia link / WhatsApp) finché le email sono spente. La coppia vede in Invitati chi viene, chi no e chi deve ancora rispondere, con i numeri per location e catering.

## Scope
- **In:** quanto descritto dalle AC dei due passi; `docs/functional`, Guida "Conferme di presenza", esportazioni in Opzioni, nuovo ADR-0003 (architetto).
- **Out:** invio automatico email/SMS e avvisi email alla coppia (anche con Resend attivo: voce futura); sito pubblico completo (programma, mappe, alloggi; R-05 deciderà sulla lista nozze); +1, correzione nomi o messaggi dalla pagina pubblica (D10); risposta "forse"; menù bambini o portate; QR code e inviti stampati; tavoli sulla pagina pubblica; filtro "Risposte degli ultimi 7 giorni" (seguito); accesso family/planner.
- **Passi** (vedi D1): **Passo 1, nucleo rilasciabile** (AC1-AC14): link, pagina pubblica, risposta, stato in lista, scadenza dei link, abusi e privacy, export JSON. **Passo 2, strumenti operativi della coppia** (AC15-AC21): conteggi, filtri, risposta a mano, riepilogo preferenze, scadenza delle risposte, colonne CSV, coda "Invia i link". Il passo 1 sta in piedi da solo; il passo 2 è una feature a sé o il secondo passo di questa, secondo D1.

## Users and permissions
| Role | Can | Cannot |
|---|---|---|
| partner (Tony, Jessica) | con `guests/write`: gestire link, risposte e scadenza; con sola lettura: vedere stati e numeri | — |
| invitato con link (nessun account) | quanto in AC3-AC4 | tutto il resto (AC3) |
| family, planner (futuri) | nulla (nessun permesso `guests`, come R-03) | vedere link o risposte |
| `anon` | solo le funzioni pubbliche col token (ADR-0002 §3) | accesso diretto alle tabelle |

## User stories
- Come partner, voglio mandare a ogni famiglia il suo link su WhatsApp, senza telefonare a tutti.
- Come invitato, voglio rispondere per me e la mia famiglia dal telefono, senza registrarmi, e cambiare idea entro la scadenza.
- Come partner, voglio sapere chi viene, con i numeri e le preferenze per il catering, e segnare io chi mi ha risposto a voce.

## Acceptance criteria
**Passo 1 — nucleo**
| # | Criterion |
|---|---|
| AC1 | Given Invitati, then il titolo di un gruppo "insieme" e il foglio della persona (senza gruppo o in gruppo "separato") mostrano lo stato del link e "Invia", che apre il foglio "Link di {destinatario}". Senza link: "Crea link"; da "Altro", "Crea link per tutti (N)" crea quelli mancanti. Con link attivo: "Copia link", "Condividi" (foglio di sistema, dove c'è) e "WhatsApp" (messaggio precompilato e modificabile; saluto con i nomi di battesimo dei membri, al massimo 3, altrimenti "Ciao a tutti!"; contatto scelto in WhatsApp), con un solo tocco anche su iOS. Il link attivo si ricopia quando serve (D3). Senza `guests/write` le azioni sono nascoste con "Serve il permesso di modifica". |
| AC2 | Given un link, then contiene un token imprevedibile (almeno 128 bit) su un percorso pubblico proprio (non `/invito`) e si apre senza login su 320 px e desktop, anche nel browser interno di WhatsApp e senza JavaScript. |
| AC3 | Given un link valido, then la pagina mostra solo: "{A} e {B} si sposano" (nomi di battesimo, senza marchio dell'app), data se la decisione "Data" è presa (altrimenti "Data da confermare"), location con nome e comune se "Location" è presa (altrimenti "Luogo da confermare"), scadenza se impostata, nome e cognome delle persone del destinatario con le loro risposte, nota privacy (D6) e "Manca qualcuno o c'è un nome sbagliato? Scrivi a chi ti ha invitato.", nel tema del matrimonio. La funzione pubblica restituisce esattamente questi dati più l'identificativo del tema (pgTAP sull'insieme delle chiavi): mai altri invitati, contatti, note, lato, tavolo. |
| AC4 | Given la pagina, when l'invitato sceglie Sì o No per una o più persone ("Vengono tutti" con 2+ persone; contatore "Hai scelto per 3 di 4"), indica facoltativamente le preferenze di chi dice Sì (D9) e tocca "Invia le risposte", then le scelte sono salvate e vede "Grazie! Abbiamo ricevuto le risposte" con riepilogo e "Modifica"; chi non ha scelto resta "In attesa"; con zero scelte una riga spiega cosa manca (pulsante non muto). Riaprendo il link ritrova le risposte. |
| AC5 | Given un gruppo "insieme", then chi ha il link risponde per tutte le persone attuali del gruppo, neonati compresi, una risposta per persona (nessun capofamiglia, R-03 BR2). |
| AC6 | Given un token sconosciuto, revocato, scaduto o senza destinatario, when si apre il link o si invia, then compare sempre la stessa pagina neutra ("Questo link non funziona più. Se pensi sia un errore, scrivi a chi ti ha invitato."), stesso codice HTTP, tema predefinito, senza dire se il link sia esistito. La pagina di servizio (Supabase in pausa) ha un testo adatto anche a un invitato. |
| AC7 | Given un link attivo, when il partner sceglie "Nuovo link" o "Revoca link" (conferme che dicono la conseguenza), then il vecchio link dà subito la pagina neutra; dopo la revoca il pulsante diventa "Crea un nuovo link"; le risposte restano. Un destinatario ha al massimo un link attivo. |
| AC8 | Given la lista, then ogni persona mostra "In attesa", "Sì" o "No" in testo e icona (non solo colore) e il gruppo lo riepiloga ("2 sì · 1 in attesa"); ogni destinatario mostra lo stato del link: Nessun link, Da condividere, Condiviso il {data} (D11), Da rimandare, Scaduto ({data}). Il foglio dell'invitato mostra presenza, preferenze, origine e data della risposta (sola lettura nel passo 1). |
| AC9 | Given i cambi di BR3-BR5 (spostamenti, modalità del gruppo, eliminazione, ripristino, eliminazione definitiva), then i link funzionano o no come descritto e "Da rimandare" compare secondo la definizione di BR3. |
| AC10 | Given la pagina pubblica, then: `noindex` (meta, `X-Robots-Tag`, robots), `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`, nessuna risorsa di terzi; anteprima del link statica ("Conferma la tua presenza", "Ci vuole un minuto"), senza nomi né immagini di terzi; aprire il link non modifica dati del matrimonio; oltre i limiti di BR9 risponde 429 con `Retry-After` e "Troppi tentativi: riprova tra 15 minuti". |
| AC11 | Given salvataggi concorrenti o cambi durante la compilazione, then vince l'ultimo per persona; dopo l'invio la pagina mostra lo stato salvato e, se diverso dal proprio, "Le risposte di {nome} erano già cambiate: ecco quelle salvate"; link revocato nel frattempo → pagina neutra; persone uscite dal destinatario → ignorate; scadenza passata → sola lettura con "Le tue ultime scelte non sono state salvate"; doppio invio senza effetti doppi; nessuna bozza salvata nel dispositivo. |
| AC12 | Given la regola di D7, when il link è scaduto, then dà la pagina neutra; il foglio del link mostra prima "Scade il {data}" e poi "Scaduto", con "Crea un nuovo link". |
| AC13 | Given l'esportazione completa (JSON), then include per ogni invitato presenza, preferenze, origine e data della risposta, la scadenza delle risposte e lo stato dei link (attivo/revocato, date, condiviso il), mai il token né il segreto. |
| AC14 | Given risposte e preferenze, then non entrano in audit log (colonne escluse come le note, ADR-0002 §1), "Novità", log o analytics; "Elimina definitivamente" cancella fisicamente risposte, preferenze e link; RLS nega tutto a `anon`, altri matrimoni e family/planner (pgTAP); la pagina pubblica passa solo dalle funzioni col token. |

**Passo 2 — strumenti della coppia**
| # | Criterion |
|---|---|
| AC15 | Given il riepilogo di Invitati, then sotto le persone compare "Presenze" in tre blocchi che vanno a capo a 320 px: "Sì 30" (24 adulti · 4 bambini · 2 neonati; "28 posti", D12), "No 5", "In attesa 12"; ogni blocco applica il filtro; solo persone non eliminate; con filtri vale "12 di 42" (R-03). Senza nessun link: "Non hai ancora mandato nessun link" con "Invia i link". Se la data viene scelta dopo le prime risposte: avviso "La data è stata decisa dopo N risposte: rimanda i link se serve" (D6), nessun reset. |
| AC16 | Given i filtri, then si aggiungono "Presenza" (Sì, No, In attesa), "Con preferenze alimentari" e "Link" (gli stati di AC8). |
| AC17 | Given il modulo invitato, when il partner imposta Presenza e preferenze, then sono salvate con origine "inserita da voi" e data; se nel frattempo l'invitato ha risposto, compare il dialogo di conflitto esistente (R-03 AC6). In selezione multipla "Segna presenza" applica Sì/No/In attesa; se No o In attesa cancellano preferenze, prima una conferma con il numero ("Cancello le preferenze di 4 persone?"), poi "Annulla" per almeno 8 s che ripristina stato e preferenze. |
| AC18 | Given risposte con preferenze, then Invitati mostra il riepilogo per il catering sulle sole persone con Sì ("Vegetariani 3 · Senza glutine 2 · Altro 1"); le note di R-03 restano separate e intatte. |
| AC19 | Given le impostazioni RSVP, when il partner imposta o toglie la scadenza delle risposte, then fino alle 23:59 (Europe/Rome) di quel giorno si risponde e modifica; dopo, la pagina è in sola lettura con "Le risposte sono chiuse: per cambiare scrivi a chi ti ha invitato" ("Non hai risposto" per chi manca); spostarla in avanti riapre subito; la coppia può sempre rispondere a mano. |
| AC20 | Given "Invitati (CSV)", then aggiunge in fondo le colonne "presenza" e "preferenze alimentari", che l'importazione ignora (andata e ritorno dell'anagrafica invariata, D13). |
| AC21 | Given "Invia i link" (dal riepilogo e da "Altro"), then elenca i destinatari "Da condividere" e "Da rimandare" con WhatsApp e Copia; dopo l'azione la riga diventa "Condiviso" (con Annulla) e il contatore dice "Ne restano 14 su 42" (D11). |

## Business rules and edge cases
| # | Rule / case | Source |
|---|---|---|
| BR1 | **Destinatario** = gruppo vivo in modalità "insieme" (predefinita), oppure persona viva senza gruppo vivo o in un gruppo "separato". Il destinatario si calcola sempre dallo stato attuale; una persona è coperta da un solo link funzionante. | D2, ARC-5 |
| BR2 | Il link vale per le persone **attuali** del destinatario; la risposta resta legata alla persona, non al link. | D2 |
| BR3 | Un link funziona se non è revocato, non è scaduto e il suo bersaglio è ora un destinatario. **Da rimandare** = destinatario senza link funzionante di cui almeno una persona era coperta da un link già condiviso che ora non la copre più. Cambiare modalità di un gruppo chiede una conferma che lo dice. | ARC-5, D8 |
| BR4 | Un link "dormiente" torna a funzionare quando il suo bersaglio ridiventa destinatario (gruppo ripristinato, persona che esce di nuovo dal gruppo), se non revocato né scaduto. | ARC-5, D8 |
| BR5 | "Elimina definitivamente" cancella fisicamente risposte, preferenze e link della persona o del gruppo. | ADR-0002 §2 |
| BR6 | Stati per persona: In attesa, Sì, No; il neonato risponde come gli altri, conta nei Sì e non occupa posto (R-03 BR1). | roadmap, R-03 |
| BR7 | Scadenza delle risposte: una per matrimonio, facoltativa, decisa dalla coppia (passo 2); senza scadenza si risponde finché il link funziona. | D7 |
| BR8 | La pagina pubblica non mostra mai data o location provvisorie; se la decisione viene riaperta torna "da confermare". | D6 |
| BR9 | Limiti (schema dei tentativi di login, tabella propria): link non validi 10 per IP in 15 min, invii 20 per link in 15 min, poi blocco di 15 min; i link validi non consumano il limite per IP (reti condivise). Il codice dell'app non scrive mai il token nei log; residuo Vercel in ADR-0003 (D5). | ARC-2, ARC-3, DES-17 |
| BR10 | Email spente: nessun invio né avviso automatico; condivisione solo manuale. | roadmap |
| BR11 | Preferenze = dati sanitari di terzi: minime, solo per chi dice Sì, trattate come le note (ADR-0002). Dire No cancella le preferenze della persona. | D9, ADR-0002 |
| BR12 | Repository pubblico: seed e test con nomi finti ed email `@example.test`; nessun token o segreto reale in fixture. | project.md |

## Non-functional requirements
- **Accessibilità e mobile:** pagina pubblica da 320 px, testo base 18 px, bersagli ≥ 44 px, scelte etichettate col nome della persona, errori in testo, axe senza violazioni; pulsante "Invia" nel flusso (non fisso); verificata su Safari iOS e nel browser interno di WhatsApp.
- **Aspetto:** tema del matrimonio dal risultato della funzione pubblica, senza lampeggio; chiaro/scuro dal dispositivo; tono "tu".
- **Sicurezza:** ADR-0002 e ADR-0003; round di sicurezza in F3.
- **Test:** orologio iniettabile anche lato server per le scadenze, con la regola di `r2y-test-now` (ignorato in produzione).
- **Prestazioni e costi:** pagina pubblica < 2 s su 4G, nessuna libreria di terzi; Invitati entro i limiti di R-03; solo servizi gratuiti.

## Risposte alle obiezioni F1
- **Accettate (30):** ARC-1 (D3, D4, NFR), ARC-2 (BR9), ARC-3 opzione (a) (BR9, D5), ARC-4 ("Crea link" esplicito, AC1), ARC-5 (BR1, BR3, BR4, D8), ARC-6 (note per F2; AC17 conflitto), ARC-8 (passi riordinati, D1), ARC-9 (AC6, AC10, NFR), ARC-10 (NFR); DES-1 (AC3, NFR), DES-2 (AC1), DES-3 (AC4), DES-4 (AC21, D11), DES-5 (AC7), DES-6 (AC1, AC8, D11), DES-7 (AC17), DES-8 (AC3), DES-9 (AC3, D6), DES-10 (AC15, D12), DES-11 (AC8, AC16), DES-12 (AC11), DES-13 (AC15, D6), DES-14 (AC11), DES-15 (AC8, per F2), DES-16 (D3), DES-18 (AC2, NFR), DES-19 (AC12), DES-20 (AC1), DES-22 (AC10), DES-23 (Scope).
- **Accettate in parte (1):** DES-17: soglie generose e limite per IP solo sui link non validi (BR9); respinto il messaggio identico alla pagina neutra: un invitato con link valido bloccato penserebbe che il link sia morto e chiederebbe un nuovo link; il 429 non rivela nulla sul token (ARC-9).
- **Respinte (2):** ARC-7 alternativa semplice (No multiplo senza Annulla per le preferenze): perdere dati di terzi con un tocco contraddice lo schema Annulla di R-03, e le preferenze sono già leggibili dalla coppia; vale DES-7. DES-21 ("Risposte degli ultimi 7 giorni"): fuori dalla roadmap, la data della risposta è già in lista; seguito possibile.

## Decisions
Tutte **aperte**, da chiedere allo sviluppatore in un solo giro (`question-for-developer`, con la risposta proposta).
| # | Question | Answer | Date |
|---|---|---|---|
| D1 | Divisione: una feature a passi, o FEAT-2026-004 = passo 1 e nuova voce di roadmap per il passo 2? | Proposta: dividere. Il merge va in produzione, quindi i passi non escono separati; il passo 2 (taglia M) arriva dopo, senza urgenza (nozze nel 2027). | aperta |
| D2 | Granularità del link | Proposta: un link per gruppo, con modalità "rispondono insieme" (predefinita) o "ognuno per sé"; senza gruppo, link personale (BR1-BR2). I gruppi di R-03 sono etichette, non sempre famiglie. | aperta |
| D3 | Ricopiare il link in qualsiasi momento | Proposta: sì, con token derivato (HMAC del segreto e dell'id del link), nel DB solo l'hash; nuovo ADR-0003 che precisa ADR-0002 §3. Se no: link visibile solo alla creazione, niente coda né ricopia. | aperta |
| D4 | Nuovo segreto `RSVP_LINK_SECRET` (Vercel produzione e preview, valori diversi, Sensitive) | Proposta: sì. Ruotarlo invalida tutti i link (runbook). Serve solo se D3 = sì. | aperta |
| D5 | Token nel percorso: resta nei log delle richieste di Vercel (breve conservazione, visibili solo al proprietario) e nella cronologia del browser | Proposta: accettare il residuo, scritto in ADR-0003. Alternativa: token nel frammento `#`, più lenta e complessa. | aperta |
| D6 | Pagina pubblica con data/location non scelte | Proposta: link condivisibili con avviso alla coppia; contenuto di AC3 con "da confermare"; nota privacy "Le risposte le vedono solo {A} e {B}, servono per organizzare il matrimonio; per farle cancellare scrivi a loro"; data scelta dopo le risposte: solo avviso (AC15). | aperta |
| D7 | Scadenze | Proposta: scadenza delle risposte facoltativa, nessuna predefinita, dopo sola lettura; il link scade 30 giorni dopo la data scelta (mai, finché la data non è scelta). | aperta |
| D8 | "Da rimandare" e link dormienti | Proposta: sì alla definizione di BR3 e alla riattivazione di BR4 (coerente con "Ripristina"). | aperta |
| D9 | Preferenze alimentari | Proposta: Vegetariano, Vegano, Senza glutine, Senza lattosio + "Allergie o altro" (max 200), solo per chi dice Sì, separate dalle note. | aperta |
| D10 | L'invitato può fare altro oltre a sì/no e preferenze? | Proposta: no (niente +1, nomi, messaggio libero); la pagina dice di scrivere a chi ha invitato. | aperta |
| D11 | "Condiviso il", saluto, coda e avvisi | Proposta: "Condiviso il" registrato al tocco su Copia/Condividi/WhatsApp (con Annulla); saluto e messaggio come AC1; coda "Invia i link" nel passo 2; nessun avviso di nuove risposte. | aperta |
| D12 | Numeri per il catering | Proposta: "Sì 30" con accanto "28 posti" (neonati esclusi); preferenze contate sui Sì, neonati compresi. | aperta |
| D13 | Export | Proposta: JSON con risposte e stato dei link (mai token) nel passo 1; CSV con due colonne in fondo, ignorate dall'importazione, nel passo 2. | aperta |

## Open questions
D1-D13 (Decisions).
