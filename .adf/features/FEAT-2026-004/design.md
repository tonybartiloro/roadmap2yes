# FEAT-2026-004 — Conferme di presenza (RSVP) con link personale: UX/UI design

> **BOZZA F1** — designer, 2026-11-26. Basata su `brief.md` (AC1-AC19, BR1-BR12, Q1-Q8), FEAT-2026-001 (temi, shell pubblica) e FEAT-2026-003 (lista Invitati). Non ripete il brief: AC/BR per numero. Le scelte segnate **(DES-n)** dipendono dalle obiezioni in fondo; la versione finale è F2. Lingua: italiano, tono "tu".

## 1. Schermate e flussi

### 1.1 Pagina pubblica `/rsvp/[token]` (invitato, 320-390 px, nessun login)
Server-rendered, un modulo HTML che funziona anche senza JS (browser interno di WhatsApp, telefoni vecchi); JS solo per migliorare (rivelare le preferenze, messaggi in linea). Testo base 18 px (lettori anziani), `font-heading` per il titolo, colonna `max-w-xl` come `PublicShell`. **Non** usa l'intestazione col nome dell'app: guscio proprio `RsvpShell` con i nomi della coppia (DES-1).

**Flusso A, prima risposta (link attivo, scadenza non passata)**
1. Apre il link dal messaggio. In testa: "{A} e {B} si sposano" (h1), sotto data ("sabato 3 settembre 2027" oppure "Data da confermare") e, se presa, location ("Villa X, Comune"; se non presa, "Luogo da confermare", DES-9). Se c'è scadenza: "Rispondi entro il 15 marzo".
2. Frase guida: "Dicci chi di voi viene." (più persone) / "Dicci se ci sei." (una).
3. Una **carta per persona**: nome e cognome (legenda del gruppo di scelta), tipo in testo se non adulto ("Bambino", "Neonato"), due scelte grandi affiancate **Sì, ci sono** / **No, non posso** (segmenti nativi `radio`, min 48 px, icona + testo + bordo, mai solo colore). Con più di una persona, sopra le carte il tasto secondario "Vengono tutti" (imposta Sì a tutte; si corregge dopo, DES-3).
4. Scegliendo Sì, nella carta si apre "Preferenze alimentari (facoltative)": quattro caselle (Vegetariano, Vegano, Senza glutine, Senza lattosio: testi nel Copy), campo "Allergie o altro" (200 caratteri, contatore), nota di una riga "Lo vedono solo {A} e {B}". Scegliendo No le preferenze si nascondono (e si cancellano al salvataggio, BR11).
5. In fondo: contatore "Hai scelto per 3 di 4 persone" (`aria-live`), bottone **Invia le risposte**. Con nessuna scelta il bottone resta attivo ma `aria-disabled` e la riga sopra dice "Scegli Sì o No per almeno una persona" (non un bottone muto, DES-3). Con scelte parziali invia solo quelle e le altre restano "Da rispondere".
6. Nota privacy (Q2) in coda, piccola ma ≥ 14 px: "Le risposte le vedono solo {A} e {B}, servono per organizzare il matrimonio; per farle cancellare scrivi a loro." Riga d'aiuto: "Manca qualcuno o c'è un nome sbagliato? Scrivi a chi ti ha invitato." (DES-8).
7. Dopo l'invio: la stessa pagina, in testa il pannello di conferma `role="status"` con focus: "Grazie! Abbiamo ricevuto le risposte", riepilogo per persona ("Mario Rossi: Sì, vegetariano" / "Anna Rossi: No" / "Luca Rossi: Da rispondere"), e **Modifica**. Se qualcuna resta senza risposta: "Per Luca non hai ancora risposto." con Modifica. Lo stato mostrato è quello **salvato dal server** (AC16); se differisce da quello inviato: "Le risposte di Anna erano già cambiate: ecco quelle salvate." (DES-14).

