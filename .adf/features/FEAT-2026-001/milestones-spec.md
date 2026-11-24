# FEAT-2026-001 — Specifica delle tappe e delle frasi di stile (T0)

<!-- Owner: product-owner. Input per T4 (src/content/milestones/*) e T10 (src/content/style-tips.ts). Contenuto di prodotto indicativo, da validare (BR7, Q5). -->

| Versione modello | Autore | Data | AC collegati |
|---|---|---|---|
| `1.0.0` (ogni tappa `version: 1`) | product-owner | 2026-11-24 | AC15, AC20, AC24, AC25, AC26, AC28, AC29, AC30, AC63, BR7, D28, D36 |

## 1. Come leggere la specifica

**Campi** (corrispondono a quelli del piano §5: `key`, `version`, `title`, `advice`, `category`, `offset|null`, `rites`, `priority`, `highlightFirst`, `bureaucratic`).

| Campo | Significato |
|---|---|
| `id` (= `key`) | kebab-case, stabile per sempre: non si rinomina mai (i compiti generati lo referenziano, BR5). Per cambiare il significato si crea una nuova tappa. |
| `title` | Infinito, senza punto finale, max 60 caratteri (stile del design: "Prenotare il fotografo"). |
| `advice` | Consiglio breve, 1–2 frasi, "tu" informale, tono caldo, max 220 caratteri, senza emoji e senza colpevolizzare. |
| `category` | Una di: `organizzazione`, `location`, `catering`, `abiti`, `foto-video`, `musica`, `fiori-allestimento`, `fedi`, `partecipazioni`, `viaggio-nozze`, `burocrazia-varie`, `imprevisti`. Le ultime 11 sono le categorie di budget di AC34 (location, catering, abiti, fotografo/video, musica, fiori e allestimento, fedi, partecipazioni, viaggio di nozze, burocrazia/varie, imprevisti); `organizzazione` è una categoria **solo di compiti** (nessun budget associato). T4/T5 mantengano la mappatura id → etichetta italiana in un solo posto. |
| `offset` | Anticipo rispetto alla data di riferimento, come `{ months, weeks, days }` (interi, tutti facoltativi, **positivi = prima della data, negativi = dopo**). `null` = indipendente dalla data. Aritmetica di AC28 e piano §5: **prima i mesi** (con adeguamento a fine mese), **poi settimane e giorni**. |
| `priority` | Intero, **più basso = più importante**. Usato per "Da recuperare" (AC29) e per l'ordine a parità di scadenza. Parità: prima scadenza più lontana nel passato, poi `id` in ordine alfabetico. I valori hanno salti (5, 10, 12 …) per inserire tappe future senza rinumerare. |
| `highlightFirst` | Le tappe "da fare per prime" (AC29): al massimo 3 tra location/data, budget, lista invitati preliminare. Più la tappa speciale "Scegliere il rito" (solo rito "non lo so"). |
| `rites` | Sottoinsieme di `civile`, `religioso`, `simbolico`, `unknown` ("non lo so"). Vedi §1.1. |
| `bureaucratic` | `true` = mostra "Indicativo: verificate sempre con il comune o la parrocchia" (AC25) nel dettaglio. |
| `dependsOn` | `date` per tutte le tappe con `offset` (sono quelle che ottengono `needs_review` quando la decisione "data" viene riaperta, AC20, e che si ricalcolano, AC28). Le tappe con `offset: null` non dipendono da nessuna decisione e **non** ricevono mai il badge "Da rivedere". In R1 non esiste altro grafo di dipendenze (la location, per esempio, è solo menzionata nei consigli). |

### 1.1 Riti
Il brief (D14, AC12) prevede tre riti più "non lo so": **civile**, **religioso** (cattolico con effetti civili), **simbolico**, e `unknown`. Non esiste una voce separata "religioso senza effetti civili" in R1. Regola (AC63, D36): con rito `unknown` si generano **solo** le tappe il cui `rites` include `unknown` (cioè le comuni + "Scegliere il rito"); le tappe specifiche di un rito arrivano solo come "Suggerimenti da rivedere" dopo che il rito è impostato (AC16, AC48).

Sigle nelle tabelle: **TUTTI** = civile, religioso, simbolico, unknown. **C** civile, **R** religioso, **S** simbolico, **U** unknown.

### 1.2 Avviso burocratico
Testo unico, costante in un solo punto (AC25): **"Indicativo: verificate sempre con il comune o la parrocchia"**. Nota: design §7.1 riporta la variante "verifica sempre …" (singolare); vale la forma di AC25, plurale, e il designer allinea il copy.

## 2. Catalogo delle tappe (54)

Legenda offset: `12m` = 12 mesi prima; `2m+2w` = 2 mesi e 2 settimane prima (mesi per primi); `5w` = 5 settimane prima; `3d` = 3 giorni prima; `-2w` = 2 settimane **dopo** la data; `—` = indipendente dalla data.

### 2.1 Tappe comuni a tutti i riti (37, `rites` = TUTTI)

**Indipendenti dalla data** (si vedono sempre, anche senza data, AC15)

| # | id | title | advice | category | offset | prio | HF |
|---|---|---|---|---|---|---|---|
| 1 | `scegli-data-e-location` | Scegliere data e location | Tutto il resto ruota attorno a questa scelta. Confronta le opzioni in Scelte e registra la decisione quando l'avete presa. Spunta questa tappa solo allora. | location | — | 10 | sì |
| 2 | `definisci-budget-iniziale` | Fissare il budget iniziale | Parti da una cifra indicativa, anche approssimativa: la potrai cambiare. Poi ripartiscila per categoria, così sai subito dove stai spendendo di più. | organizzazione | — | 20 | sì |
| 3 | `lista-invitati-preliminare` | Fare la lista preliminare degli invitati | Basta una stima onesta, anche solo un numero. Serve per scegliere location e catering e per capire quanto costerà davvero la giornata. | organizzazione | — | 30 | sì |
| 4 | `decidi-stile-e-priorita` | Decidere lo stile e le priorità | Parlate di che giornata sognate e di tre cose a cui non volete rinunciare. Ti aiuterà a dire dei no quando i preventivi iniziano ad arrivare. | organizzazione | — | 90 | no |

**Legate alla data** (`dependsOn: date`)

| # | id | title | advice | category | offset | prio |
|---|---|---|---|---|---|---|
| 5 | `conferma-location-e-caparra` | Confermare la location e versare la caparra | Chiedi per iscritto cosa è incluso e quali sono le condizioni di disdetta prima di versare la caparra. Annota la scadenza del saldo tra i pagamenti. | location | 12m | 12 |
| 6 | `scegli-catering` | Scegliere il catering | Se la location ha già il suo catering, confronta il suo menù con almeno un'alternativa. Chiedi cosa è compreso: servizio, bevande, taglio della torta. | catering | 11m | 25 |
| 7 | `prenota-foto-e-video` | Prenotare fotografo e videomaker | Guarda album completi, non solo le foto migliori, e scegli qualcuno con cui ti trovi bene. I più richiesti si prenotano molto in anticipo. | foto-video | 10m | 35 |
| 8 | `scegli-testimoni` | Scegliere i testimoni | Parlane di persona con chi hai in mente, così può organizzarsi. Di solito i testimoni sono due, ma controlla cosa richiede il tuo tipo di rito. | organizzazione | 8m | 55 |
| 9 | `scegli-abiti` | Scegliere gli abiti | Se vuoi un abito su misura o da ordinare, i tempi sono lunghi: parti presto. Per entrambi, meglio provare più di un negozio o sartoria. | abiti | 9m | 40 |
| 10 | `scegli-musica` | Scegliere musica e intrattenimento | Decidi se vuoi un DJ, una band o entrambi, e ascolta qualcosa dal vivo o in video. Racconta la tua scaletta ideale: aiuta a fare un preventivo preciso. | musica | 9m | 45 |
| 11 | `save-the-date` | Mandare il save the date | Un messaggio semplice basta per far bloccare la data agli invitati, soprattutto se vengono da lontano o in alta stagione. È facoltativo, ma utile. | partecipazioni | 8m | 85 |
| 12 | `prenota-viaggio-nozze` | Prenotare il viaggio di nozze | Scegli prima il periodo, poi la meta. Chiedi se le condizioni permettono di cambiare data, nel caso la giornata si sposti. | viaggio-nozze | 8m | 70 |
| 13 | `apri-lista-nozze` | Aprire la lista nozze | Scegli un negozio o un servizio con cui ti trovi comodo e metti oggetti a più prezzi. Se preferisci un contributo per il viaggio, fa lo stesso. | organizzazione | 7m | 80 |
| 14 | `scegli-fiori-allestimento` | Scegliere fiori e allestimento | Porta alla fiorista qualche immagine e il tuo budget: lavora meglio con dei limiti chiari. Controlla cosa ammette la location. | fiori-allestimento | 6m | 60 |
| 15 | `scegli-fedi` | Scegliere le fedi | Provale a mano, non solo in foto: comfort ed effetto cambiano molto. Se vuoi un'incisione, chiedi i tempi di consegna. | fedi | 6m | 62 |
| 16 | `alloggi-invitati` | Pensare agli alloggi per gli invitati | Se qualcuno viene da fuori, segnala due o tre hotel vicini e chiedi se c'è una tariffa per gruppi. Meglio avvisare con largo anticipo. | organizzazione | 6m | 88 |
| 17 | `prenota-acconciatura-trucco` | Prenotare acconciatura e trucco | Scegli chi può raggiungervi in location o a casa, e chiedi se include la prova. Nelle date più richieste si riempiono presto. | abiti | 5m | 75 |
| 18 | `ordina-partecipazioni` | Ordinare le partecipazioni | Decidi testo, formato e quantità (di solito una per nucleo, non per persona). Lascia tempo per le bozze e per la stampa. | partecipazioni | 5m | 65 |
| 19 | `degustazione-menu` | Fare la degustazione del menù | Vai con una lista di domande su porzioni, intolleranze e menù per bambini. Prendi appunti subito: servirà per il menù definitivo. | catering | 4m | 68 |
| 20 | `scegli-bomboniere` | Scegliere le bomboniere | Se vuoi le bomboniere, decidi il tipo e la quantità in base alla lista degli invitati. Alcune hanno tempi di consegna lunghi. | burocrazia-varie | 4m | 95 |
| 21 | `prima-prova-abiti` | Fare la prima prova degli abiti | Porta le scarpe e gli accessori che pensi di usare. Chiedi alla sartoria quante prove sono previste e quando. | abiti | 4m | 72 |
| 22 | `prenota-trasporti` | Organizzare i trasporti | Pensa all'auto per voi due e, se serve, a una navetta per gli invitati. Verifica gli orari con la location. | organizzazione | 4m | 82 |
| 23 | `piano-b-imprevisti` | Preparare un piano B per gli imprevisti | Se parte della giornata è all'aperto, chiedi alla location cosa succede in caso di pioggia. Tieni una piccola riserva di budget per le cose impreviste. | imprevisti | 3m | 92 |
| 24 | `documenti-viaggio-nozze` | Controllare i documenti per il viaggio di nozze | Verifica che i passaporti siano validi per la tua meta e se servono visti o vaccinazioni. Meglio non scoprirlo all'ultimo. | viaggio-nozze | 3m | 78 |
| 25 | `invia-partecipazioni` | Spedire le partecipazioni | Aggiungi una data entro cui confermare la presenza. Segnati a chi hai già scritto, per non dimenticare nessuno. | partecipazioni | 2m+2w | 50 |
| 26 | `raccogli-conferme` | Raccogliere le conferme degli invitati | Insisti con gentilezza con chi non ha ancora risposto: un messaggio breve basta. Chiedi anche di eventuali intolleranze. | organizzazione | 5w | 58 |
| 27 | `riconferma-fornitori` | Riconfermare i fornitori | Scrivi a tutti con data, orario e luogo, e chiedi a ciascuno un recapito per il giorno stesso. Così sei tranquillo. | organizzazione | 6w | 52 |
| 28 | `prova-acconciatura-trucco` | Fare la prova di acconciatura e trucco | Porta una foto di quello che hai in mente e l'abito, o almeno la scollatura. Scatta qualche foto alla prova per vedere l'effetto. | abiti | 6w | 87 |
| 29 | `numero-finale-e-menu` | Comunicare numero finale di ospiti e menù | Dai al catering il numero definitivo, le intolleranze e le sistemazioni dei bambini. Chiedi fino a quando puoi ancora fare modifiche. | catering | 4w | 42 |
| 30 | `organizza-tavoli` | Organizzare i tavoli | Parti dai gruppi che si conoscono già e sistema per ultimi i casi difficili. Una bozza su carta aiuta più di mille idee in testa. | organizzazione | 3w | 66 |
| 31 | `prova-finale-abiti` | Fare la prova finale degli abiti | Prova tutto insieme: abito, scarpe, accessori. Se qualcosa va ritoccato, c'è ancora il tempo di farlo. | abiti | 3w | 73 |
| 32 | `programma-giornata` | Scrivere il programma della giornata | Scrivi gli orari: preparazione, cerimonia, foto, pranzo, taglio della torta. Condividilo con fornitori e testimoni. | organizzazione | 3w | 64 |
| 33 | `ritira-abiti-fedi` | Ritirare abiti e fedi | Controlla che sia tutto come ordinato e affida le fedi a una persona fidata. Chiedi dove appendere o riporre l'abito. | abiti | 1w | 74 |
| 34 | `prepara-saldi-fornitori` | Preparare i saldi ai fornitori | Controlla in Budget quali pagamenti restano e quando. Prepara contanti o bonifici e chi li consegna il giorno stesso. | organizzazione | 1w | 38 |
| 35 | `kit-emergenza` | Preparare il kit di emergenza e gli ultimi dettagli | Metti in una borsa fazzoletti, spille, cerotti, ago e filo, trucco per i ritocchi. Ripassa la lista delle cose da portare. | imprevisti | 3d | 98 |
| 36 | `biglietti-ringraziamento` | Scrivere i biglietti di ringraziamento | Qualche riga a mano vale più di un messaggio di gruppo. Ricorda di citare qualcosa di specifico che ti ha colpito. | partecipazioni | -2w | 120 |
| 37 | `chiudi-conti-budget-finale` | Chiudere i conti e il budget finale | Registra gli ultimi pagamenti e controlla che il Pagato torni con le ricevute. Ti resta un quadro chiaro di quanto è costato davvero. | organizzazione | -4w | 110 |

### 2.2 Tappe specifiche per rito (16)

**Rito civile e religioso con effetti civili** (bureaucratic = sì per tutte tranne dove indicato)

| # | id | title | advice | category | offset | prio | rites | bureaucratic |
|---|---|---|---|---|---|---|---|---|
| 40 | `documenti-pubblicazioni` | Raccogliere i documenti per le pubblicazioni | Chiedi al comune di residenza quali documenti servono e se è possibile presentarli online. Controlla la validità dei tuoi documenti d'identità. | burocrazia-varie | 5m | 29 | C, R | sì |
| 41 | `richiedi-pubblicazioni` | Richiedere le pubblicazioni | Le pubblicazioni sono un passaggio obbligato prima del matrimonio civile o religioso con effetti civili. Chiedi al comune tempi e validità: non conviene farle né troppo presto né troppo tardi. | burocrazia-varie | 4m | 28 | C, R | sì |
| 42 | `regime-patrimoniale` | Pensare al regime patrimoniale | Parlane insieme prima della giornata: comunione o separazione dei beni è una scelta da fare con consapevolezza. Se hai dubbi, un notaio può spiegartela. | burocrazia-varie | 2m | 56 | C, R | sì |
| 43 | `documenti-testimoni` | Ricordare ai testimoni i documenti | Chiedi a ciascun testimone di portare un documento d'identità valido. Controlla con il comune o la parrocchia se serve altro. | burocrazia-varie | 1m | 57 | C, R | sì |

**Solo rito civile**

| # | id | title | advice | category | offset | prio | rites | bureaucratic |
|---|---|---|---|---|---|---|---|---|
| 39 | `contatta-comune-celebrazione` | Contattare il comune per la celebrazione | Chiedi quali sale ci sono, i giorni disponibili, i costi e come prenotare. Se vuoi sposarti fuori dal comune, domanda se è possibile. | burocrazia-varie | 10m | 18 | C | sì |

**Civile e simbolico**

| # | id | title | advice | category | offset | prio | rites | bureaucratic |
|---|---|---|---|---|---|---|---|---|
| 44 | `letture-musica-cerimonia` | Scegliere letture e musica della cerimonia | Una o due letture e un brano per l'ingresso bastano per renderla vostra. Chiedi chi può leggere e se serve un microfono. | musica | 3m | 76 | C, S | no |

**Solo rito religioso (cattolico con effetti civili)**

| # | id | title | advice | category | offset | prio | rites | bureaucratic |
|---|---|---|---|---|---|---|---|---|
| 45 | `contatta-parrocchia` | Parlare con la parrocchia | Contatta il parroco per la data, la chiesa e i passaggi da seguire. Chiedi anche cosa è permesso per fiori, foto e musica. | burocrazia-varie | 12m | 14 | R | sì |
| 46 | `corso-prematrimoniale` | Iscriversi al corso prematrimoniale | Informati sulle date dei corsi: possono riempirsi o richiedere più incontri. Iscriviti presto per non rischiare di restare fuori. | burocrazia-varie | 9m | 24 | R | sì |
| 47 | `certificati-parrocchia` | Chiedere i certificati per la parrocchia | Chiedi in parrocchia quali certificati servono e quanto tempo restano validi. Richiedili nella parrocchia dove hai ricevuto i sacramenti. | burocrazia-varie | 5m | 26 | R | sì |
| 48 | `colloquio-parroco` | Fare il colloquio con il parroco | Fissa con la parrocchia il colloquio o l'istruttoria matrimoniale. Chiedi cosa portare e se serve la presenza di tutti e due. | burocrazia-varie | 4m | 31 | R | sì |
| 49 | `liturgia-letture-canti` | Scegliere letture e canti della celebrazione | Scegli con il parroco letture, canti e chi li leggerà. Se vuoi un libretto della messa, ordina per tempo. | musica | 2m | 77 | R | no |
| 50 | `fiori-addobbi-chiesa` | Pensare ai fiori e agli addobbi della chiesa | Chiedi alla parrocchia cosa è consentito e se c'è già un allestimento. Coordina colori e stile con quelli del ricevimento. | fiori-allestimento | 3m | 79 | R | no |

**Solo rito simbolico**

| # | id | title | advice | category | offset | prio | rites | bureaucratic |
|---|---|---|---|---|---|---|---|---|
| 51 | `scegli-celebrante` | Scegliere chi celebra la cerimonia | Può essere un amico, un familiare o un celebrante professionista. Parlane presto: il suo ruolo è importante e va preparato. | organizzazione | 8m | 32 | S | no |
| 52 | `valuta-matrimonio-civile` | Decidere se sposarvi anche civilmente | Una cerimonia simbolica non ha valore legale. Se volete anche gli effetti civili, informatevi al comune su tempi e modalità. | burocrazia-varie | 9m | 22 | S | sì |
| 53 | `scrivi-promesse-copione` | Scrivere le promesse e il copione | Scrivete le vostre promesse e un breve copione con i momenti chiave. Fate una prova ad alta voce con chi condurrà. | organizzazione | 2m | 84 | S | no |

### 2.3 Tappa speciale: rito "non lo so" (AC63, D36)

| # | id | title | advice | category | offset | prio | rites | HF | bureaucratic |
|---|---|---|---|---|---|---|---|---|---|
| 54 | `scegli-il-rito` | Scegliere il rito | Civile, religioso o simbolico: dalla scelta dipendono le tappe che ti proponiamo. Puoi cambiare idea quando vuoi dalle Impostazioni. | organizzazione | — | 5 | U | sì | no |

Regole d'uso: appare in "Adesso" (via la regola (c) del piano §5: tappa in evidenza senza scadenza). Ha priorità 5, più bassa di tutte, così è sempre la prima. Quando il rito viene impostato la tappa diventa "non più pertinente" (suggerimento da accettare/ignorare, AC16): non si cancella da sola.

### 2.4 Conteggi

| Rito | Tappe comuni | Specifiche | Totale | Di cui indipendenti dalla data | Di cui burocratiche |
|---|---|---|---|---|---|
| Civile | 37 | 6 (39, 40, 41, 42, 43, 44) | **43** | 4 | 5 (39, 40, 41, 42, 43) |
| Religioso | 37 | 10 (40, 41, 42, 43, 45, 46, 47, 48, 49, 50) | **47** | 4 | 8 (40, 41, 42, 43, 45, 46, 47, 48) |
| Simbolico | 37 | 4 (44, 51, 52, 53) | **41** | 4 | 1 (52) |
| Non lo so | 37 | 1 (54) | **38** | 5 (1–4 e 54) | 0 |
| Catalogo totale | | | **54** | | 10 (39, 40, 41, 42, 43, 45, 46, 47, 48, 52) |

### 2.5 Tappe future (non generate in R1)
Non fanno parte del modello R1 e **non vanno generate**: raccolta online delle conferme (RSVP) e sito pubblico (R3), gestione tavoli come funzione (R5), funzioni su abiti/testimoni/documenti/lista nozze (R4), foto e video condivisi del giorno (R6). Le tappe 11, 13, 26, 30 sono semplici compiti manuali e **non** devono promettere strumenti dell'app. Quando queste release arriveranno, si aggiungeranno nuove tappe (id nuovi) con `version` e `highlightFirst: false`.

## 3. Regole di prodotto per T4

1. **Generazione**: tappe del rito scelto = tutte quelle con `rites` che include il rito; per `unknown` solo quelle con `unknown` (AC63). Per ogni tappa un compito copia (BR5) con `template_key = id` e `template_version = version`.
2. **Senza data** (AC15): si mostrano solo le 4 (5 con `unknown`) tappe con `offset: null`; le altre hanno `due_date = null` e non compaiono. Con un solo scenario o più, il riferimento è quello di AC24 (D28).
3. **Compiti in evidenza**: la ripartizione di "Adesso" usa la regola (a)–(c) del piano §5. Nel catalogo le 3 tappe `highlightFirst` standard (1, 2, 3) hanno `offset: null`: con un riferimento restano comunque in "Adesso" (regola (c)) finché non vengono spuntate. La regola (a) (tappe in evidenza **scadute**) non è esercitata dal catalogo e si testa con fixture proprie. La tappa 1 non si spunta da sola quando la decisione "data" viene presa in R1 (vedi U7).
4. **Ordine in "Adesso"** a parità di tipo: prima le tappe in evidenza senza scadenza (per priorità), poi quelle con scadenza (scadenza crescente, poi priorità). (Vedi U8.)
5. **"Da recuperare"** (AC29): tutte le scadute non in evidenza, per `priority` crescente, con la loro scadenza reale; nessuna compressione, nessuna nascosta.
6. **Ricalcolo** (AC28): solo compiti con offset, `todo`, `due_overridden = false`, non eliminati. Con la data riaperta, solo le tappe con `dependsOn: date` ricevono `needs_review` (AC20).
7. **Cambio di rito** (AC16, AC48): nuove tappe pertinenti = suggerimenti da accettare; tappe non più pertinenti e non completate = suggerimento di rimozione; nessuna scrittura automatica. Le tappe completate non si toccano; le eliminate dall'utente non vengono ripresentate (BR6).
8. **Validazione zod**: `id` univoci con regex `^[a-z0-9]+(-[a-z0-9]+)*$`; `priority` interi univoci tra tappe dello stesso rito (nessun doppione: i valori qui sono già univoci); `category` nel set; `title` ≤ 60; `advice` ≤ 220; `offset` con interi (negativi ammessi solo per tappe post-evento 36 e 37); massimo 3 `highlightFirst` tra le comuni (1, 2, 3); la tappa 54 è l'unica con `rites = ['unknown']`; nessuna tappa con `bureaucratic: true` include `unknown` (le tappe burocratiche sono sempre specifiche di un rito).
9. **Tono**: nessuna tappa o consiglio usa un tono d'allarme, anche se scaduta (la scadenza si legge dal design, non dal testo). I consigli non citano nomi di partner né ruoli fissi "sposo/sposa" (AC46).

## 4. Frasi di stile (`src/content/style-tips.ts`, passo 7 e riepilogo onboarding)

Il passo 7 chiede un'etichetta di stile (D18): una frase di consiglio statica per etichetta, nessun effetto sul Percorso. Etichette dal design §3.2: Classico, Rustico, Boho, Moderno, Intimo, Festa grande, Destination, Altro, più "Non lo so ancora" (valido, AC13). Struttura proposta: `{ id, label, headline, tip }`. `headline` ≤ 40 caratteri, `tip` 1–2 frasi, "tu", senza emoji, senza promettere funzioni dell'app. Le frasi sono statiche in R1 e **non** modificano nessuna tappa.

| id | label | headline | tip |
|---|---|---|---|
| `classico` | Classico | Eleganza senza tempo | Punta su pochi elementi curati: una palette sobria, fiori freschi di stagione e una buona luce. Il classico funziona quando tutto è coerente. |
| `rustico` | Rustico | Calore e natura | Scegli materiali naturali come legno, lino e fiori di campo, e una location che li valorizzi. Controlla in anticipo come ci si muove se piove. |
| `boho` | Boho | Libero e naturale | Lascia spazio a dettagli fatti a mano, colori terrosi e cerimonia informale. Meglio pochi elementi scelti bene che molti messi insieme. |
| `moderno` | Moderno | Linee pulite | Scegli una palette ridotta, forme semplici e un allestimento essenziale. Curare luce e musica fa più di mille decorazioni. |
| `intimo` | Intimo | Pochi, ma vicinissimi | Con meno invitati puoi investire in qualità: un menù curato, un luogo speciale, più tempo con tutti. Parti dalla lista e costruisci attorno a quella. |
| `festa-grande` | Festa grande | Tanta gente, tanta energia | Con molti invitati contano logistica e ritmi: tavoli chiari, orari precisi e fornitori che hanno già gestito feste simili. Meglio una buona regia che più dettagli. |
| `destination` | Destination | Il matrimonio in viaggio | Informati presto su documenti e tempi: per gli invitati stranieri o fuori sede servono preavviso e indicazioni chiare. Un save the date aiuta tantissimo. |
| `altro` | Altro | Il vostro stile | Non serve un'etichetta per avere un matrimonio che vi somiglia. Scrivi nella nota le parole che lo descrivono: ci tornerai quando dovrai scegliere. |
| `non-so` | Non lo so ancora | Va benissimo così | Nessun problema: lo stile spesso si chiarisce vedendo location, fiori e abiti. Puoi tornare a sceglierlo dalle Impostazioni quando vuoi. |

Note per T10: il `headline` si usa nel riepilogo ("Ecco il tuo percorso", design §3.2) sopra il `tip`; `id` stabili; l'etichetta "Altro" accompagna la nota libera e mostra la frase `altro`; se la coppia non sceglie nulla (salta il passo) si mostra la frase `non-so`.

## 5. Esempi di accettazione (per T4 e QA)

Tutte le date sono "solo date" (nessun orario, nessun fuso) e vanno verificate anche con `TZ=UTC` e `TZ=America/Los_Angeles`. "Oggi" si inietta come parametro. Le finestre di "Adesso": scadenza da oggi a +30 giorni; "Prossimi 3 mesi": da +31 a +90; "Da recuperare": scadute (`due < oggi`).

### 5.1 Rito civile, riferimento 2027-09-03, oggi 2026-11-24

Tappe attese: 43 (vedi §2.4). Scadenze di tutte le tappe con offset, in ordine cronologico:

| Data | Tappe (id) |
|---|---|
| 2026-09-03 | `conferma-location-e-caparra` (12m) |
| 2026-10-03 | `scegli-catering` (11m) |
| 2026-11-03 | `prenota-foto-e-video` (10m), `contatta-comune-celebrazione` (10m) |
| 2026-12-03 | `scegli-abiti` (9m), `scegli-musica` (9m) |
| 2027-01-03 | `scegli-testimoni`, `save-the-date`, `prenota-viaggio-nozze` (8m) |
| 2027-02-03 | `apri-lista-nozze` (7m) |
| 2027-03-03 | `scegli-fiori-allestimento`, `scegli-fedi`, `alloggi-invitati` (6m) |
| 2027-04-03 | `prenota-acconciatura-trucco`, `ordina-partecipazioni`, `documenti-pubblicazioni` (5m) |
| 2027-05-03 | `degustazione-menu`, `scegli-bomboniere`, `prima-prova-abiti`, `prenota-trasporti`, `richiedi-pubblicazioni` (4m) |
| 2027-06-03 | `piano-b-imprevisti`, `documenti-viaggio-nozze`, `letture-musica-cerimonia` (3m) |
| 2027-06-19 | `invia-partecipazioni` (2m+2w: prima 2027-07-03, poi −14 giorni) |
| 2027-07-03 | `regime-patrimoniale` (2m) |
| 2027-07-23 | `riconferma-fornitori`, `prova-acconciatura-trucco` (6w) |
| 2027-07-30 | `raccogli-conferme` (5w) |
| 2027-08-03 | `documenti-testimoni` (1m) |
| 2027-08-06 | `numero-finale-e-menu` (4w) |
| 2027-08-13 | `organizza-tavoli`, `prova-finale-abiti`, `programma-giornata` (3w) |
| 2027-08-27 | `ritira-abiti-fedi`, `prepara-saldi-fornitori` (1w) |
| 2027-08-31 | `kit-emergenza` (3d) |
| 2027-09-17 | `biglietti-ringraziamento` (−2w) |
| 2027-10-01 | `chiudi-conti-budget-finale` (−4w) |
| senza data | `scegli-data-e-location`, `definisci-budget-iniziale`, `lista-invitati-preliminare`, `decidi-stile-e-priorita` |

**Raggruppamento atteso con oggi = 2026-11-24** (AC29, AC30, design §3.4):

| Gruppo | Tappe attese (ordine) |
|---|---|
| Adesso (5) | `scegli-data-e-location`, `definisci-budget-iniziale`, `lista-invitati-preliminare` (in evidenza, senza scadenza, per priorità 10, 20, 30); poi `scegli-abiti` (prio 40), `scegli-musica` (prio 45), entrambi 2026-12-03 |
| Da recuperare (4, per priorità) | `conferma-location-e-caparra` (12), `contatta-comune-celebrazione` (18), `scegli-catering` (25), `prenota-foto-e-video` (35) |
| Prossimi 3 mesi (4) | `scegli-testimoni` (55), `save-the-date` (85), `prenota-viaggio-nozze` (70), `apri-lista-nozze` (80): scadenze tra +31 e +90 giorni (2026-12-25 … 2027-02-22) |
| Più avanti (30) | tutte le altre, compresa `decidi-stile-e-priorita` (senza data) |
| Fatti | 0 |

"Da recuperare": nessuna tappa nascosta, tono neutro, scadenze originali visibili. "Prossimo passo" (AC27): nessuna decisione bloccante aperta se la data è presa; altrimenti prima "Scegliere data e location"; poi i compiti scaduti per priorità (`conferma-location-e-caparra`), poi i compiti in scadenza entro 30 giorni.

### 5.2 Fine mese (AC28): riferimento 2027-08-31, rito civile

| Offset | Atteso | Verifica |
|---|---|---|
| 12m | 2026-08-31 | mese di 31 giorni |
| 11m | 2026-09-30 | adeguamento 31 → 30 |
| 10m | 2026-10-31 | |
| 9m | 2026-11-30 | adeguamento 31 → 30 |
| 8m | 2026-12-31 | |
| 7m | 2027-01-31 | |
| 6m | **2027-02-28** | adeguamento 31 → 28 (anno non bisestile) |
| 5m | 2027-03-31 | |
| 4m | 2027-04-30 | adeguamento |
| 3m | 2027-05-31 | |
| 2m | 2027-06-30 | adeguamento |
| 1m | 2027-07-31 | |
| 2m+2w (`invia-partecipazioni`) | **2027-06-16** | mesi prima (→ 2027-06-30), poi −14 giorni; se si facessero prima le settimane si otterrebbe 2027-06-17: il test deve fallire in quel caso |
| 1w | 2027-08-24 | |
| 3d | 2027-08-28 | |
| −2w | 2027-09-14 | offset dopo la data |

### 5.3 Anno bisestile: riferimento 2028-08-31

- 6m (`scegli-fiori-allestimento`, `scegli-fedi`, `alloggi-invitati`) → **2028-02-29** (adeguamento al 29 febbraio).
- 12m (`conferma-location-e-caparra`) → 2027-08-31. 11m → 2027-09-30. 2m+2w → 2028-06-16.

### 5.4 Periodo (AC24, AC32, D19): scenario "mag–giu 2028"

Il riferimento è il primo giorno: **2028-05-01** (indicato in chiaro "calcolata dal 1 mag"). 12m → 2027-05-01; 9m → 2027-08-01; 6m → 2027-11-01; 3m → 2028-02-01; 1w → 2028-04-24.

### 5.5 Senza data (AC15, AC26)

- Rito civile, nessuno scenario: sono mostrate 4 tappe (`scegli-data-e-location`, `definisci-budget-iniziale`, `lista-invitati-preliminare` in "Adesso"; `decidi-stile-e-priorita` in "Più avanti"). Tutte le altre hanno `due_date = null` e non si mostrano; la home propone "Scegliete la data".
- Rito "non lo so", nessuno scenario: 5 tappe (le 4 precedenti più `scegli-il-rito`, prima in "Adesso").

### 5.6 Rito "non lo so" e passaggio al rito (AC63, D36, AC16, AC48)

1. Rito `unknown`, riferimento 2027-09-03: **38** compiti (37 comuni + `scegli-il-rito`). Nessuna tra `richiedi-pubblicazioni`, `corso-prematrimoniale`, `contatta-parrocchia`, `scegli-celebrante`, ecc. `scegli-il-rito` è in "Adesso", prima di tutte.
2. Il rito diventa **civile**: "Suggerimenti da rivedere" = 6 nuove (`contatta-comune-celebrazione`, `documenti-pubblicazioni`, `richiedi-pubblicazioni`, `regime-patrimoniale`, `documenti-testimoni`, `letture-musica-cerimonia`) e 1 non più pertinente (`scegli-il-rito`, se non completata). Nessun compito creato o cancellato da solo.
3. Il rito diventa **religioso**: 10 nuove (`documenti-pubblicazioni`, `richiedi-pubblicazioni`, `regime-patrimoniale`, `documenti-testimoni`, `contatta-parrocchia`, `corso-prematrimoniale`, `certificati-parrocchia`, `colloquio-parroco`, `liturgia-letture-canti`, `fiori-addobbi-chiesa`) e 1 non più pertinente (`scegli-il-rito`).
4. Il rito diventa **simbolico**: 4 nuove (`letture-musica-cerimonia`, `scegli-celebrante`, `valuta-matrimonio-civile`, `scrivi-promesse-copione`) e 1 non più pertinente. Nessuna tappa di pubblicazioni.
5. Da civile a religioso: nuove = `contatta-parrocchia`, `corso-prematrimoniale`, `certificati-parrocchia`, `colloquio-parroco`, `liturgia-letture-canti`, `fiori-addobbi-chiesa` (6); non più pertinenti = `contatta-comune-celebrazione`, `letture-musica-cerimonia` (2, se non completate). Quelle comuni a civile e religioso (pubblicazioni, regime, testimoni) restano.
6. Solo il rito religioso ha il corso prematrimoniale; solo civile e religioso hanno le pubblicazioni (AC25). Il rito simbolico non le ha.
7. Una tappa specifica già eliminata dall'utente non viene ripresentata (BR6).

### 5.7 Riferimento che cambia (AC20, AC28)

Rito civile, riferimento passa da 2027-09-03 a 2028-05-01, tutti `todo` e non modificate a mano: ogni tappa con offset si sposta di conseguenza (es. `scegli-abiti` 2026-12-03 → 2027-08-01). Una tappa con `due_overridden = true` o completata non si muove. Le 4 tappe senza offset non cambiano e non ricevono `needs_review`. Riaprendo la decisione "data", tutte le tappe con `dependsOn: date` ancora `todo` ricevono `needs_review`: nel rito civile sono 43 − 4 = **39** (le 4 senza offset sono escluse).

### 5.8 Conteggi attesi (test di catalogo)
- `milestones.length = 54`; per rito: civile 43, religioso 47, simbolico 41, unknown 38.
- Tappe con `bureaucratic: true`: 10 in tutto; civile 5, religioso 8, simbolico 1, unknown 0.
- `highlightFirst`: 4 tappe in tutto (1, 2, 3, 54); tra le comuni esattamente 3.
- Tappe con `offset: null`: 5 (1, 2, 3, 4, 54).
- Solo le tappe 36 e 37 hanno offset negativo.

## 6. Incertezze dichiarate

| # | Tema | Cosa non è certo | Come lo trattiamo in R1 |
|---|---|---|---|
| U1 | Scadenze di legge delle pubblicazioni | Durata di esposizione e periodo di validità sono fissati dalla legge, ma non li riporto nei testi perché non sono certi per ogni comune | Offset prudente (4 mesi), consiglio generico "chiedi tempi e validità", avviso burocratico. Da verificare con una fonte ufficiale prima della release pubblica |
| U2 | Documenti richiesti dal comune e dalla parrocchia | Variano per comune, diocesi e situazione (residenza, cittadinanza, matrimonio precedente) | Nessun elenco di documenti nel testo; sempre "chiedi quali servono" |
| U3 | Certificati e colloquio in parrocchia | Nomi (istruttoria, colloquio, certificati di battesimo e cresima) e validità variano per diocesi | Testo generico, validità non indicata |
| U4 | Corso prematrimoniale | Durata, calendario e posti disponibili dipendono dalla diocesi; offset di 9 mesi è una stima | Offset prudente, tappa solo religioso |
| U5 | Regime patrimoniale | Modalità e tempi per scegliere la separazione dei beni non sono descritti | Solo invito a parlarne e a sentire un notaio |
| U6 | Testimoni | "Di solito due" e requisiti sono generali; possono variare per rito | Testo "di solito", rimando a comune o parrocchia nella tappa 43 |
| U7 | Spuntare "Scegliere data e location" | In R1 nessun AC prevede la chiusura automatica quando la decisione "data" è presa. La tappa resta in "Adesso" finché non è spuntata a mano | Proposta: restare manuale in R1 (come scritto nel consiglio); eventuale automatismo come follow-up. **question-for-developer** se si preferisce l'automatico (non bloccante) |
| U8 | Ordine in "Adesso" | Design dice "scadenza, poi priorità"; per le tappe in evidenza senza scadenza non c'è una regola | Proposta: prima le in evidenza senza scadenza per priorità, poi le datate. Il designer conferma |
| U9 | Offset e priorità | Sono euristiche di mercato italiane indicative, non fonti ufficiali; molte tappe sono già in ritardo oggi (2026-11-24) | Versione 1.0.0 da validare con lo sviluppatore (Q5) |
| U10 | Riti | Il brief ha civile/religioso/simbolico/non lo so; non esiste "religioso senza effetti civili" | Un solo valore `religioso`; T4 allinea l'enum con `weddings.rite` (T2) |
| U11 | Simbolico | La tappa 52 ricorda che non ha valore legale e rimanda al comune: formulazione generica, nessun dettaglio giuridico | Avviso burocratico attivo |
| U12 | Categoria `organizzazione` | Non è una categoria di budget di AC34 | Aggiunta solo ai compiti (T5 non la crea tra le categorie di budget); i filtri di AC30 la mostrano |
| U13 | Scadenze di save the date, bomboniere, alloggi | Tappe facoltative per alcune coppie | Restano nel catalogo; si possono eliminare con "Annulla" (AC31) senza rigenerarle |

## 7. Questioni per lo sviluppatore (non bloccanti)

1. **question-for-developer (U7)**: la tappa "Scegliere data e location" deve spuntarsi da sola quando la decisione "data" è presa? Proposta: no in R1 (nessun AC lo richiede), da valutare in R2 quando arriva il confronto data × location.
2. **question-for-developer (U9)**: gli offset (per esempio location 12 mesi, catering 11, foto 10) sono accettabili come punto di partenza? Poiché la data è a 9 mesi, in R1 molte tappe finiscono in "Da recuperare" (4 per il civile): è il comportamento previsto da AC29/D15, ma conferma che i numeri ti vanno bene.
