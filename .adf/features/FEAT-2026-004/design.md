# FEAT-2026-004 — Conferme di presenza (RSVP) con link personale: UX/UI design

> **FINALE per il Gate B** — designer, 2026-11-26 (F2). Basato sul brief approvato (AC1-AC14, BR1-BR12, D1-D13), su `plan.md` (route `/rsvp/[token]`) e sul design di FEAT-2026-003 (lista, fogli, toast) e FEAT-2026-001 (temi, tono "tu"). Non ripete il brief: AC/BR per numero. Fuori scope, rimandato a **R-07** (D1): conteggi e filtri delle presenze, risposta a mano, riepilogo alimentare, scadenza delle risposte, colonne CSV, coda "Invia i link". Obiezioni F2 in `reviews/f2-designer.md`.

## 1. Schermate e flussi

### 1.1 Pagina pubblica `/rsvp/[token]` (invitato, da 320 px, senza login)
Modulo HTML con server action: funziona anche **senza JavaScript** (browser interno di WhatsApp). JS aggiunge solo "Vengono tutti", il contatore e la comparsa delle preferenze. Testo base 18 px, titoli `font-heading`, colonna `max-w-xl` centrata. `RsvpShell` al posto di `PublicShell`: nessun marchio dell'app, tema del matrimonio (intestazione `x-r2y-theme`, nessun lampeggio), chiaro/scuro dal dispositivo. Titolo scheda sempre "Conferma la tua presenza" (mai nomi).

**A. Prima risposta (link valido)**
1. In testa h1 "{A} e {B} si sposano"; sotto la data ("sabato 3 settembre 2027" o "Data da confermare") e la location ("Villa Aurora, Tivoli" o "Luogo da confermare"); se una delle due è da confermare: "Puoi rispondere adesso e cambiare quando vuoi" (BR8).
2. Frase guida "Dicci chi di voi viene." (più persone) / "Dicci se ci sei." (una).
3. Una **carta per persona** in `fieldset`: legenda = nome e cognome (+ "Bambino"/"Neonato" in testo), due scelte grandi affiancate **Sì, ci sono** / **No, non posso** (`input type="radio"` nativi, ≥ 48 px; selezione con spunta + testo + bordo, mai solo colore). Con 2+ persone, sopra le carte "Vengono tutti" (solo JS; imposta Sì a tutte, si corregge dopo).
4. **Preferenze alimentari (facoltative)** in ogni carta: quattro caselle + "Allergie o altro" (200 caratteri, contatore con JS) e "Lo vedono solo {A} e {B}". Con JS compaiono solo dopo Sì; **senza JS sono sempre visibili** con l'etichetta "Solo se vieni". Con No vengono cancellate al salvataggio (BR11).
5. Contatore `aria-live` "Hai scelto per 3 di 4 persone" (solo JS) e **Invia le risposte** (nel flusso, non fisso). Invio parziale ammesso: chi non ha scelto resta "In attesa". Con zero scelte il pulsante resta attivo e il server risponde con la riga "Scegli Sì o No per almeno una persona" (AC4); lo stesso senza JS.
6. In coda, ≥ 14 px: nota privacy (D6) e "Manca qualcuno o c'è un nome sbagliato? Scrivi a chi ti ha invitato."
7. **Dopo l'invio** la stessa pagina mostra, con il focus sul pannello `role="status"`: "Grazie! Abbiamo ricevuto le risposte" e il riepilogo per persona ("Mario Rossi: Sì, vegetariano" / "Anna Rossi: No" / "Luca Rossi: In attesa"), con **Modifica**. Si vede lo stato **salvato dal server**; se differisce da quello inviato: "Le risposte di {nome} erano già cambiate: ecco quelle salvate" (AC11).
8. **Modifica** apre le carte precompilate. Senza JS è un elemento `<details>` (apertura nativa) che contiene il modulo, non uno stato di JS (DES-24).

**B. Ritorno (risposte già date):** la pagina si apre sul riepilogo (senza il "Grazie") con **Modifica**; mai il modulo vuoto se ci sono risposte. Nessuna scadenza delle risposte in questa feature (BR7): si modifica finché il link funziona.

