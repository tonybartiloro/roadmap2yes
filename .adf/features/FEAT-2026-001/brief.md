# FEAT-2026-001 — R1 Fondamenta, onboarding guidato, timeline/checklist e budget: brief dei requisiti

<!-- Owner: product-owner. Written in the project's documentation language. Approved at Gate A. -->

| Request | Ticket | Size | Status |
|---|---|---|---|
| "App web per organizzare e tracciare tutto il matrimonio di Tony e Jessica: guida passo passo, budget iniziale modificabile nel tempo, UI cool, hosting free su Vercel" (R1 della roadmap R1–R6) | — | L | draft (round 1 integrato; in attesa di risposte alle domande per lo sviluppatore) |

## Goal
Tony e Jessica hanno appena deciso di sposarsi e non hanno ancora deciso nulla. R1 consegna una prima versione realmente usabile da subito: un'app privata (solo su invito) a cui accedono entrambi, un onboarding che li guida a impostare il progetto, una timeline/checklist personalizzata con le tappe tipiche di un matrimonio italiano e un budget tracciato nel tempo. Poiché la data desiderata (3 settembre 2027) dipende dalla disponibilità della location e restano circa 9 mesi, R1 include anche un modo leggero per confrontare gli scenari di data e le location candidate e registrare la scelta (e le sue revisioni).

Terminologia: **scenario** = data o periodo candidato; **Percorso** = timeline/checklist; **Scelte** = decisioni. Etichette budget in interfaccia: **Assegnato**, **Previsto** (stimato), **Concordato** (impegnato), **Pagato**, **Ancora da pagare** (residuo).

## Scope
- **In:**
  1. **Fondamenta**: progetto web mobile-first, accesso solo su invito (registrazione pubblica chiusa), spazio "matrimonio" condiviso da Tony e Jessica con pari permessi, modello dati/permessi predisposto a ruoli futuri, deploy gratuito (Vercel Hobby + Supabase free), keep-alive del database, ambiente staging separato dalla produzione (Q4), seed con soli dati finti.
  2. **Accesso**: link magico via email + codice a 6 cifre come alternativa, email inviate tramite SMTP gratuito dedicato (Q2, Q3), invito in-app del secondo partner legato alla sua email.
  3. **Onboarding guidato**: nomi, rito (civile / religioso cattolico con effetti civili / simbolico), scenari di data (obiettivo + alternative facoltative), fascia di invitati, budget totale iniziale, stile/atmosfera, regione/comune indicativo.
  4. **Primitiva "decisione" generica** (domanda aperta → opzioni candidate → opzione scelta → riapertura con motivo e storico), riusata in R1 per **data** e **location** in forma leggera (Q1). Gli scenari di data dell'onboarding sono le opzioni della decisione "Data del matrimonio".
  5. **Timeline/Percorso**: generata da modello di tappe italiane con scadenze relative alla data di riferimento; conto alla rovescia; compiti aggiungibili/modificabili/completabili/eliminabili (con "Annulla"); ricalcolo al cambio di data; anteprima di scenario senza salvare; home con "Prossimo passo".
  6. **Budget**: totale modificabile con storico; ripartizione per categoria; per voce Previsto / Concordato / Pagato; acconti e saldi con scadenze; riepilogo e avvisi.
  7. **Storico generale delle modifiche** (audit) a supporto di novità tra partner ed esportazione; UI di storico solo per totale budget e decisioni.
  8. **Esportazione dati** (JSON/CSV) con promemoria "ultimo export".
  9. Design system di base (shadcn/ui, tema elegante chiaro/scuro, WCAG 2.2 AA), convenzioni e linee guida di test definite in questa feature (project.md).
