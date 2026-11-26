# FEAT-2026-004 — F1 challenge dell'architetto

Verdetto: **fattibile nello stack attuale, senza nuove dipendenze né servizi a pagamento**. Due punti bloccanti si risolvono riscrivendo il testo dei requisiti (BR9, AC1). Serve **una nuova variabile segreta** (`RSVP_LINK_SECRET`) in Vercel, sia in produzione sia in preview.

| ID | Gravità | Tema |
|---|---|---|
| ARC-1 | should, `question-for-developer` | Q8: rimostrare il link senza salvare il token |
| ARC-2 | should | Limitatore: tabella condivisa con il login |
| ARC-3 | **blocking**, `question-for-developer` | BR9 "il token non finisce nei log": impossibile con il token nel percorso |
| ARC-4 | **blocking** | AC1 "al primo uso il link viene creato": su iOS si rompono Condividi e WhatsApp |
| ARC-5 | should, `question-for-developer` | Destinatario calcolato, non salvato (BR1-BR4, Q3) |
| ARC-6 | note | Dove salvare le risposte, audit, conflitto (AC13, AC16, AC19) |
| ARC-7 | note | "Segna presenza" multipla e BR11 |
| ARC-8 | should, `question-for-developer` | 19 AC: divisione e ordine dei passi |
| ARC-9 | note | Impianto della pagina pubblica |
| ARC-10 | note | Orologio nei test di scadenza |

## ARC-1 — Q8: ricopiare il link (should, `question-for-developer`)
- **Evidenza.** ADR-0002 §3 (`docs/adr/0002-dati-personali-invitati.md:40-45`): nel DB solo lo sha256 di un token casuale. `src/features/invitations/token.ts:28-31`: il token si genera una volta e non si rivede più. Esiste già un precedente di link derivati con HMAC: `docs/technical/sicurezza.md:202-207` (`EMAIL_LINK_SECRET`).
- **Proposta (raccomandata).** Il token si **deriva** invece di estrarlo a caso: `token = base64url(HMAC-SHA256(RSVP_LINK_SECRET, "r2y-rsvp:v1:" + link_id))`, 32 byte, 43 caratteri, stessa forma di `isTokenShape`.
  - Il DB conserva solo `sha256(token)` per la ricerca, come oggi, e nessun segreto.
  - Il server ricalcola il link quando un partner lo chiede, con una server action che controlla `guests/read`.
  - "Nuovo link" = nuova riga con nuovo `link_id` e la vecchia revocata, quindi non serve un contatore.
  - Il segreto è dedicato, non `SUPABASE_SECRET_KEY`: ruotare la chiave Supabase non deve spegnere i link.
- **Conseguenze.**
  - Ruotare `RSVP_LINK_SECRET` invalida tutti i link: equivale a un "Nuovo link" per tutti (runbook).
  - Chi ottiene il segreto e gli id dei link può ricostruire i token. Gli id però li legge solo chi ha già accesso ai dati degli invitati: rischio marginale.
  - In preview (staging) va un valore diverso da quello di produzione.
- **Alternative scartate.**
  - Token cifrato con AES-GCM e salvato: stesso segreto, più codice (IV, colonna in più), nessun vantaggio.
  - Token in chiaro: chi legge il DB ha tutti i link.
  - pgsodium/Vault: già scartati da ADR-0002.
- **ADR.** Nuovo **ADR-0003 "Link RSVP: token derivato e accesso pubblico"**. Precisa ADR-0002 §3 senza sostituirlo: la regola "solo sha256 nel DB" resta vera; cambia "token casuale" in "token imprevedibile (PRF)". Registra anche i limiti (ARC-2) e il residuo dei log (ARC-3). Ad ADR-0002 si aggiunge solo un rimando.
- **Risposta proposta a Q8:** sì, con il token derivato.