**C. Link non valido (AC6):** sconosciuto, revocato, scaduto, senza destinatario, forma errata: pagina neutra `not-found` (404), tema predefinito, **nessun nome, data o marchio**, h1 "Questo link non funziona più", testo "Se pensi sia un errore, scrivi a chi ti ha invitato.", nessun pulsante né link al login. All'apertura la risponde il **proxy** (404, HTML scritto a mano e senza script, `src/features/rsvp/neutral-html.ts`, stesso schema del 429; Arbitrato S3: `notFound()` dà un corpo vuoto senza JS), con tema fisso crema/antracite dal dispositivo, h1 28 px sans, testi identici per ogni causa. Se il link diventa non valido **durante la compilazione** (o il proxy lascia passare la pagina), l'invio sostituisce l'intera pagina con `LinkUnavailable` (200, stessi testi, nomi spariti), senza dire altro (AC11, DES-25); il focus va all'h1 (REV-22).

**D. Troppi tentativi (AC10):** all'apertura, `429` dal proxy con pagina HTML minima: h1 "Troppi tentativi", testo "Riprova tra 15 minuti.", `lang="it"`, viewport, `color-scheme` chiaro/scuro con CSS inline, 18 px, contrasto ≥ 4.5:1 (DES-29). Sugli **invii** il blocco per link mostra nel modulo (stato 200, scelte conservate) "Troppi tentativi: riprova tra 15 minuti" (Q-P2).

**E. Errori:** server non raggiungibile o offline (con JS): sopra il pulsante, in testo e `role="alert"`, "Non sono riuscito a salvare. Controlla la connessione e riprova."; le scelte restano in pagina (valori controllati, DES-26). Pagina di servizio (Supabase in pausa): testo adatto a un invitato (T7). Doppio tocco: il pulsante si disattiva con "Invio in corso…" (con JS); l'invio è idempotente lato server.

### 1.2 Lato coppia: Invitati (aggiunte a FEAT-2026-003)
**Stati del link** (testo, mai solo colore; precedenza del piano): *Scaduto* (data) · *Condiviso il {data}* / *Da condividere* · *Da rimandare* · *Nessun link*. "Da rimandare" spiega: "Qualcuno è cambiato di gruppo: il link che avevi mandato non lo copre più" con i nomi di `resend_guest_ids` (DES-33).

- **Riga persona**: dopo lato/gruppo/tavolo, presenza in testo e icona: "Sì" (check), "No" (x), "In attesa" (orologio, attenuato); ultimo elemento del nome accessibile ("Mario Rossi, Tony, Famiglia Rossi, Sì"). Per un destinatario individuale (senza gruppo o gruppo "ognuno per sé") una seconda riga attenuata dà lo **stato del link** ("Condiviso il 12 marzo"): senza, AC8 non è verificabile (DES-27). Da 768 px la presenza è una colonna in `rowColumns` (+ aggiornare `row-columns.test.ts`).
- **Titolo del gruppo** "insieme": "Famiglia Rossi · 2 sì · 1 in attesa"; seconda riga con lo stato del link e il pulsante **Invia** (44 px, nome accessibile "Invia il link di Famiglia Rossi"). Gruppo "ognuno per sé": nessun link sul titolo ("Risponde ognuno per sé"), i link sono sulle persone. Menu del gruppo: nuova voce **"Come rispondono"** → `GroupModeDialog` (due scelte, con la conseguenza scritta: "Passando a 'ognuno per sé' il link del gruppo smette di funzionare: servono 4 link nuovi", numero reale; "Passando a 'insieme' i 4 link personali smettono di funzionare"; focus su "Annulla").
- **Foglio "Link di {destinatario}"** (`Sheet` + `PanelContent`; da "Invia" del gruppo e dal foglio persona): in testa stato e scadenza ("Scade il 3 ottobre 2027" solo se la data è scelta; altrimenti "Non scade finché non scegli la data"). Avviso con data/location non scelte: "La data non è ancora decisa: chi apre il link vedrà 'Data da confermare'." (BR8).
  - *Nessun link*: un solo pulsante **Crea link**.
  - *Link attivo*: **Copia link**, **Condividi** (solo con `navigator.share`), **WhatsApp** (`<a href="https://wa.me/?text=…">`), pulsanti 44 px. Prima, il messaggio in un campo modificabile: "Ciao {nomi}! {A} e {B} si sposano e vorrebbero sapere se ci sarete. Rispondi da qui, ci vuole un minuto: {link}" (nomi di battesimo, max 3, altrimenti "Ciao a tutti!"). Il link è caricato all'apertura: skeleton breve, poi tutto a un tocco. Copia, Condividi e WhatsApp registrano "Condiviso il" con toast **Annulla** ≥ 8 s ("Condiviso" = copiato o aperto, non "inviato").
  - In fondo, separate: **Nuovo link** e **Revoca link** con `AlertDialog` e conseguenza (§4); dopo la revoca il pulsante diventa **Crea un nuovo link**.
  - *Scaduto*: "Scaduto il {data}. Se sposti la data, i link tornano a funzionare da soli." senza Crea/Nuovo (Q-P1, DES-30).
  - Destinatario "ognuno per sé" visto dal foglio persona: un solo link, quello della persona.
