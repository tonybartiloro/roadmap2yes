# FEAT-2026-001: checklist manuale di accessibilità e dispositivi (QA, F3)

Parte automatica: `e2e/a11y.spec.ts` (axe WCAG 2.2 AA con `target-size` e `color-contrast`, reflow 320 px e zoom 200 %, tastiera, `prefers-reduced-motion`), `e2e/themes.spec.ts` (12 temi, chiaro e scuro) e `e2e/degraded.spec.ts` (pagine di servizio). Questa lista copre **solo ciò che axe e Playwright non possono dire**. Da eseguire su staging con l'account di smoke e dati finti (`@example.test`), mai su produzione.

Esito: `[ ]` da fare, `[x]` ok, `[!]` problema (aprire un `QA-n` nel review).

## 1. VoiceOver (iPhone, Safari)
Attiva VoiceOver (Impostazioni > Accessibilità). Per ogni schermata: scorri con un dito a destra e ascolta l'ordine.

- [ ] **Accesso**: "La tua email", "Il tuo codice d'accesso" (campo sicuro), "Mostra il codice" annunciato come pulsante a stato (premuto/non premuto), errore neutro letto subito dopo l'invio ("Email o codice non corretti." o "Troppi tentativi…").
- [ ] **Onboarding**: all'avanzare di un passo il focus va al titolo e viene letto "Passo N di 8"; le carte di scelta (rito, invitati, stile) si leggono come gruppo di opzioni con una sola selezionata; "Genera" legge il codice una volta sola e non lo ripete in altri punti.
- [ ] **Home**: il conto alla rovescia si legge come frase intera ("Se fosse il 3 settembre 2027: mancano N giorni"); "provvisorio" o "definitivo" è detto a voce, non solo colore.
- [ ] **Percorso**: ogni compito si legge "Segna come fatto: titolo", scadenza in testo ("tra 3 settimane, 12 mar 2027"), assegnatario ("Se ne occupa: …"); i gruppi (Adesso, Da recuperare, …) sono titoli navigabili con il rotore; il banner "Anteprima" si annuncia da solo e dice che nulla è salvato; il toast "Annulla" dopo l'eliminazione è raggiungibile prima che scada (almeno 8 s).
- [ ] **Scelte**: carte con le stesse righe in ordine (Comune, Costo indicativo, Link, Pro, Contro, Note); pro e contro letti con "Pro:" e "Contro:"; la tabella "Confronta 2" si legge per righe con intestazioni; la reazione ("Preferisco" / "Dubbioso") è annunciata come premuta.
- [ ] **Budget**: le barre dicono il testo equivalente ("Concordato € X di € Y", percentuale); gli avvisi "Sei oltre di € …" sono letti con tono neutro.
- [ ] **Altro**: "Esci" è trovato come pulsante; la galleria dei temi è un gruppo di opzioni con il tema in uso detto a voce.
- [ ] **Pagine di servizio** ("L'app è in pausa", "Non riesco a raggiungere il servizio"): il titolo è annunciato appena compare; "Riprova" raggiungibile; i dettagli per chi gestisce l'app si aprono e si leggono.
- [ ] **Dialoghi e fogli** (compito, filtri, scelta, riapertura, revoca invito): il focus entra nel foglio, non esce finché è aperto, torna al pulsante che l'ha aperto alla chiusura (vedi anche `QA-6`).

## 2. Tastiera esterna (iPad o Mac con Safari)
- [ ] "Vai al contenuto" è il primo elemento raggiungibile e porta al contenuto principale.
- [ ] Ordine di tabulazione uguale all'ordine visivo, nessuna trappola, focus sempre visibile su ogni tema.
- [ ] Esc chiude fogli e popover; Invio e Spazio attivano pulsanti, carte tema, reazioni e checkbox dei compiti.
- [ ] La galleria dei temi si naviga con le frecce.

## 3. Zoom e testo grande
- [ ] Safari con "Dimensione testo" al massimo e iOS "Testo più grande": nessun testo tagliato, nessun pulsante sovrapposto, la barra di navigazione resta usabile.
- [ ] Zoom pagina 200 % e 400 % su Percorso e Budget: contenuto leggibile senza scorrimento in due direzioni (eccetto la tabella "Confronta 2", che scorre nel suo riquadro).
- [ ] Orientamento orizzontale su telefono: nulla bloccato dalla barra in basso o dalla tastiera aperta.

## 4. Preferenze di sistema
- [ ] **Riduci movimento**: nessuna animazione di scorrimento o scivolamento nei fogli, nella barra di avanzamento e nei toast.
- [ ] **Aspetto scuro**: con "Come il dispositivo" l'app segue il sistema; la scelta chiaro/scuro per dispositivo resta dopo il riavvio. Controllare a occhio almeno tre temi tra i 12 (uno chiaro, uno scuro per natura, uno vivace).
- [ ] **Aumenta contrasto**: testo e bordi restano leggibili.
- [ ] **Colori invertiti / filtri di colore**: avvisi e stati (provvisorio, definitivo, oltre budget, da recuperare) restano distinguibili per icona e testo.

## 5. Dispositivi reali (non coperti da Playwright WebKit)
- [ ] iPhone con Safari (iOS corrente e uno precedente): accesso con gestore di password (compila email e codice), incolla nel campo del codice, tastiera numerica sugli importi, selettore data nativo.
- [ ] Android con Chrome: stesso percorso; barra in basso non coperta dalla barra del browser.
- [ ] Installazione come app (manifest): icona, colore della barra (`theme-color`) coerente con il tema scelto.
- [ ] Rete lenta o assente: banner "Sei offline" e bozza ripristinata dopo il ritorno online (modulo compilato a metà).

## 6. Linguaggio (non automatizzabile)
- [ ] Tutto in italiano con "tu", senza gergo tecnico; nessun "sposo/sposa" fisso: nomi o etichette scelte dalla coppia.
- [ ] Il pulsante rapido dei compiti ("Miei / Di {partner} / Tutti") legge una frase corretta con nomi di ogni tipo (nome vuoto, nome con articolo, nome lungo). Nota QA-3: con il partner senza nome il pulsante dice "Di il tuo partner".
- [ ] Messaggi di errore: dicono cosa è successo e cosa fare, senza colpa e senza colore come unico segnale.

## 7. Cosa NON è stato verificato dagli automatici (limiti noti)
- Contrasto di elementi sotto stati hover o focus profondi, immagini e icone decorative: solo a vista.
- Comportamento con tecnologie assistive diverse da VoiceOver (TalkBack, NVDA): non coperto in R1.
- Il motore WebKit di Playwright non è Safari: ciò che sembra a posto in `webkit-smoke` va comunque guardato su un iPhone vero.