- **Out (rimandato):**
  - **R2**: confronto fornitori con preventivi/contatti; scheda dettagliata location (disponibilità, sopralluoghi, preventivi); **abbinamento data×location** (in R1 data e location sono due decisioni indipendenti più note); collegamento fornitori–budget. In R1 i candidati hanno solo campi leggeri (nome, data/periodo, comune, link, note, pro/contro, costo indicativo opzionale).
  - **R3**: invitati, nuclei, RSVP, sito pubblico. **R4**: abiti, testimoni, documenti (upload), lista nozze. **R5**: tavoli. **R6**: area live del giorno (foto/video, guestbook, slideshow) e storage esterno. **R1 non introduce alcuno storage di file.**
  - Ruoli "famiglia" e "wedding planner": nessuna UI, nessun invito, nessun flusso (solo modello predisposto).
  - Grafo generico di dipendenze tra decisioni (in R1 solo data → timeline), scadenze compresse automatiche o "suggerite", modifica offline (solo online con bozze locali, Q12), promemoria email/push, calendario esterno (ICS), app nativa, multilingua, consulenza legale/burocratica (contenuti indicativi), ripartizione "chi paga cosa", eliminazione di matrimonio/account, moodboard immagini.

## Users and permissions
| Role | Can | Cannot |
|---|---|---|
| Partner (Tony, Jessica) — pari diritti | Tutto sul proprio matrimonio: onboarding, scenari, decisioni (opzioni, scelta, riapertura, reazioni), compiti, budget, esportazione, invitare l'altro partner | Vedere dati di altri matrimoni; essere più di due |
| Famiglia (futuro, non attivo in R1) | — (il modello deve poter esprimere accesso in sola lettura o per area, cambiando una sola mappatura ruolo→permessi) | Nessun accesso in R1 |
| Wedding planner (futuro, opzionale, non attivo in R1) | — (possibile accesso a più matrimoni; il modello non vincola un utente a un solo matrimonio) | Nessun accesso in R1 |
| Anonimo / estraneo autenticato senza invito | Vedere solo login e la pagina "Questo spazio è su invito" | Qualsiasi dato; creare uno spazio |

## User stories
- Come partner, voglio accedere in modo semplice (link o codice via email) e invitare l'altro partner, così che entrambi lavoriamo sugli stessi dati con pari diritti.
- Come partner, voglio rispondere a poche domande iniziali, una per schermata e riprendibili, così che l'app mi proponga un percorso su misura.
- Come partner, voglio registrare e confrontare date e location candidate, segnare quella scelta e poterla riaprire con un motivo, così da prendere con ordine la decisione più urgente.
- Come partner, voglio sapere "cosa fare adesso", vedere una timeline con scadenze italiane e un conto alla rovescia, anche se alcune tappe sono già in ritardo, senza sentirmi sopraffatto.
- Come partner, voglio aggiungere, modificare, completare ed eliminare (con annulla) compiti, così che la lista rifletta la nostra realtà.
- Come partner, voglio fissare un budget, ripartirlo e tracciare Previsto/Concordato/Pagato con acconti e scadenze, così da non sforare.
- Come partner, voglio modificare il budget nel tempo conservando storico e motivo.
- Come partner, voglio sapere cosa ha cambiato l'altro dall'ultima volta che ho aperto l'app.
- Come partner, voglio usare tutto dal telefono con un'interfaccia curata e accessibile.
- Come partner, voglio esportare i miei dati, così da non dipendere dal piano gratuito.