## ARC-2 — Limitatore: non condividere la tabella del login (should)
- **Evidenza.** `login_record` cancella da `private.login_attempts` **ogni** riga con la finestra scaduta secondo la finestra del login (`supabase/migrations/20261201100000_core.sql:1324-1329`). Se le chiavi RSVP stanno nella stessa tabella con finestre diverse, un login le azzera: accoppiamento nascosto. La chiave contiene il prefisso `r2y-login:` (`src/features/auth/limiter-keys.ts:16`).
- **Proposta.**
  - Stesso schema (chiavi HMAC, finestra e blocco, upsert atomico come `register_login_failure`), ma tabella propria `private.rsvp_attempts`.
  - Due RPC solo-chiave: `rsvp_gate` e `rsvp_record`, ciascuna con la pulizia delle proprie righe.
  - Contesto della chiave HMAC: `r2y-rsvp:ip:` e `r2y-rsvp:link:`.
  - BR9 diventa "stesso schema dei tentativi di login" invece di "stessa infrastruttura".
- **Soglie proposte (BR9).**
  - Token ben formati ma non validi, per IP: 10 in 15 minuti, poi blocco di 15 minuti.
  - Invii, per link: 20 in 15 minuti, poi blocco di 15 minuti (una famiglia di 6 che corregge più volte resta sotto).
  - Token malformati: pagina neutra senza chiamare il DB e senza contare.
  - IPv6: chiave sul prefisso /64.
  - IP assente: vale solo il limite per link, come R27(b) (`sicurezza.md:148-153`).
- Il vero controllo resta il token a 256 bit. I limiti proteggono le quote gratuite e il DB.

## ARC-3 — Token nel percorso e log di Vercel (blocking, `question-for-developer`)
- **Evidenza.** BR9 chiede "il token non finisce nei log". Per `/invito` il residuo è già documentato (`sicurezza.md:194`, REV-8): il percorso finisce nei log delle richieste di Vercel. Lì però il link vive al massimo 7 giorni; qui vive mesi e i link sono centinaia.
- **Opzioni.**
  - (a) **Raccomandata.** Token nel percorso, come `/invito`. BR9 diventa "il codice dell'app non scrive mai il token nei log". Il residuo (log delle richieste Vercel, a breve conservazione sul piano Hobby, visibili solo al proprietario del progetto; cronologia del browser) si accetta e va in ADR-0003.
    - Pro: la pagina si apre anche senza JavaScript e lo schema è quello già in uso.
  - (b) Token nel frammento (`/rsvp#token`): il frammento non arriva al server, quindi niente log, niente Referer e nessun nome nelle anteprime.
    - Contro: la pagina carica i dati via JavaScript (POST dopo il caricamento), e quindi diventa più lenta e più complessa; resta da verificare che tutti i messenger conservino il `#`.
- **Risposta proposta:** (a), con il residuo accettato esplicitamente.

## ARC-4 — AC1 "al primo uso il link viene creato" (blocking)
- **Evidenza.** Con ARC-1 il link si ottiene solo da una chiamata al server. Safari iOS, e quindi anche il browser interno di WhatsApp su iOS (NFR), perde l'attivazione dell'utente dopo un `await`:
  - `navigator.share` e `window.open('https://wa.me/?text=…')` lanciati dopo la creazione falliscono o vengono bloccati come popup;
  - per "Copia" esiste un aggiramento (`ClipboardItem` con una promise), non per gli altri due.
- **Proposta.** Il link si crea con un'azione esplicita **"Crea link"**, singola o multipla con "Crea link per tutti", e poi compaiono Copia, Condividi e WhatsApp.
  - Il link si carica quando si apre il menu delle azioni, con una lettura che non crea nulla.
  - Il tocco usa poi un URL già presente in pagina, in modo sincrono.
  - "Condiviso il" (Q6) si registra dopo il tocco, senza bloccarlo.
- AC1 va riscritto in questo senso; i dettagli dell'interazione li decide il designer.