- **Altro → "Crea link per tutti (N)"**: N = destinatari senza link funzionante. Conferma "Creo N link nuovi? Poi li condividi uno a uno da ogni gruppo o persona." e toast "Ho creato N link" (nessun Annulla: si revoca dal foglio; DES-31). Disattivato con testo se N = 0 o link scaduti.
- **Foglio persona** (`GuestSheet`): sezione "Presenza" in sola lettura: stato, preferenze (solo Sì), "Ultima risposta: 3 marzo, dall'invitato"; riga "Invito: risponde con il gruppo Famiglia Rossi" + "Apri link" oppure il blocco link personale.
- **Importa**: "Annulla importazione" ora salta chi ha risposto o ha un link: il toast dice "Ho annullato 36 persone; 2 restano perché hanno già risposto o hanno un link" (DES-28).
- **Senza `guests/write`**: stati e risposte visibili, azioni nascoste, riga "Serve il permesso di modifica".
- **Esportazione**: nessuna schermata nuova; il testo di Opzioni dice che il JSON include presenze, preferenze e stato dei link (mai il token). Guida: pagina "Conferme di presenza" e `HelpLink` di Invitati (T12).

## 2. Stati
| Schermata | Caricamento | Vuoto | Errore | Successo | Permesso negato |
|---|---|---|---|---|---|
| Pagina pubblica, modulo | nessun `loading.tsx` (404 vero); pulsante "Invio in corso…" | nessuna risposta: carte senza scelta | zero scelte: riga di testo; offline/server: avviso con scelte conservate; 429 sugli invii nel modulo | conferma + riepilogo + Modifica | link non valido = vista C |
| Pagina pubblica, riepilogo | — | persona senza risposta: "In attesa" | come sopra | — | — |
| Pagina neutra / 429 / servizio | — | — | stesso testo per ogni causa (neutra) | — | — |
| Riga e gruppo (presenza, link) | skeleton della lista (R-03) | "In attesa" attenuato; "Nessun link" | schema non migrato: lista senza stati RSVP, senza errore | conteggio del gruppo annunciato | sola lettura: stati visibili |
| Foglio link | skeleton breve (URL in caricamento) | Nessun link: "Crea link" | "Non sono riuscito a creare il link" + Riprova; hash diverso: "Questo link va rigenerato" + "Nuovo link"; Copia negata: URL in campo selezionabile | toast "Link copiato" / "Aperto in WhatsApp" + Annulla | azioni nascoste con testo |
| Crea link per tutti | spinner sul pulsante | N = 0: disattivato con testo | "Non sono riuscito a crearli tutti" + Riprova | "Ho creato N link" | nascosto con testo |
| Modalità del gruppo | spinner | — | conflitto: `ConflictDialog` | toast | nascosto |
| Globali (coppia) | offline, servizio in pausa, sessione scaduta: come FEAT-2026-001 §4 | | | | |