## Acceptance criteria
<!-- Testable, numbered, Given/When/Then when useful. Each AC will map to at least one test. -->
| # | Criterion |
|---|---|
| **Accesso e spazio condiviso** | |
| AC1 | Given un utente non autenticato, when apre qualsiasi pagina dell'app o una API di dati, then viene reindirizzato al login / riceve rifiuto, senza alcun dato. |
| AC2 | Given la registrazione pubblica chiusa, when una persona senza account richiede un link o codice con una email sconosciuta, then non viene creato alcun utente e riceve lo stesso messaggio neutro di un'email valida (nessuna enumerazione di account). |
| AC3 | Given un utente con account (creato dal proprietario) senza matrimonio e senza invito pendente per la sua email, when accede, then vede "Questo spazio è su invito" e non può creare uno spazio. Se è l'account bootstrap del primo partner, accede alla creazione del proprio matrimonio e all'onboarding. |
| AC4 | Given un invito pendente per l'email dell'utente che accede, when accede, then entra direttamente nello spazio invitante e non vede mai la schermata di creazione spazio. |
| AC5 | Given un partner, when invita l'altro (email) da Altro > "Invita il partner", then viene creato un invito legato al matrimonio e a quell'email, monouso, con scadenza a 7 giorni, revocabile, con link condivisibile su qualsiasi canale; stato "In attesa" con "Revoca" e "Invia di nuovo". |
| AC6 | Given un invito, when viene accettato, then l'accettazione verifica nel database email corrispondente, validità, non revoca e limite di 2 partner (anche con accettazioni simultanee); l'invitato ha gli stessi permessi del primo. |
| AC7 | Given un invito scaduto, già usato, revocato, o aperto da un account con email diversa, when l'utente apre il link, then vede un messaggio in italiano con azione (es. "Chiedete un nuovo invito"), senza entrare nello spazio. |
| AC8 | Given il login, when l'utente chiede l'accesso, then riceve via email un link magico e un codice a 6 cifre; il link funziona anche se aperto in un browser diverso da quello della richiesta; il codice è inseribile e copiabile; è presente "Invia di nuovo" con attesa di 30 s; sono gestiti link/codice scaduti e limite di invio email con messaggi chiari. |
| AC9 | Given l'email di accesso, when inviata, then parte da un SMTP gratuito dedicato configurato fuori dal repository e raggiunge un destinatario non membro del progetto Supabase. |
| AC10 | Given due utenti di spazi diversi, when uno tenta di leggere o scrivere dati dell'altro (UI o API diretta), then l'accesso è negato (isolamento a livello di database). |
| AC11 | Given il modello dati, when ispezionato, then ogni dato di dominio appartiene a un matrimonio, l'appartenenza ha un attributo ruolo (partner; famiglia e planner previsti ma non assegnabili da UI), un utente può in teoria appartenere a più matrimoni e tutte le tabelle hanno RLS attiva (verificato in CI). |
| **Onboarding** | |
| AC12 | Given un matrimonio senza onboarding completato, when l'utente lo avvia, then vede una domanda per schermata con indicatore testuale ("Passo 3 di 6") e ordine: nomi dei partner → rito → data obiettivo e alternative facoltative (data o periodo) → fascia di invitati (fino a 50, 50–80, 80–120, oltre, "non lo so") → budget totale → stile (+ nota) → regione/comune; ogni passo salvato appena confermato e riprendibile dall'ultimo non completato. |
| AC13 | Given ogni passo (tranne i nomi), when l'utente sceglie "Non lo so ancora", then il passo è considerato valido e riprendibile da Impostazioni. |
| AC14 | Given l'onboarding confermato, when termina, then vengono creati: scenari di data (opzioni della decisione "Data del matrimonio", una marcata "obiettivo"), budget con categorie predefinite, Percorso generato; l'utente atterra sulla home. |
| AC15 | Given risposte parziali (es. nessuna data), when l'onboarding si chiude, then l'app funziona: il Percorso mostra le tappe indipendenti dalla data e la home propone "Scegliete la data". |
| AC16 | Given onboarding completato, when l'utente (uno o l'altro partner) modifica una risposta da Impostazioni, then compare in Percorso una casella "Suggerimenti da rivedere" con compiti nuovi/non più pertinenti da accettare o ignorare, senza cancellare né aggiungere nulla in automatico; i compiti eliminati dall'utente non vengono ripresentati. |
| **Decisioni (data e location)** | |
| AC17 | Given una decisione aperta, when l'utente aggiunge opzioni (data o periodo; location con nome, comune, link, note, pro/contro, costo indicativo opzionale), then sono elencate e confrontabili: su mobile come carte impilate con righe chiave/valore identiche e azione "Confronta 2" (tabella con colonna etichette fissa e scorrimento orizzontale); da 768 px colonne affiancate. Pro/contro con icona oltre al colore. |
| AC18 | Given opzioni candidate, when un partner sceglie un'opzione e conferma un riepilogo della conseguenza, then la decisione passa a "presa", l'opzione scelta è evidenziata, autore e data sono registrati, le altre restano visibili in una sezione collassabile come "scartate". |
| AC19 | Given una decisione presa, when un partner la riapre indicando un motivo obbligatorio (errore inline se mancante), then torna "aperta" e la scelta precedente resta nello storico con motivo, autore e data. |
| AC20 | Given la decisione "data" riaperta, when si apre Percorso, then un banner indica "data riaperta: scadenze calcolate sull'ultima data scelta" e i compiti dipendenti hanno il badge "Da rivedere" con link alla decisione e azione "Va bene così". Non esiste altro grafo di dipendenze in R1. |
| AC21 | Given una decisione, when si apre il dettaglio, then è visibile lo storico cronologico completo (opzioni aggiunte/scartate, scelte, riaperture, motivi), immutabile, con possibilità di "Aggiungere nota" accodata; nessuna voce è modificabile o eliminabile (neppure via API). Scelta e riapertura cambiano stato e scrivono l'evento in un'unica operazione atomica. |
| AC22 | Given una decisione con opzioni, when un partner esprime una reazione non vincolante (preferisco / dubbioso) su un'opzione, then è visibile all'altro come indicazione e non influisce sullo stato (se Q11 approvata). |
| AC23 | Given il modello "decisione", when si implementa, then è generico (tipo, domanda, opzioni, stato, storico) e R2–R4 possono aggiungere tipi e campi specifici con sole migrazioni additive. |
| **Percorso (timeline/checklist) e home** | |
| AC24 | Given una data di riferimento, when si apre il Percorso, then compaiono compiti derivati da un modello di tappe italiane, ciascuno con titolo, consiglio breve, scadenza calcolata (offset rispetto alla data), categoria e stato. La data di riferimento è l'opzione scelta della decisione "data"; se non presa, l'opzione "obiettivo"; per un periodo si usa il primo giorno. |
| AC25 | Given il rito scelto, when si genera il Percorso, then i compiti specifici compaiono solo se pertinenti (pubblicazioni al comune per civile e religioso con effetti civili; corso prematrimoniale solo per il religioso); le tappe burocratiche riportano "Indicativo: verificate sempre con il comune o la parrocchia". |
| AC26 | Given una data (scelta o provvisoria), when si apre la home, then il conto alla rovescia mostra giorni e settimane aggiornati per giorno (fuso Europe/Rome); con data non scelta è etichettato in testo "provvisoria" ("Se fosse il 3 settembre 2027: …"); senza alcuna data mostra "data da decidere". |
| AC27 | Given la home, when si apre, then mostra una card "Prossimo passo" (1 principale + max 2 secondarie) con ordine: (1) decisione bloccante aperta (data, poi location), (2) compiti scaduti per priorità, (3) pagamenti entro 14 giorni o scaduti, (4) compiti in scadenza entro 30 giorni; poi pagamenti in evidenza e "Novità dall'ultimo accesso". |
| AC28 | Given una data scelta o modificata, when si ricalcola il Percorso, then si aggiornano solo i compiti generati non completati e con scadenza non modificata a mano; gli altri non cambiano. Gli offset usano aritmetica di sole date (mesi/settimane/giorni) con adeguamento a fine mese (31 → 28/29). |
| AC29 | Given tappe la cui scadenza calcolata è già passata, when il Percorso è generato, then nessuna è nascosta: al massimo 3 "da fare per prime" (location/data, budget, lista invitati preliminare) in evidenza e le altre in una sezione "Da recuperare" con tono neutro (icona + testo, non rosso allarme), ordinate per priorità del modello, con la loro scadenza calcolata (nessuna compressione, Q6). |
| AC30 | Given il Percorso, when si apre, then i compiti sono raggruppati per fase ("Adesso", "Da recuperare", "Prossimi 3 mesi", "Più avanti", "Fatti" collassata); filtri (stato, categoria, assegnatario, scadenza) in un pannello con contatore; scorciatoia "Miei / dell'altro partner / Tutti"; usabile a 360 px. |
| AC31 | Given un compito, when l'utente lo aggiunge (titolo, scadenza opzionale, categoria, note, assegnatario opzionale tra i partner), modifica, completa con checkbox, riapre o elimina, then lo stato cambia; l'eliminazione mostra "Annulla" per almeno 8 s e l'elemento resta in "Eliminati di recente" ripristinabile; i compiti generati eliminati non si rigenerano e non vengono ri-suggeriti. Nessuna azione richiede lo swipe. |
| AC32 | Given scenari di data non decisi, when l'utente seleziona uno scenario per "Anteprima", then un banner fisso non chiudibile ("Anteprima: 3 set 2027 — nulla è salvato", con "Esci" e "Scegli questa data") accompagna le scadenze ricalcolate con stile distinto; nessun dato viene scritto; per un periodo si indica "calcolata dal primo giorno". |
| **Budget** | |
| AC33 | Given un matrimonio, when l'utente imposta o modifica il budget totale (euro), then si crea una versione con importo, data, autore e motivo opzionale; nessuna sovrascrittura; lo storico è consultabile. Ridurre il totale sotto il Concordato è consentito con avviso informativo non bloccante. |
| AC34 | Given il budget, when l'utente lo ripartisce in categorie (predefinite in italiano: location, catering, abiti, fotografo/video, musica, fiori e allestimento, fedi, partecipazioni, viaggio di nozze, burocrazia/varie, imprevisti; aggiungibili/rinominabili/eliminabili), then ogni categoria ha un importo Assegnato tramite campi numerici (nessuno slider) e il totale non assegnato è sempre visibile. |
| AC35 | Given una categoria, when l'utente aggiunge una voce (descrizione, importo Previsto, stato: Previsto / Concordato / Annullata, importo Concordato quando fissato), then la categoria mostra totali di Previsto, Concordato e Pagato. |
| AC36 | Given una voce Concordata, when l'utente registra pagamenti (acconto/saldo/altro, importo, scadenza, pagato o da pagare, data pagamento), then Pagato e Ancora da pagare si aggiornano e "Prossimi pagamenti" è in ordine di scadenza. |
| AC37 | Given il riepilogo, when si apre, then per totale e per categoria mostra Assegnato, Previsto, Concordato, Pagato, Ancora da pagare, con una barra per categoria (Concordato su Assegnato, Pagato incluso) più un numero chiave e il dettaglio al tocco; le barre hanno testo equivalente ("62% concordato"). Quando Concordato > Assegnato (categoria) o > totale, compare un avviso con icona + testo caldo ("Siete oltre di € 1.200 su Catering") in colore non rosso pieno. |
| AC38 | Given un campo importo, when l'utente digita, then accetta virgola o punto, formatta in italiano (1.234,56) a fine digitazione, ha tastiera numerica; accetta solo valori ≥ 0 con al massimo 2 decimali e mostra errore inline "Inserite un importo in euro, ad esempio 1.500,00"; il database rifiuta importi negativi (centesimi interi). |
| **Stati, novità, esportazione** | |
| AC39 | Given qualsiasi lista o schermata, when è vuota, in caricamento, in errore, offline, con DB in pausa, o in conflitto, then mostra lo stato corrispondente: elenco vuoto con spiegazione e azione; skeleton; errore con "Riprova" mantenendo i dati già mostrati; banner "Siete offline" con bozza locale conservata nei moduli; pagina "Il servizio si sta svegliando, riprovate tra un minuto". |
| AC40 | Given due partner che modificano lo stesso elemento, when il secondo salva dopo che l'elemento è cambiato, then la modifica non sovrascrive in silenzio: dialog "Jessica ha modificato questo elemento 2 minuti fa" con "Vedi cosa è cambiato / Salva comunque / Annulla". |
| AC41 | Given modifiche fatte dall'altro partner, when l'utente apre la home, then "Novità dall'ultimo accesso" elenca le modifiche rilevanti recenti dell'altro (es. "Jessica ha scelto la location"). |
| AC42 | Given un partner, when richiede l'esportazione da Altro, then ottiene, con barra di avanzamento e nome file con data, un file con tutti i dati del matrimonio (impostazioni, decisioni e storico, compiti, budget e storico, pagamenti) in JSON e CSV per compiti e budget; la home mostra "ultimo export: N giorni fa" con promemoria dopo 30 giorni. |
| **Qualità, deploy, sicurezza** | |
| AC43 | Given una PR, when la CI gira, then eseguono lint, typecheck, test unitari (calcolo budget, motore timeline), test DB di isolamento/RLS ed e2e sui flussi principali con dati finti; la preview Vercel usa il progetto Supabase di staging (non produzione); il merge su main distribuisce in produzione applicando le migrazioni (additive). |
| AC44 | Given la produzione, when passa un giorno, then un job pianificato giornaliero esegue una vera query sul database e registra un heartbeat consultabile; un job settimanale secondario lo richiama anche sullo staging; un fallimento è notificato dallo scheduler. |
| AC45 | Given il repository pubblico, when ispezionato (inclusa cronologia, log ed artefatti CI), then non contiene segreti, `.env`, email reali, dump di database o dati personali reali; la scansione segreti è attiva in CI. |

