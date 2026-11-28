# ADR-0003 — Link RSVP: token derivato e accesso pubblico

| Status | Date | Deciders | Related feature | Supersedes |
|---|---|---|---|---|
| accepted | 2026-11-26 | architect (proposta); tonybartiloro (D3-D5 del brief, 2026-11-26; approvata al Gate B il 2026-11-26) | FEAT-2026-004 (`.adf/features/FEAT-2026-004/plan.md`) | — (precisa ADR-0002 §3) |

## Context
- **R-04**: ogni destinatario (gruppo "insieme" o persona) riceve un link personale, aperto **senza login** da una pagina pubblica che legge e scrive dati di terzi (nomi, presenza, preferenze alimentari = dati sanitari).
- **ADR-0002 §3**:
  - mai `anon` sulle tabelle degli invitati;
  - RPC `SECURITY DEFINER` chiamate con la chiave segreta;
  - nel DB solo lo sha256 del token;
  - risposta neutra.
- **Ricopiare il link (D3)**: la coppia deve poter ricopiare il link attivo in qualsiasi momento. Lo schema di `invitation_by_token` (`supabase/migrations/20261201100000_core.sql:1012`, `src/features/invitations/token.ts`), con un token casuale mostrato una volta sola, non lo permette.
- **Precedente**: link firmati con HMAC e segreto dedicato (`EMAIL_LINK_SECRET`, `src/lib/email/unsubscribe-token.ts`).
- **Vincoli**:
  - Vercel Hobby e Supabase free, nessuna dipendenza nuova;
  - `lib/supabase/admin.ts` è importabile solo da 4 ambiti (`eslint.config.mjs`), e ogni nuovo ambito richiede un ADR;
  - il limitatore di login (`private.login_attempts`) pulisce le righe con la propria finestra (`core.sql:1324-1329`);
  - un server component non può impostare 429 né `Retry-After`;
  - `notFound()` dà 404 solo prima dello streaming.