## ARC-5 — Destinatario calcolato (should, `question-for-developer`)
- **Evidenza.** Gruppi ed eliminazioni sono logici e il puntatore resta (`20261202100000_guests.sql:9-10`). "Senza gruppo" è già calcolato dall'app come "id nullo o gruppo eliminato". BR2-BR4 richiederebbero trigger su ogni spostamento: `guests_bulk` alla riga 386, modulo, import, eliminazione del gruppo.
- **Proposta.**
  - Tabella `rsvp_links`: `id`, `wedding_id`, `group_id` oppure `guest_id` (esattamente uno dei due), `token_hash` unico, `created_*`, `revoked_at`, `shared_at`. Indici unici parziali "un link non revocato per gruppo" e "uno per persona".
  - Gruppi: nuova colonna `guest_groups.rsvp_mode` (`together` predefinito, oppure `separate`).
  - Un link **funziona** se è non revocato, non scaduto e il suo bersaglio è *ora* un destinatario:
    - gruppo vivo in modalità `together`;
    - oppure persona viva senza gruppo vivo o in un gruppo `separate`.
  - Le persone mostrate sono i membri vivi *attuali*. Una sola funzione SQL privata decide, e la usano sia la pagina pubblica sia la lista.
  - Così BR1-BR4 valgono senza trigger. La scadenza di Q3 si calcola dalla decisione "Data" presa (+30 giorni, `decisions_timeline.sql:43,899`): niente `expires_at` salvato.
  - BR5: FK `on delete cascade` verso `guests` e `guest_groups`.
- **Conseguenza da confermare.** Un link "dormiente" si riattiva quando il suo bersaglio torna destinatario: per esempio il link personale di chi esce di nuovo dal gruppo, o il link di un gruppo ripristinato. È coerente con BR4 ("Ripristina torna attivo").
- **`question-for-developer`.** "Link da rimandare" = destinatario senza link funzionante, di cui almeno una persona era coperta da un link già condiviso (`shared_at`) che ora non la copre più.
  - Risposta proposta: sì; la riattivazione dei link dormienti è accettata.

## ARC-6 — Risposte: colonne su `guests`, escluse dall'audit (note)
- **Evidenza.**
  - Il conflitto di R-03 si basa su `guests.version` (`GuestSheet.tsx`, `data.ts`; trigger `bump_version`, `guests.sql:188`).
  - L'audit esclude le colonne con un elenco di esclusioni, e il test allowlist obbliga a classificare ogni colonna nuova (`guests.sql:14-16`).
- **Proposta per F2.**
  - Colonne su `guests`: `rsvp_status`, `rsvp_diet text[]` con `check`, `rsvp_diet_note` fino a 200, `rsvp_source`, `rsvp_answered_at`.
  - `rsvp_source` lo imposta un trigger (`couple` se `auth.uid()` non è nullo, altrimenti `guest`); il client non lo scrive mai.
  - AC16 viene gratis: la risposta dell'invitato incrementa `version` e il modulo del partner mostra il dialogo esistente.
  - Tutte e cinque le colonne vanno aggiunte agli argomenti di `audit_row` (AC19) e all'elenco di ADR-0002 §1.
- **Alternativa.** Tabella `rsvp_responses` 1:1 con la propria `version`. Il modulo però scriverebbe due righe senza atomicità, quindi servirebbe un RPC.

## ARC-7 — "Segna presenza" multipla (note)
- Estendere `guests_bulk` e `guests_bulk_undo` (`guests.sql:325,404`) con l'operazione `set_rsvp`.
- Con BR11, "No" cancella le preferenze: allora "Annulla" deve ripristinarle, e `previous` restituisce al client preferenze (dati sanitari) della coppia.
- Alternativa più semplice: la selezione multipla cambia solo lo stato, e "No" multiplo cancella le preferenze solo dopo una conferma che lo dice, senza Annulla per le preferenze. Da decidere con PO e designer.