## Business rules and edge cases
| # | Rule / case | Source (developer, ticket, existing behaviour) |
|---|---|---|
| BR1 | Un solo matrimonio per spazio in R1 (UI); i due partner hanno pari diritti su tutto, senza approvazione reciproca. La trasparenza è garantita da storico, "Novità dall'ultimo accesso" e (se approvate) reazioni. | Developer (risposta 3); DES-8 |
| BR2 | Lingua italiana, euro con importi in centesimi interi, date gg/mm/aaaa, scadenze come date di calendario senza orario, "oggi" calcolato in Europe/Rome. | Developer (risposta 1); ARC-7 |
| BR3 | Data desiderata 3/9/2027 "non prima"; alternative: mag–giu 2028 e set 2028. Una data candidata precedente al 3/9/2027 genera avviso, non blocco. Per scenari di tipo periodo il calcolo usa il primo giorno, indicato in chiaro (Q10). | Developer (risposta 7) |
| BR4 | Tutto è rivedibile; riaprire richiede un motivo; storico decisioni, versioni di budget ed eventi non sono modificabili né eliminabili dall'utente (immutabilità imposta nel database). Un refuso si corregge con una nota accodata. | Developer (richiesta); ARC-6 |
| BR5 | I compiti generati sono copie dal modello con riferimento a tappa e versione del modello; modificare uno non altera il modello; il ricalcolo agisce solo sui compiti non completati e con scadenza non modificata a mano. | PO; ARC-7 |
| BR6 | I compiti completati non si riaprono né cancellano automaticamente; eliminare un compito generato è un'eliminazione logica ripristinabile e non lo rigenera né ri-suggerisce. | PO; ARC-7 |
| BR7 | Il modello di tappe è contenuto di prodotto (dati nel repo, versionato), indicativo, da validare (Q5). Esempi: location e data (12+ mesi), budget, lista invitati preliminare, fornitori chiave, pubblicazioni al comune, documenti per rito religioso, corso prematrimoniale (solo religioso), prova abiti, partecipazioni. | Guidance coordinatore |
| BR8 | Per voce, Pagato > Concordato genera avviso con conferma, non blocco. Voce Annullata esclusa da Previsto/Concordato; i pagamenti già effettuati restano visibili come "da recuperare". | PO |
| BR9 | Concorrenza: controllo ottimistico (versione dell'elemento); nessun realtime né merge, solo dialog di conflitto (AC40). | PO; ARC-8 |
| BR10 | Budget non impostato: l'app funziona e mostra "Budget da definire". Ridurre il totale sotto il Concordato è consentito con avviso. | PO |
| BR11 | Eliminazione di matrimonio/account fuori da R1: esiste solo l'esportazione. | PO |
| BR12 | Accesso solo su invito: i due account iniziali sono creati dal proprietario dal pannello Supabase; le email consentite non compaiono mai nel repository. Max 2 partner per matrimonio, forzato nel database con protezione dalle gare. | ARC-2; DES-1 |
| BR13 | Un invito pendente ha precedenza: l'utente che accede con quell'email non può mai creare un proprio spazio. | DES-1 |
| BR14 | Lo storico generale (audit) registra attore, ora e valori prima/dopo di ogni modifica ai dati di dominio; la UI di storico in R1 copre solo budget totale e decisioni. | ARC-8 |
| BR15 | Tono: "voi" per i testi di coppia (Q13), nomi propri per le attribuzioni, mai colpevolizzante, niente emoji nei testi di sistema; in interfaccia mai il termine "impegnato" (usare "Concordato"). | DES-9, DES-14 |

## Non-functional requirements
- **Costo**: solo servizi gratuiti (Vercel Hobby, Supabase free con 0,5 GB DB e pausa dopo ~7 giorni di inattività, SMTP gratuito, GitHub Actions su repo pubblico). Possono servire due progetti Supabase free (produzione + staging, Q4). Nessuna funzionalità richiede carta di credito. R1 non introduce storage di file.
- **Privacy/sicurezza**: dati personali solo nel database, mai nel repo pubblico; RLS come unico confine di autorizzazione, con test automatici di isolamento (AC10); segreti solo in variabili d'ambiente/impostazioni dei servizi; il token di invito è monouso e conservato in forma non reversibile; la chiave di servizio non è mai esposta al client; dati utente mai in cache condivisa; HTTPS; `noindex` su tutta l'app inclusa la pagina di login; Deployment Protection sulle preview; nessun dato di terzi/invitati in R1.
- **Mobile-first e UI**: progettazione per 360–430 px, poi tablet/desktop; navigazione con barra inferiore (Home, Percorso, Scelte, Budget, Altro) e sidebar da 768 px, pensata per aggiungere aree R2–R6 sotto "Altro" o "Scelte"; aspetto elegante e coerente (design system shadcn/ui, tema chiaro/scuro/sistema, direzione visiva da Q14); font self-hosted (max 2 famiglie).
- **Accessibilità**: **WCAG 2.2 AA verificabile** (contrasto testo ≥4,5:1 e componenti ≥3:1, focus visibile e non oscurato da barre fisse, target ≥44 px per azioni primarie, alternative al trascinamento, nessun dato da reinserire, autenticazione senza test cognitivi, stati mai solo cromatici, focus trap in dialog/sheet, toast `aria-live`, `prefers-reduced-motion`, zoom 200%, `lang="it"`, input ≥16 px). Controlli di accettazione visiva in design.md.
- **Prestazioni**: LCP della home < 3 s su 4G; azioni comuni con aggiornamento ottimistico e rollback.
- **Compatibilità**: ultime 2 versioni di Safari iOS, Chrome Android/desktop, Safari/Firefox/Edge desktop; installabile come PWA è nice-to-have (manifest e `theme-color` presenti).
- **Affidabilità**: migrazioni versionate e additive (compatibili con il deploy in parallelo); esportazione come backup effettivo; keep-alive con heartbeat; nessuna dipendenza da backup del piano free.
- **Qualità**: lint, typecheck, test unitari e di integrazione (budget, timeline, RLS) ed e2e in CI con email locale simulata e solo dati finti.

## Decisions
<!-- Answers from the developer, so nobody asks twice. -->
| # | Question | Answer | Date |
|---|---|---|---|
| D1 | Lingua | Italiano per chat, docs e interfaccia | 2026-11-23 |
| D2 | Stack | Approvato; frontend React | 2026-11-23 |
| D3 | Utenti | Tony e Jessica ora; ruoli futuri famiglia e wedding planner (opzionale) | 2026-11-23 |
| D4 | Repo e rilascio | Repo pubblico GitHub; preview Vercel per PR; merge su main = produzione | 2026-11-23 |
| D5 | Date | 3/9/2027 non prima; alternative mag–giu 2028 o set 2028 | 2026-11-23 |
| D6 | Primo passo | Partire da R1 | 2026-11-23 |
| D7 | Costo | Tutto gratuito, storage incluso | 2026-11-23 |

## Open questions
<!-- Must be empty (or explicitly deferred) at Gate A. Each: question-for-developer, with proposed answer. -->
- **Q1 — Decisione generica e candidati data/location in R1?** Proposta: SÌ, primitiva generica ora, usata in forma leggera per data e location (opzioni con campi leggeri; niente preventivi, contatti, sopralluoghi, disponibilità, né abbinamento data×location: R2). Motivo: la scelta data/location è urgente (~9 mesi) e farlo ora evita di rifare il modello in R2. Alternativa: rimandare a R2.
- **Q2 — Accesso.** Proposta: registrazione pubblica chiusa; i due account creati manualmente dal proprietario dal pannello Supabase (nessun codice dedicato) e invito in-app per il secondo partner legato all'email; login con link magico più codice a 6 cifre (copia/incolla) come alternativa; nessun login social. Motivo: evita estranei sull'app pubblica e consuma meno quota email.
- **Q3 — Mittente SMTP e dominio.** Il servizio email integrato di Supabase non consegna a Jessica se non è membro del progetto. Proposta: SMTP Gmail con password per app dell'account del proprietario (2FA, ~500/giorno, nessun dominio, credenziali solo nel pannello Supabase). Alternativa: Brevo free (300/giorno, mittente verificato). Possedete un dominio?
- **Q4 — Progetto Supabase di staging.** Proposta: SÌ, un secondo progetto Supabase gratuito solo con dati finti per le preview delle PR (le preview non toccano i dati reali), con keep-alive anche per lui; produzione = merge su main. Alternativa: una sola base dati (rischio per i dati reali, migrazioni non riviste in produzione).
- **Q5 — Riti e contenuti delle tappe.** Proposta: tre riti (civile, religioso cattolico con effetti civili, simbolico); altri riti fuori scope. Redigo io il modello di tappe come "indicativo" sulle regole generali italiane e voi lo validate al comune/parrocchia. Confermate che il rito cattolico è di interesse e se avete già un'idea del rito?
- **Q6 — Tappe già in ritardo.** Proposta: nessuna nascosta e nessuna compressione automatica; al massimo 3 in evidenza (location/data, budget, lista invitati preliminare), le altre in "Da recuperare" con tono calmo e scadenza calcolata. Una scadenza compressa "suggerita" è un follow-up. Alternativa: includerla in R1 (più costo).
- **Q7 — Budget: contributi.** Proposta: un solo budget comune di coppia senza tracciare chi paga, contributi dei genitori o regali in denaro. I contributi ridurranno il budget da monitorare? In tal caso inseritelo come totale netto.
- **Q8 — Promemoria.** Proposta: solo in-app in R1 (home con scaduti/in scadenza); niente email/push/ICS. Alternativa: email settimanale di riepilogo (aggiunge configurazione).
- **Q9 — Stile.** Proposta: etichetta scelta (classico, rustico, boho, moderno, mare, borgo…) più nota libera, usata solo per suggerimenti testuali; nessun moodboard.
- **Q10 — Scenario "periodo".** Proposta: per un periodo (es. maggio–giugno 2028) timeline e anteprima usano il primo giorno (scadenze più prudenti), indicato in chiaro.
- **Q11 — Reazioni dei partner.** Proposta: SÌ, reazione leggera non vincolante (preferisco / dubbioso) su ogni opzione, per decidere in coppia senza voti formali (AC22). Alternativa: ometterla.
- **Q12 — Offline.** Proposta: R1 solo online con bozze locali dei moduli, nessuna modifica offline.
- **Q13 — Tono.** Proposta: "voi" per i testi di coppia (alternativa "tu").
- **Q14 — Direzione visiva.** Proposta: A "Giardino" (avorio caldo, verde salvia, oro antico; Fraunces + Figtree), consigliata dal designer; alternativa B "Sera" (blu notte, terracotta; Instrument Serif + Manrope). Vedi design.md §5.