## Decision
1. **Token derivato.**
   - `token = base64url(HMAC-SHA256(RSVP_LINK_SECRET, "r2y-rsvp:v1:" + link_id))`, cioè 32 byte e 43 caratteri, la forma di `isTokenShape`.
   - `link_id` è un uuid v4 generato dal server alla creazione.
   - Il DB conserva solo `sha256(token)` (`rsvp_links.token_hash`, unico, escluso dall'audit e dai grant di lettura), quindi nessun segreto.
   - Il server ricalcola il link per la coppia con `guests/write` e verifica che lo sha256 coincida con quello salvato; altrimenti "va rigenerato".
   - "Nuovo link" = nuova riga con nuovo id + revoca della vecchia.
2. **Segreto dedicato `RSVP_LINK_SECRET`.**
   - Almeno 32 caratteri; Vercel Production e Preview con valori diversi, *Sensitive*.
   - Lo legge solo il lato coppia. La pagina pubblica non ne ha bisogno: calcola solo lo sha256.
   - **Ruotarlo non spegne i link già condivisi**, perché il DB confronta lo sha256 del token vecchio. Fa solo fallire il ricalcolo, e il foglio chiede "Nuovo link".
   - In caso di fuga del segreto, il runbook prevede rotazione + revoca di tutti i link attivi + nuovi link.
3. **Accesso pubblico solo con la chiave segreta.**
   - Tre RPC `SECURITY DEFINER` concesse solo a `service_role`: `rsvp_gate`, `rsvp_page`, `rsvp_submit`.
   - Restituiscono un insieme di chiavi chiuso e verificato da pgTAP.
   - Il wrapper `src/features/rsvp/public-rpc.ts` diventa il **quinto ambito** autorizzato a importare `admin.ts`. Espone solo queste tre funzioni.
4. **Destinatario calcolato.**
   - Un link funziona se è non revocato, non scaduto (scadenza = 30 giorni dopo la data scelta, fine giornata Europe/Rome) e il suo bersaglio è *ora* un destinatario.
   - Lo decide una sola funzione SQL privata, usata dalle RPC pubbliche e dallo stato della lista.
5. **Limiti (BR9).**
   - Tabella propria `private.rsvp_attempts`, stesso schema dei tentativi di login.
   - Chiave IP = HMAC con il contesto `r2y-rsvp:ip:`, su IPv6 per prefisso /64. Chiave del link = digest dell'id del link.
   - Link non validi: 10 per IP in 15 minuti, poi blocco di 15 minuti. Un token che funziona non è mai bloccato dal limite per IP.
   - Invii: 20 per link in 15 minuti.
   - IP assente: nessun limite per IP, resta quello per link (come R27(b)).
   - Il tempo (`p_now`) lo dà solo il server, con `resolveNow()`, mai la richiesta.
6. **Risposte HTTP e intestazioni.**
   - Ogni link che non funziona (sconosciuto, malformato, revocato, scaduto, senza destinatario) dà la stessa pagina neutra con **404**. Il segmento non ha `loading.tsx`, così lo stato non va perso nello streaming.
   - Il blocco per IP in apertura dà **429 + `Retry-After`** dal proxy, che chiama `rsvp_gate` prima della pagina. Se la chiamata scade, il proxy lascia passare (fail-open).
   - Un invio su un link che non funziona più dà lo stesso contenuto neutro per ogni causa, ma con stato 200: una server action non può cambiare lo stato HTTP.
   - Il blocco sugli invii compare come messaggio nel modulo, per la stessa ragione.
   - Sempre: `Cache-Control: private, no-store` e `noindex`; anteprima statica senza nomi.
   - `Referrer-Policy`: `no-referrer` sulla pagina neutra 404 e sul 429, che non hanno moduli. `same-origin` sulla pagina con il modulo (D15, 2026-11-27): con `no-referrer` il modulo senza JavaScript invia `Origin: null` e Next rifiuta l'invio (DES-37). Con `same-origin` il referrer non esce mai dal sito: il percorso con il token può comparire nei log delle richieste dello stesso sito, con la stessa durata e lo stesso pubblico del punto 8.
7. **Tema senza sessione.** Il proxy passa il tema del matrimonio, letto da `rsvp_gate`, in un'intestazione di richiesta propria (`x-r2y-theme`), che rimuove da ogni richiesta del client. Il layout radice la legge per prima. Per i link non validi usa il tema predefinito.
8. **Residuo accettato (D5).** Il token sta nel percorso. Il codice dell'app non lo scrive mai nei log, ma il percorso finisce nei log delle richieste di Vercel (breve conservazione su Hobby, visibili solo al proprietario del progetto) e nella cronologia del browser.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Token casuale, mostrato una volta (come `/invito`) | Nessun segreto nuovo | Non si ricopia: ogni nuovo invio invalida il precedente (contro D3) |
| Token cifrato (AES-GCM) salvato nel DB | Ricopiabile | Stesso segreto, più codice e una colonna sensibile in più; nessun vantaggio |
| Token in chiaro nel DB | Semplice | Chi legge il DB ha tutti i link |
| Token nel frammento (`#token`) | Niente log né Referer né nomi nelle anteprime | La pagina dipende da JavaScript; non è certo che tutti i messenger conservino il `#` (respinta in D5) |
| RPC concesse ad `anon` con la chiave pubblicabile | Niente nuovo ambito per `admin.ts` | Contro ADR-0002 §3; superficie `anon` permanente su dati di terzi |
| Limiti nella tabella del login | Riuso | La pulizia del login accorcia le finestre RSVP (accoppiamento nascosto) |

## Consequences
- **Positive**:
  - la coppia ricopia e ricondivide i link senza invalidarli;
  - nel DB nessun segreto e nessun token;
  - cambiare gruppo o modalità ed eliminare o ripristinare non richiede trigger: lo stato si calcola;
  - nessuna dipendenza né servizio nuovo.
- **Negative**:
  - un segreto in più da gestire. Se manca, la coppia non può creare né copiare link; la pagina pubblica continua a funzionare;
  - chi ha insieme il segreto e gli id dei link può ricostruire i token (gli id li legge solo chi ha già i dati degli invitati);
  - una chiamata al DB in più per ogni apertura della pagina (gate nel proxy);
  - il residuo dei log di Vercel dura quanto il link.
- **Follow-up**:
  - R-07: la risposta a mano usa la `version` di `rsvp_responses`;
  - se un giorno servirà, l'invalidazione automatica alla rotazione del segreto si ottiene salvando una chiave HMAC invece dello sha256, con una migrazione.

## Compliance
- **pgTAP**:
  - insieme esatto delle chiavi di `rsvp_page`;
  - risposte neutre identiche per ogni causa;
  - regole del destinatario e scadenza;
  - EXECUTE solo `service_role` sulle RPC pubbliche, nessun grant `anon`;
  - `token_hash` fuori da audit e grant.
- **Unit**:
  - derivazione deterministica con vettori fissi;
  - forma del token;
  - chiavi del limitatore (IPv6 /64).
- **Acceptance** (HTTP):
  - 404 neutro identico;
  - 429 con `Retry-After`;
  - intestazioni;
  - nessun accesso PostgREST con la chiave pubblicabile.
- **Lint**: `admin.ts` solo dai 5 ambiti.
- **Test d'integrazione**: spia `console`, nessun token né valore nei log.
- **Revisione**: round di sicurezza in F3 su RPC pubbliche, proxy, limiti ed esposizione dei dati.