**Flusso B, ritorno (risposte già date)**: la pagina si apre direttamente sul riepilogo (come dopo l'invio, senza il "Grazie") con **Modifica**; Modifica riapre le carte precompilate. Mai la modulistica vuota se ci sono risposte.

**Flusso C, dopo la scadenza (AC15)**: stesso riepilogo, in sola lettura, senza Modifica, con avviso in testa "Le risposte sono chiuse: per cambiare scrivi a chi ti ha invitato." Persone senza risposta: "Non hai risposto". Se la scadenza passa mentre il modulo è aperto: l'invio restituisce lo stesso stato, la pagina si ricarica in sola lettura, scrivendo che "le tue ultime scelte non sono state salvate" (DES-12).

**Flusso D, link non valido (AC6, AC17)**: guscio senza nomi né data, titolo "Questo link non funziona più", testo "Se pensi sia un errore, scrivi a chi ti ha invitato." Nessun pulsante, nessun accesso al login, stesso codice HTTP. Tema predefinito (nessun dato del matrimonio da leggere). "Troppi tentativi" (AC10) è la stessa pagina con il suo testo e `Retry-After`.

### 1.2 Lato coppia: Invitati (nuove parti)
Riuso di tutta la lista di FEAT-2026-003. Si aggiunge, senza nuove schede:

- **Riepilogo presenze** (AC11): sotto il riepilogo persone, riga "Presenze" in tre blocchi che vanno a capo (320 px): "Sì 30" con sotto "24 adulti · 4 bambini · 2 neonati", "No 5", "In attesa 12"; ogni blocco è un pulsante che applica il filtro Presenza. Neonati: nota "i neonati non occupano posto: 28 posti" (DES-10). Prima che esista un solo link attivo il blocco è sostituito da un invito: "Non hai ancora mandato nessun link." + pulsante "Invia i link".
- **Riepilogo catering** (AC14): voce comprimibile "Preferenze alimentari" come "Per lato": "Vegetariani 3 · Senza glutine 2 · Altro 1", ogni numero filtra.
- **Riga persona**: dopo lato/gruppo/tavolo, un segno di stato in testo ("Sì", "No", "In attesa") con icona (check / x / orologio) e, da seconda riga attenuata, "3 marzo · dall'invitato" / "inserita da voi" (AC8, AC13). Il segno è l'ultimo elemento del nome accessibile ("Mario Rossi, Tony, Famiglia Rossi, Sì"). Da 768 px diventa una colonna "Presenza" (DES-15).
- **Titolo gruppo**: "Famiglia Rossi · 2 sì · 1 in attesa" e, in seconda riga, lo **stato del link** con il pulsante **Invia** (44 px): "Link attivo · da condividere", "Condiviso il 12 marzo", "Da rimandare", "Nessun link", "Scaduto". Il menu del gruppo guadagna "Link e risposte…" e "Come rispondono: insieme / ognuno per sé" (BR1, BR3, con conferma che dice la conseguenza). Persone senza gruppo: lo stesso stato in una riga sotto il nome, dentro la riga solo se c'è spazio, sempre nel foglio persona.
- **Foglio "Link di {destinatario}"** (nuovo, `Sheet` + `PanelContent`, DES-2): stato del link e scadenza ("Scade il 3 ottobre 2027"), pulsanti verticali da 44 px **Copia link**, **Condividi** (se `navigator.share`), **WhatsApp**, poi in basso, separate, **Nuovo link** e **Revoca link** (testi e conferme in DES-5). Un destinatario "ognuno per sé" elenca un blocco per persona. Avviso, con data non scelta: "La data non è ancora decisa: chi apre il link vedrà 'Data da confermare'." Copia e WhatsApp registrano "Condiviso il" con toast **Annulla** (DES-6).
- **Foglio "Invia i link"** (nuovo, dal riepilogo e da "Altro"; DES-4): elenco dei destinatari che non hanno ancora il link condiviso, una riga per destinatario (nome o "Mario, Anna, Luca", quante persone), con **WhatsApp** e **Copia**; la riga sparisce (o diventa "Condiviso") dopo l'azione, con Annulla. Contatore "Ne restano 14 su 42". Chiude con "Fatto".
- **Foglio persona** (`GuestSheet`): nuova sezione "Presenza" con tre segmenti In attesa / Sì / No, preferenze (stesse quattro caselle + testo, solo con Sì), riga di sola lettura "Ultima risposta: Sì, 3 marzo, dall'invitato", e una riga "Invito: risponde con il gruppo Famiglia Rossi · Link attivo" con pulsante "Apri link". Lasciare Sì, o scegliere No, con preferenze scritte chiede conferma breve ("Cancello le preferenze di Anna?"). Il conflitto con una risposta arrivata nel frattempo usa `ConflictDialog` (AC16).
- **Selezione multipla**: azione "Segna presenza" nella `SelectionBar`; applicare No o In attesa a persone con preferenze apre conferma con il numero ("Cancello le preferenze di 4 persone?"), poi toast Annulla che ripristina anche le preferenze (DES-7).
- **Filtri** (`FiltersSheet`): gruppo "Presenza" (Sì/No/In attesa), "Con preferenze alimentari", e un solo gruppo **"Link"** con valori Nessun link, Da condividere, Condiviso, Da rimandare, Scaduto (DES-11; "Senza link" di AC12 = Nessun link + Da rimandare).
- **Scadenza e opzioni** (AC15): voce "Risposte e scadenza" nel menu "Altro": foglio con interruttore "Imposta una scadenza", `Calendar` esistente, riga "Fino alla fine di giovedì 15 marzo", avviso se la data è passata ("Con questa data le risposte sono già chiuse"), nota "I link smettono di funzionare 30 giorni dopo il matrimonio" (Q3, solo se la data è scelta). Spostarla in avanti dice "Le risposte si riaprono subito".

## 2. Stati
| Schermata | Caricamento | Vuoto | Errore | Successo | Permesso negato |
|---|---|---|---|---|---|
| Pagina pubblica, modulo | pagina già renderizzata; bottone con spinner e testo "Invio in corso…" | persona senza risposte: carte vuote | validazione in testo sopra e sotto la carta; offline: "Sei offline: le risposte non sono ancora state inviate" e le scelte restano in pagina; errore server: "Non sono riuscito a salvare. Riprova"; troppi invii: "Troppi tentativi, riprova tra qualche minuto" | conferma + riepilogo + Modifica | n.a. (link non valido = Flusso D) |
| Pagina pubblica, sola lettura | — | nessuna risposta: "Non hai risposto" | — | — | — |
| Pagina neutra | — | — | stesso testo per ogni causa | — | — |
| Riepilogo presenze | skeleton nella riga | nessun link attivo: invito a "Invia i link" | `ErrorState` della lista | conteggio annunciato `aria-live` | solo lettura: numeri visibili, nessuna azione |
| Foglio link | spinner sul pulsante | "Nessun link": un solo pulsante "Crea link" | "Non sono riuscito a creare il link" + Riprova; Copia negata dal browser: il link si mostra in un campo da selezionare | toast "Link copiato" + Annulla ("Condiviso il" tolto) | senza scrittura i pulsanti non ci sono; testo "Serve il permesso di modifica sugli invitati" |
| Invia i link | skeleton righe | "Hai mandato tutti i link" | errore per riga | riga sparisce con Annulla | come sopra |
| Presenza nel foglio persona | spinner | In attesa | campo inline; conflitto = dialogo | "Presenza aggiornata" | segmenti disattivati con testo |
| Scadenza | spinner | nessuna scadenza: interruttore spento | "Non sono riuscito a salvare la scadenza" | toast | come sopra |
| Globali | offline, servizio in pausa, sessione scaduta: come FEAT-2026-001 §4 (lato coppia); lato pubblico solo il messaggio generico "Un attimo, riprova" senza dettagli | | | | |

## 3. Componenti
| Bisogno | Riuso (percorso) | Nuovo? |
|---|---|---|
| Guscio pagina pubblica | `src/components/PublicShell.tsx` (`#contenuto`, "Vai al contenuto") | `RsvpShell`: nomi della coppia al posto del marchio dell'app, tema del matrimonio, testo 18 px (DES-1) |
| Segmenti Sì/No, caselle, campo testo | `ui/radio-group.tsx`, `ui/checkbox.tsx`, `ui/input.tsx`, `ui/label.tsx` | `RsvpPersonCard` (specifico) |
| Riepilogo risposte, avvisi | `ui/alert.tsx`, `ui/card.tsx` | `RsvpSummary` |
| Pagina neutra | stile di `invito/[token]` (titolo + testo) | `LinkUnavailable` |
| Lista, riga, gruppo, riepilogo, filtri | `GuestRow.tsx`, `GroupHeader.tsx` (`ActionMenu`), `Summary.tsx`, `FiltersSheet.tsx`, `SelectionBar.tsx` | estendere (colonna presenza in `rowColumns`, secondo livello in `GroupHeader`) |
| Fogli link / invia / scadenza | `ui/sheet.tsx`, `timeline/PanelContent.tsx`, `ui/calendar.tsx`, `ui/switch.tsx` | `LinkSheet`, `SendLinksSheet`, `RsvpSettingsSheet` |
| Annulla, conflitto, errori | `timeline/actions.ts`, `Notices.tsx`, `ui/sonner.tsx`, `ConflictDialog.tsx`, `ErrorState.tsx` | no |
| Conferme distruttive | `ui/alert-dialog.tsx` (focus su "Annulla") | no |

## 4. Copy (provvisorio, "tu")
| Dove | Testo |
|---|---|
| Titolo pagina (tab, anteprima) | "Conferma la tua presenza" (mai nomi, AC10) |
| h1 | "{A} e {B} si sposano" |
| Scelte | "Sì, ci sono" / "No, non posso"; stato: "Da rispondere" (invitato), "In attesa" (coppia) |
| Preferenze | "Vegetariano", "Vegano", "Senza glutine", "Senza lattosio", "Allergie o altro (max 200 caratteri)" |
| Invio | "Invia le risposte"; mancanza: "Scegli Sì o No per almeno una persona" |
| Conferma | "Grazie! Abbiamo ricevuto le risposte" + "Modifica" |
| Chiuso | "Le risposte sono chiuse: per cambiare scrivi a chi ti ha invitato" |
| Neutra | "Questo link non funziona più. Se pensi sia un errore, scrivi a chi ti ha invitato." |
| Data incerta | "Data da confermare" / "Luogo da confermare"; nota: "Puoi rispondere adesso e cambiare quando vuoi" |
| Revoca (conferma) | "Revoco il link di {nome}? Chi lo apre vedrà che non funziona più. Le risposte già date restano." |
| Nuovo link (conferma) | "Creo un nuovo link per {nome}? Quello vecchio smette di funzionare: dovrai rimandarlo." |
| Condivisione | toast "Link copiato" / "Aperto in WhatsApp"; stato "Condiviso il 12 marzo" |
| Messaggio WhatsApp (modificabile, DES-6) | "Ciao {nomi}! {A} e {B} si sposano e vorrebbero sapere se ci sarete. Rispondi da qui, ci vuole un minuto: {link}" |
Mai: "RSVP", "token", "destinatario" nelle etichette per la coppia (in Guida si spiega "RSVP"). Titoli di sezione nuovi: "Presenze", "Preferenze alimentari", "Link".

## 5. Accessibilità
Pagina pubblica: `lang="it"`, un solo `h1`, carte in `ul`/`fieldset`; ogni gruppo Sì/No è un `radiogroup` con legenda = nome e cognome (e tipo), mai "Persona 1"; bersagli ≥ 48 px, distanza ≥ 8 px; selezione indicata da icona, testo e bordo (contrasto ≥ 3:1 sul bordo, 4.5:1 sul testo, solo token del tema, `accent` mai su `muted`); preferenze rivelate con `aria-expanded` sul gruppo e senza spostare il focus; errori `aria-invalid` + `aria-describedby`, al primo errore il focus va al riepilogo errori; conferma e contatore `role="status"`; focus sul pannello di conferma dopo l'invio; nessun timeout; zoom 200 % senza scorrimento orizzontale; `prefers-reduced-motion`. Lato coppia come FEAT-2026-003 §6: foglio link con focus trap, stato del link nel nome accessibile del gruppo ("Famiglia Rossi, 2 sì, 1 in attesa, link condiviso il 12 marzo"), conferme distruttive con focus su "Annulla", conteggi in `aria-live="polite"`.

## 6. Responsive
Pagina pubblica: 320 una colonna, carte a larghezza piena; 768+ colonna centrata `max-w-xl`, nessun layout a più colonne. Lista coppia: 320 stato su seconda riga della persona, link sul titolo gruppo; 768+ colonna "Presenza" nella griglia, "Link" nel titolo gruppo a destra, fogli laterali. Barra a 6 voci invariata (nessuna voce nuova).

## 7. Mockup (pagina pubblica, 320 px)
```
Anna e Marco si sposano
sabato 3 settembre 2027
Villa Aurora, Tivoli
Rispondi entro il 15 marzo

Dicci chi di voi viene.      [Vengono tutti]
+--------------------------------+
| Mario Rossi                    |
| [ Sì, ci sono ] [ No, non posso]|
| v Preferenze alimentari        |
|   [ ] Vegetariano  [ ] Vegano  |
|   Allergie o altro  [........] |
+--------------------------------+
| Luca Rossi · Bambino           |
| [ Sì, ci sono ] [ No, non posso]|
+--------------------------------+
Hai scelto per 1 di 2 persone
[ Invia le risposte ]
Le risposte le vedono solo Anna e Marco...
Manca qualcuno? Scrivi a chi ti ha invitato.
```

## 8. Controlli visivi di accettazione (F3)
- [ ] Pagina pubblica a 320, 360, 390, 768 e 1280 px: nessuno scorrimento orizzontale, bersagli ≥ 44 px, testo ≥ 16 px; in dark e in almeno 4 temi (chiaro/scuro) con contrasto di selezione, bordi e badge.
- [ ] Link valido con data/location scelte e non scelte ("Data da confermare", "Luogo da confermare"); con e senza scadenza.
- [ ] Gruppo di 1, 4 e 8 persone, con bambino e neonato: Sì/No, "Vengono tutti", preferenze si aprono/chiudono, invio parziale, messaggio "scegli per almeno una".
- [ ] Dopo l'invio: conferma, riepilogo, Modifica; riapertura del link: riepilogo; dopo scadenza: sola lettura senza Modifica.
- [ ] Link sconosciuto, revocato, scaduto, destinatario eliminato: stessa pagina identica; "Troppi tentativi".
- [ ] Offline e errore server: scelte conservate, messaggio chiaro; doppio tocco su Invia non duplica.
- [ ] Nessun nome nel titolo scheda, nessun marchio dell'app, nessuna risorsa di terzi (rete), `noindex`, anteprima generica.
- [ ] Tastiera e lettore di schermo: legende, stato annunciato, focus dopo l'invio; axe senza violazioni; zoom 200 %.
- [ ] Lista Invitati a 320 e 1280: riga con Presenza, titolo gruppo con link e Invia, riepilogo presenze e preferenze, nessun troncamento; con 0 link la lista invita a "Invia i link".
- [ ] Fogli Link, Invia i link, Risposte e scadenza: Copia, Condividi, WhatsApp, Nuovo link, Revoca (conferme con conseguenza), Annulla ≥ 8 s, "Condiviso il", stati Scaduto e Da rimandare.
- [ ] Presenza a mano da foglio persona e da selezione multipla (con conferma sulle preferenze e Annulla), filtri Presenza / Link / Preferenze, "12 di 42".
- [ ] Scadenza: imposta, sposta avanti, toglie, data passata; partner senza scrittura vede solo i numeri.

## Obiezioni F1 (designer)
Gravità: **blocking** (impedisce di verificare l'AC o rende il flusso inutilizzabile), **should** (da risolvere in F2), **note**.

| ID | Gravità | Evidenza | Proposta |
|---|---|---|---|
| DES-1 | blocking | AC3 elenca "solo" i dati visibili e li verifica sull'output della funzione pubblica, ma non include il **tema** del matrimonio; `PublicShell` legge il tema dal cookie/predefinito (l'invitato non ha cookie) e mostra il marchio "roadmap2yes", che a un invitato non dice nulla. Il tema da NFR non è realizzabile e testabile. | Aggiungere alla lista AC3 l'identificativo del tema (non altro) e creare `RsvpShell` (nomi della coppia al posto del marchio, tema applicato lato server senza lampeggio). Pagina neutra: tema predefinito. |
| DES-2 | blocking | AC1 dà le azioni "per ogni destinatario" ma non dice dove stanno. La riga persona apre già il foglio di modifica, il titolo gruppo ha già un menu; per una persona senza gruppo non c'è posto; su 320 px non c'è spazio per 3 azioni per riga. Senza luogo, l'azione principale della feature è sepolta. | Stato del link + pulsante "Invia" nel titolo del gruppo (e nel foglio persona per chi non ha gruppo), che apre il foglio "Link di {destinatario}" (§1.2). Confermare in F2. |
| DES-3 | should | AC4: "senza nessuna scelta il pulsante dice cosa manca" e "chi non ha scelto resta In attesa" non dicono se l'invio parziale sia ammesso né se il pulsante sia disattivato (un bottone disattivato è muto per tastiera e lettore di schermo). In un gruppo da 8 serve anche una scorciatoia. | Invio parziale ammesso; bottone `aria-disabled` con riga di testo accanto solo a zero scelte; tasto "Vengono tutti" (solo con ≥ 2 persone); contatore "Hai scelto per 3 di 4". |
| DES-4 | should | Condividere "a mano centinaia di link" (brief, Q6) richiede un flusso per file, non 42 aperture di fogli. Il brief non lo prevede. | Foglio "Invia i link": coda di destinatari non ancora condivisi, con WhatsApp/Copia e riga che sparisce; incluso dal riepilogo. Un solo componente in più. |
| DES-5 | should | "Nuovo link" e "Revoca link" (AC7) sono vicini e simili: il primo invalida il vecchio (distruttivo), il secondo spegne senza sostituire. Dopo una revoca "Nuovo link" non ha senso come nome. | Stessa posizione in fondo al foglio, separati dalle azioni di condivisione; testi con conseguenza (§4); dopo la revoca il pulsante diventa "Crea un nuovo link". Focus su "Annulla" nelle conferme. |
| DES-6 | should | AC1 dice che nome del destinatario, coppia e link finiscono nel messaggio, ma un destinatario può chiamarsi "Colleghi di Tony" ("Ciao Colleghi di Tony!") e copiare/aprire WhatsApp non vuol dire aver mandato (Q6, "Condiviso il" potrebbe essere falso). | Saluto con i nomi di battesimo dei membri (max 3, poi "Ciao a tutti!"); messaggio modificabile in un campo prima di aprire WhatsApp; "Condiviso il" registrato all'azione con toast Annulla e filtro "Da condividere"; la label dice "Condiviso" non "Inviato". |
| DES-7 | should | AC13: "Segna presenza" in massa su No/In attesa cancella le preferenze (BR11); "Annulla" deve riportarle. Rischio di perdere dati sanitari di terzi con un tocco. | Conferma con il numero quando ci sono preferenze; Annulla che ripristina anche le preferenze (snapshot in memoria nel toast, ≥ 8 s). Segnalare all'architetto. |
| DES-8 | should | Q5 esclude +1, nomi e messaggio libero: l'invitato che vede un nome sbagliato o una persona mancante non ha via d'uscita, e la pagina non ha nessun contatto. | Riga fissa "Manca qualcuno o c'è un nome sbagliato? Scrivi a chi ti ha invitato" nel modulo e nel riepilogo; nota che "chi ti ha invitato" è un riferimento generico (nessun contatto sulla pagina). |
| DES-9 | should | AC3: con location non scelta "compare nulla", ma la data ha il suo "Data da confermare": l'asimmetria fa pensare a un errore. | Mostrare "Luogo da confermare" (nessun nome/comune provvisorio): conferma BR8. `question-for-developer` 2, risposta proposta: sì. |
| DES-10 | should | AC11: "Sì 30 (24 adulti · 4 bambini · 2 neonati) · No 5 · In attesa 12" non entra in una riga a 320 px e per catering/location 30 non è il numero giusto (i neonati non occupano posto, BR6). | Tre blocchi che vanno a capo, cliccabili come filtro; secondo numero "28 posti" accanto ai Sì. `question-for-developer` 3. |
| DES-11 | should | AC12 "Senza link" e AC8 hanno 5+ stati reali: Nessun link, Da condividere (creato, mai condiviso), Condiviso, Da rimandare (BR3/BR4), Revocato, Scaduto. Il solo "Senza link" non permette di sapere a chi mancano i link o chi va ricontattato. | Un unico gruppo filtro "Link" con quegli stati (testi, non colori) e glossario in Guida; "Revocato" mostrato come "Nessun link" con nota. |
| DES-12 | should | Casi non descritti: scadenza che passa con il modulo aperto; link revocato mentre l'invitato scrive; persona entrata/uscita dal gruppo mentre il modulo è aperto (BR2); doppio invio. | Il server risponde con lo stato corrente; la pagina mostra il riepilogo aggiornato con la frase "Le tue ultime scelte non sono state salvate" (scadenza) o la pagina neutra (revoca). Invio idempotente (bottone occupato). Nessuna bozza in `localStorage` (dati sanitari su dispositivi condivisi): le scelte restano solo in pagina. |
| DES-13 | should | Se si spedisce un link con data non scelta (Q2) e poi la data cambia, le risposte "Sì" date in un altro scenario restano e nessuno lo sa (nessun avviso, BR10). | `question-for-developer` 2. Il foglio link avvisa già alla creazione; in più, quando "Data" viene decisa dopo l'apertura dei link, un avviso in Invitati: "La data è cambiata dopo 12 risposte. Rimanda i link se serve" (solo avviso, nessun reset). |
| DES-14 | should | AC16: "vince l'ultimo" vale in silenzio anche per chi invia: due membri della famiglia possono sovrascriversi senza accorgersene. | Dopo l'invio mostrare lo stato salvato e, se diverso da quello inviato, la frase "Le risposte di {nome} erano già cambiate: ecco quelle salvate". |
| DES-15 | should | Riga persona già densa (nome, tipo, lato, gruppo, tavolo); AC8/AC13 aggiungono presenza + origine + data. Su 320 px diventa illeggibile; `rowColumns` ha già 4 combinazioni da raddoppiare. | Presenza come testo+icona accanto al nome; origine e data su riga attenuata ("3 marzo · dall'invitato"); da 768 px colonna dedicata e origine/data solo nel foglio e nel nome accessibile. Aggiornare `row-columns.test.ts`. |
| DES-16 | should | Q8: se il link si vede una volta sola (solo hash), "Condividi" non può esistere come azione ripetibile e il flusso di §1.2 cade (nessuna coda "Invia i link", nessun "ricopia"). Un invitato che scrive "non trovo il link" obbligherebbe a "Nuovo link" per tutti. | `question-for-developer` 1: sì, ricopiabile. Per UX la risposta "no" è praticabile solo con un flusso diverso (WhatsApp subito alla creazione): da rifare in F2. |
| DES-17 | should | AC10 blocca per IP i link non validi: dietro un solo IP (Wi-Fi del ristorante, rete mobile condivisa) invitati legittimi vengono bloccati; il messaggio "riprova tra qualche minuto" non basta se resta per ore. | Soglie generose, finestra breve, messaggio uguale alla pagina neutra con `Retry-After`; per l'architetto. |
| DES-18 | note | Browser interno di WhatsApp (iOS/Android): barre inferiori fisse e `100vh` si rompono con la tastiera; cookie/JS a volte limitati. | Bottone "Invia" nel flusso (non fisso), `dvh`, modulo che funziona senza JS, nessun `localStorage`. Verificare in F3 su Safari e Android reale o emulato. |
| DES-19 | note | Q3: dopo la scadenza dei link (30 giorni dopo le nozze) l'invitato che riapre trova la pagina neutra senza spiegazioni, uguale a una revoca. | Accettato (AC6 vuole risposta identica). Il foglio link dice alla coppia "Scade il …". |
| DES-20 | note | Il partner senza scrittura (`guests` in sola lettura) vede conteggi e stati; copiare un link crea il link (scrittura). | Azioni nascoste, riga di testo "Serve il permesso di modifica"; i numeri restano. |
| DES-21 | note | Non c'è modo di vedere "cosa è arrivato di nuovo" (Q6: nessun avviso). | Aggiungere (opzionale) l'ordinamento/filtro "Risposte degli ultimi 7 giorni". Non blocca. |
| DES-22 | note | Anteprima del link (Open Graph) generica: scegliere un'immagine e un testo neutri, senza nomi, che a un invitato dicano chi è mittente solo dal messaggio. | Titolo "Conferma la tua presenza", descrizione "Ci vuole un minuto", nessuna immagine di terzi. |
| DES-23 | note | Voci Guida/Esporta: la Guida deve avere la pagina "Conferme di presenza"; le esportazioni in Opzioni vanno aggiornate ("includono presenze e preferenze"). | Parte di F2/F5; `HelpLink` su Invitati rimanda alla pagina giusta. |

### Domande per lo sviluppatore (`question-for-developer`)
1. **Ricopiare il link (Q8)** — proposta: sì, sempre ricopiabile; è la scelta che rende usabili "Condividi", la coda e il reinvio.
2. **Data/location non scelte (Q2)** — proposta: i link si possono creare e condividere con avviso; la pagina dice "Data da confermare / Luogo da confermare"; se la data viene decisa dopo le risposte, nessun reset ma un avviso alla coppia (DES-13).
3. **Numeri catering** — proposta: mostrare "Sì 30" e accanto "28 posti" (neonati esclusi); le preferenze contano sui soli Sì, neonati compresi.
4. **Saluto del messaggio WhatsApp** — proposta: nomi di battesimo dei membri (max 3), messaggio modificabile prima dell'invio; accettare anche l'alternativa "Ciao a tutti!".