## ARC-8 — 19 AC: dividere o riordinare (should, `question-for-developer`)
- **Evidenza.**
  - Le AC sono più di 15.
  - Il merge su main va in produzione (`.adf/project.md:23-24`), quindi i "passi" di una sola feature escono insieme: non si possono rilasciare separatamente.
  - AC18 (backup) e AC19 (cancellazione, audit, RLS) devono esistere **dal primo giorno** in cui ci sono risposte vere: ora stanno nel passo 3.
- **Proposta.** Due feature rilasciabili.
  - **FEAT-004**: AC1-AC10, AC17, AC18 (solo JSON), AC19; 13 AC, taglia L.
  - **Feature successiva** (taglia M): AC11-AC16 e le colonne CSV di AC18.
  - Se lo sviluppatore preferisce una sola feature: spostare AC18 e AC19 nel passo 1.
- **Risposta proposta:** dividere. La data non è ancora decisa e il matrimonio è nel 2027, quindi non c'è urgenza di avere tutto subito.

## ARC-9 — Impianto della pagina pubblica (note)
- **Percorso.**
  - Proposta: `/rsvp/[token]`, aggiunto a `PUBLIC_PREFIXES` (`src/features/auth/guards.ts:46`) e a `NO_REFERRER_PREFIXES` (`src/proxy.ts:26`).
  - Un partner con sessione passa comunque (`guards.ts:122`). `no-store` lo mette già il proxy (`proxy.ts:44`).
- **Accesso ai dati.**
  - Solo RPC `SECURITY DEFINER` concesse a `service_role` (schema di `core.sql:1012`, 1403): `rsvp_page(hash)` e `rsvp_submit(hash, answers)`.
  - La chiave segreta si usa solo lato server; nessun `anon`.
  - Gli id delle persone inviati dal client vanno ricontrollati contro i membri *attuali* del destinatario.
  - pgTAP verifica l'**insieme esatto delle chiavi** restituite (AC3).
- **Risposte HTTP.** Una risposta neutra unica (404 con pagina neutra propria) per token sconosciuto, revocato, scaduto o senza destinatario. 429 solo per i limiti per IP, che non rivelano un token.
- **Anteprime.**
  - `generateMetadata` statico, senza chiamare l'RPC.
  - Telegram, iMessage e altri scaricano l'HTML lato server e vedono i nomi come il destinatario; WhatsApp genera l'anteprima sul dispositivo. Accettato, a meno di scegliere ARC-3(b).
- **Tema.** Il tema della pagina arriva dal risultato dell'RPC e non dalla sessione: oggi il layout lo legge dalla sessione (`themes/server.ts`).
- **Pagina di servizio.** Con Supabase in pausa o irraggiungibile, il proxy riscrive a `/servizio` (`guards.ts:108-110`): il testo deve andare bene anche per un invitato.
- **AC10 "aprire il link non modifica nulla".** Precisare "nessun dato del matrimonio": il contatore dei tentativi per IP scrive comunque.

## ARC-10 — Orologio nei test (note)
- Scadenza delle risposte (fine giornata Europe/Rome) e scadenza dei link si calcolano nell'RPC con `now()`.
- Per gli e2e serve un `now` iniettabile dal server, con la stessa regola del cookie `r2y-test-now` (solo con `E2E_CLOCK=1` e senza `VERCEL`, `.adf/project.md:53`). In produzione va ignorato.
- In pgTAP: date relative a `current_date`.

## Approvazioni per lo sviluppatore
- Nuova variabile segreta `RSVP_LINK_SECRET` (Vercel produzione e preview, valori distinti, *Sensitive*).
- Residuo dei log di Vercel (ARC-3).
- Migrazione solo additiva; nessuna nuova dipendenza.
- Nessun cambio ai permessi: si riusa l'area `guests`.