## 3. Componenti
| Bisogno | Riuso (percorso) | Nuovo? |
|---|---|---|
| Guscio pubblico | `src/components/PublicShell.tsx` (salto a `#contenuto`) | `RsvpShell`: nomi della coppia, tema dal proxy, 18 px |
| Scelte, caselle, campi, avvisi | **input nativi** `radio` e `checkbox` stilati (Radix non invia il modulo senza JS: deviazione registrata in `plan.md → Change log`, REV-23); `ui/input.tsx`, `label.tsx`, `alert.tsx`, `card.tsx` | `RsvpPersonCard`, `RsvpSummary`, `LinkUnavailable` (pagina `not-found` e sostituzione dopo l'invio) |
| Pagine 429 e neutra | schema di `src/app/(public)/email/disattiva/html.ts` | `blocked-html.ts`, `neutral-html.ts` (servite dal proxy) |
| Lista, riga, gruppo, menu | `GuestRow.tsx`, `GroupHeader.tsx` (`ActionMenu`), `GuestSheet.tsx`, `GuestsScreen.tsx` | estendere (presenza, seconda riga, "Invia") |
| Fogli e dialoghi | `ui/sheet.tsx`, `timeline/PanelContent.tsx`, `ui/alert-dialog.tsx`, `ConflictDialog.tsx` | `LinkSheet`, `GroupModeDialog` |
| Annulla ≥ 8 s, errori | `timeline/actions.ts`, `Notices.tsx`, `ui/sonner.tsx`, `ErrorState.tsx` | no |

## 4. Copy ("tu")
| Dove | Testo |
|---|---|
| Titolo scheda, anteprima | "Conferma la tua presenza" · "Ci vuole un minuto" |
| Scelte / stato | "Sì, ci sono" · "No, non posso" · "In attesa" |
| Preferenze | "Vegetariano", "Vegano", "Senza glutine", "Senza lattosio", "Allergie o altro (max 200 caratteri)" |
| Invio / conferma | "Invia le risposte" · "Grazie! Abbiamo ricevuto le risposte" · "Modifica" |
| Neutra / 429 | "Questo link non funziona più. Se pensi sia un errore, scrivi a chi ti ha invitato." · "Troppi tentativi: riprova tra 15 minuti" |
| Revoca | "Revoco il link di {nome}? Chi lo apre vedrà che non funziona più. Le risposte già date restano." |
| Nuovo link | "Creo un nuovo link per {nome}? Quello vecchio smette di funzionare: dovrai rimandarlo." |
| Stati del link | "Nessun link" · "Da condividere" · "Condiviso il 12 marzo" · "Da rimandare" · "Scaduto il {data}" |
Mai "RSVP", "token", "destinatario" nelle etichette per la coppia ("RSVP" si spiega in Guida).

## 5. Accessibilità
Pagina pubblica: `lang="it"`, un solo `h1`, carte in `fieldset` con legenda = nome (mai "Persona 1"); bersagli ≥ 48 px con distanza ≥ 8 px; selezione con icona, testo e bordo (3:1 sul bordo, 4.5:1 sul testo, solo token del tema); preferenze mostrate dopo il Sì senza spostare il focus (nessun `aria-expanded`/`aria-controls` sul Sì: è un radio, non un disclosure); riga d'errore `role="alert"` con focus (zero scelte); nessun `aria-invalid` (l'errore è uno solo, la riga d'avviso col focus); `aria-describedby` sul campo "Allergie o altro" per contatore e riservatezza; quando `LinkUnavailable` sostituisce il modulo il focus va all'h1; conferma e contatore `role="status"`, focus sul pannello dopo l'invio; nessun timeout; zoom 200 % senza scorrimento orizzontale; `prefers-reduced-motion`. Coppia, come FEAT-2026-003 §6: foglio con focus trap, stato del link nel nome accessibile del gruppo ("Famiglia Rossi, 2 sì, 1 in attesa, link condiviso il 12 marzo"), dialoghi distruttivi con focus su "Annulla", Annulla dei toast ≥ 8 s e raggiungibile da tastiera.

## 6. Responsive
Pagina pubblica: una colonna a 320, centrata `max-w-xl` da 768, nessun layout a più colonne; `dvh`, nessuna barra fissa (browser interno di WhatsApp). Lista: a 320 presenza accanto al nome, link su seconda riga; da 768 colonna "Presenza" e fogli laterali. Barra a 6 voci invariata.

## 7. Mockup
```
Pagina pubblica 320 px            Invitati 320 px
Anna e Marco si sposano           -- Famiglia Rossi · 2 sì · 1 in att. [...]
sabato 3 settembre 2027           Condiviso il 12 marzo      [Invia]
Villa Aurora, Tivoli               Mario Rossi   Tony    [v] Sì
Dicci chi di voi viene.            Luca Rossi    Bamb.   [o] In attesa
        [Vengono tutti]           -- Senza gruppo --
+----------------------------+     Sara Bianchi  Entrambi [o] In attesa
| Mario Rossi                |     Nessun link
| [Sì, ci sono][No, non posso]|
| Preferenze (facoltative)   |    Foglio "Link di Famiglia Rossi"
+----------------------------+     Scade il 3 ottobre 2027
Hai scelto per 1 di 2             [Messaggio modificabile........]
[ Invia le risposte ]             [Copia link][Condividi][WhatsApp]
Nota privacy · Manca qualcuno?    ---------------------------------
                                  [Nuovo link]   [Revoca link]
```

## Verifica F3 (S3)
Pagina pubblica provata il 2026-11-27: `reviews/design-1.md` (DES-37 bloccante: invio senza JS rotto da `no-referrer`).

## Obiezioni F1: esito
DES-1..23 chiuse (accolte, tranne DES-17 in parte, DES-4/7/10/13 e filtri di DES-11 rimandate a R-07, DES-21 respinta): tabella in `reviews/f2-designer.md`, con le nuove DES-24..36.

## 8. Controlli visivi di accettazione (F3)
- [ ] Pagina pubblica a 320, 360, 390, 768, 1280 px, chiaro e scuro, in almeno 4 temi: nessuno scorrimento orizzontale, bersagli ≥ 44 px, testo ≥ 16 px, contrasto di selezione e bordi; tema del matrimonio senza lampeggio.
- [ ] Con data/location scelte e non scelte ("Data da confermare", "Luogo da confermare" + nota); nessun marchio dell'app, nessun nome nel titolo scheda.
- [ ] Persona sola; gruppo di 4 con bambino e neonato: Sì/No, "Vengono tutti", preferenze, invio parziale, contatore, zero scelte con riga che spiega.
- [ ] Senza JavaScript: invio, preferenze sempre visibili, Modifica con `<details>`, riga d'errore a zero scelte.
- [ ] Dopo l'invio: conferma e riepilogo; riapertura: riepilogo; "erano già cambiate" con due schede; link revocato durante la compilazione: pagina neutra senza nomi.
- [ ] Neutra identica (testo, aspetto) per sconosciuto, revocato, scaduto, senza destinatario; 429 all'apertura (pagina minima accessibile, chiaro/scuro); blocco sugli invii nel modulo con scelte conservate; offline con scelte conservate.
- [ ] Rete: nessuna risorsa di terzi; `noindex`, `no-store`, `Referrer-Policy: same-origin` sulla pagina con il modulo (con `no-referrer` il POST senza JS porta `Origin: null` e Next lo rifiuta, DES-37; `no-referrer` resta su neutra e 429); anteprima statica senza nomi. axe pulito su tutte le viste; tastiera e lettore di schermo (legende, focus dopo l'invio).
- [x] Invitati a 320 e 1280: presenza nella riga, link su seconda riga per i destinatari individuali, titolo di gruppo con stato e "Invia", nessun troncamento. (S4, `reviews/design-2.md`: verificato; aperti DES-49 nome lungo, DES-50 colonna Presenza)
- [x] Foglio link: Crea, Copia, WhatsApp (testo modificabile), Condividi nascosto senza `navigator.share`, "Condiviso il" con Annulla, Nuovo link e Revoca con conseguenza, "Crea un nuovo link", Scaduto, "Da rimandare" con nomi; (S4 giro 3: DES-45..48, 59, 60 chiusi, axe pulito in tutti gli stati). **Resta al Gate C:** link da iPhone reale e dal browser interno di WhatsApp.
- [x] "Come rispondono" con conseguenza scritta; "Crea link per tutti (N)" con conferma e toast; Annulla importazione con il nuovo testo. (S4: verificato; DES-52 copy con 0 link)
- [x] Partner in sola lettura: stati visibili, azioni nascoste con testo. (S4: con ruolo di sola lettura simulato in locale)
