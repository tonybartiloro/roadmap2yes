# FEAT-2026-004 — Conferme di presenza (RSVP) con link personale: implementation plan

| Brief | Design | Size | Status |
|---|---|---|---|
| brief.md (approved 2026-11-26) | design.md (finalizzato dal designer in F2: qui solo rimandi alle sezioni) | L | draft |

## Current state
Prima di R-04 (F2); le parti già sostituite dall'implementazione sono nella Solution.
- **Invitati (R-03).** `guests`, `guest_groups`, `guest_tables` con eliminazione logica e "senza gruppo" calcolato dall'app (`20261202100000_guests.sql:9-10,35-104`); audit senza colonne personali, allowlist che obbliga a classificare ogni colonna nuova (`guests.sql:14-16,197-203`; `guests_model.test.sql:294-314`); conflitti con `version` + `versionedUpdate` (`src/features/guests/data.ts:383-410`); `undo_guest_import` in `20261202200000_guests_import.sql:164-166`.
- **Link pubblici.** `/invito/[token]`: token casuale, solo sha256 nel DB, RPC `invitation_by_token` solo `service_role` (`core.sql:1012-1042,1403-1409`). HMAC con segreto ≥ 32 caratteri in `src/lib/email/unsubscribe-token.ts`.
- **Proxy.** `getClaims` → `evaluateGuards` → `decorate` (`no-store`, `Referrer-Policy`; `proxy.ts:26,41-46`); pubblici in `guards.ts:46-55`, backend giù → `/servizio` (`:108-110`). Su Node, può rispondere con un `Response` e uno stato (`proxy.md:255-257,591-614`). `X-Robots-Tag` globale (`next.config.ts:46`).
- **Chiave segreta.** `admin.ts` importabile da 4 ambiti (`eslint.config.mjs:100-151`).
- **Limitatore di login.** `private.login_attempts` + `register_login_failure` (`core.sql:253-259,1272-1295`); la pulizia cancella ogni riga con la finestra del login (`:1324-1329`); chiavi HMAC e `clientIp` in `limiter-keys.ts`.
- **Tema.** Sessione → cookie → predefinito (`src/themes/server.ts:59-78`); `[data-theme][data-mode]` sullo stesso elemento (`themes.css:3,28`).
- **Next 16.** Con `loading.tsx`/`Suspense` un `notFound()` resta 200 (`not-found.md:193-195`); una server action non imposta lo stato HTTP.
- **Dati della pagina.** Data e location scelte da `decisions`, `decision_options.title/comune`, `date_scenarios.date_from` (`20261201200000_decisions_timeline.sql:36-113`; `choose_option` fissa la data, `:874-899`); nomi in `wedding_partners.first_name`, tema in `weddings.theme_id` (`core.sql:116,135-140`).
- **Esportazione, Guida, Novità.** JSON da `gatherGuests` (`export/data.ts:80-123`); Guida da `docs/functional` + tabella di `README.md` (`guide/source.ts:39-49`); whitelist di "Novità" senza tabelle invitati (`home/data.ts:356`).

## Solution
Nelle forme già in uso: SQL con RLS, RPC con codici stabili, server action, shadcn, proxy unico. Sicurezza e token in **ADR-0003**; qui solo i contratti.

### Dati (migrazione additiva)
- **`guest_groups.rsvp_mode`** `text not null default 'together' check in ('together','separate')`: strutturale (allowlist dell'audit), aggiornata con versione e grant di colonna dal menu del gruppo (BR1, BR3).
- **`rsvp_links`**: `id` uuid (dal server), `wedding_id`, `group_id` *oppure* `guest_id` (`check` esattamente uno), `token_hash bytea` unico di 32 byte, `created_at/by`, `revoked_at/by`, `shared_at/by`, `version`. FK composte `(…, wedding_id)` **on delete cascade** (BR5); indici unici parziali: un link non revocato per gruppo e uno per persona (AC7); audit `audit_row('token_hash')`; RLS select con `guests/read`, grant di select **senza** `token_hash`; scritture solo tramite RPC.
- **`rsvp_link_people`** `(link_id, guest_id)`, cascade su entrambi: fotografia delle persone coperte a "Condiviso", per "Da rimandare" (BR3); RLS select `guests/read`; nessun dato personale, senza audit.
- **`rsvp_responses`**, 1:1 con l'invitato: `id` = id dell'invitato (FK composta → `guests`, cascade), `wedding_id`, `status` (`yes`/`no`), `diet text[]` ⊆ {`vegetarian`,`vegan`,`gluten_free`,`lactose_free`}, `diet_note` ≤ 200, `source` (`guest`/`couple`, da trigger su `auth.uid()`), `answered_at`, `version`. `check (status = 'yes' or (diet = '{}' and diet_note is null))` (BR11); nessuna riga = "In attesa"; audit con `status`, `diet`, `diet_note` **esclusi** (AC14); RLS select `guests/read`, nessun insert/update per `authenticated` (risposta a mano in R-07).
- **`private.rsvp_attempts`**: stessa forma di `login_attempts`, con pulizia propria (ARC-2).
- **`undo_guest_import`** sostituita (stessa firma): prima cancellava ogni importato con `version = 1`; ora salta **solo** chi ha una risposta, un link personale non revocato o compare nella fotografia di un link condiviso (PO-2; la sola copertura del link del gruppo non basta) e restituisce `skipped` per il toast (DES-28).

### Regole in SQL (unica fonte)
- `private.rsvp_expires_on(wedding) → date | null`: data scelta + 30 giorni (BR7).
- `private.rsvp_link_people(link, now) → setof guest`: le persone vive che il link copre *ora*. Vuoto se il link è revocato o scaduto o se il bersaglio non è un destinatario (BR1-BR4). Un link funziona se l'insieme non è vuoto.
- `public.rsvp_status(p_now default null) → jsonb` (DEFINER con controllo `guests/read`, Change log), letto dalla lista: `{expires_on, links:[{id, group_id, guest_id, working, revoked_at, shared_at, created_at}], resend_guest_ids:[…]}`;
  - `resend_guest_ids` = persone nella fotografia di un link condiviso (revocato o no) che ora non le copre, e il cui destinatario attuale non ha un link funzionante.
- `view.ts` (TS puro) ricava i destinatari (regola "senza gruppo" di R-03) e lo stato mostrato, con precedenza: Scaduto → Condiviso il / Da condividere (link funzionante) → Da rimandare → Nessun link.

### RPC per la coppia (`authenticated`, codici P0001 stabili, 42501)
| RPC | Contratto |
|---|---|
| `rsvp_create_links(p_items jsonb)` | `[{link_id, token_hash, group_id \| guest_id}]` ≤ 1000. DEFINER con `guests/write`. Crea solo per destinatari attuali senza link non revocato; gli altri li salta. → `{created:[id]}` |
| `rsvp_rotate_link(p_link_id, p_new_id, p_new_hash)` | Revoca + nuovo link sullo stesso bersaglio, in modo atomico (AC7) |
| `rsvp_revoke_link(p_link_id)` | Revoca (AC7) |
| `rsvp_mark_shared(p_link_id) → {previous}` / `rsvp_unmark_shared(p_link_id, p_previous)` | "Condiviso il" + fotografia; Annulla (AC8, D11) |

### RPC pubbliche (solo `service_role`, DEFINER, `p_now` facoltativo)
- `p_now` **solo** dal server, da `resolveNow()` (`src/lib/clock.ts`), per proxy, pagina, `submitRsvp` e `loadRsvp`; mai dalla richiesta (QA-1).
- `p_ip_key` null (IP assente) = nessun limite per IP; resta quello per link (P5).
- Payload non valido su un link che funziona → `invalid_answers` (P0001), distinto dalla neutra, mai un 500 (QA-8).

| RPC | Contratto |
|---|---|
| `rsvp_gate(p_token_hash, p_ip_key) → {blocked, retry_after_seconds, theme_id}` | STABLE, non scrive (QA-11). Bloccato solo se la chiave IP è bloccata **e** il token non funziona. `theme_id` solo per un link che funziona |
| `rsvp_page(p_token_hash, p_ip_key) → {ok:false}` oppure `{ok:true, couple:[a,b], date, location:{name, comune}, theme_id, people:[{id, first_name, last_name, category, status, diet, diet_note}]}` | Nient'altro: AC3 è verificato in pgTAP sull'insieme delle chiavi. Un token che non funziona registra un fallimento sulla chiave IP (BR9). `date`/`location` sono null finché la decisione non è presa (BR8) |
| `rsvp_submit(p_token_hash, p_ip_key, p_answers jsonb) → {ok:false}` oppure `{ok:false, blocked, retry_after_seconds}` oppure `{ok:true, people:[…], changed_meanwhile:[id]}` | `answers` = `[{id, status, diet, diet_note, seen_at}]` ≤ 100, per **tutte** le persone mostrate: `status` null = nessuna scelta, nessuna scrittura; `seen_at` = `answered_at` visto all'apertura. Ignora gli id fuori dalle persone attuali (AC11). Upsert per persona (vince l'ultimo); scrive solo se il valore cambia (`answered_at`, `version` e audit invariati a un reinvio identico). `changed_meanwhile` = persone il cui `answered_at` prima della scrittura era diverso da `seen_at` (PO-1). `no` azzera le preferenze. L'invio si registra sulla chiave del link **prima** delle scritture, sotto lock di riga: con invii in parallelo non si superano mai le 20 scritture (QA-9) |

### Server (Next.js)
- **`src/features/rsvp/token.ts`**: `deriveRsvpToken(secret, linkId)`, `hashRsvpToken(token)` (letterale `\x…` come `hashInviteToken`), `isRsvpTokenShape`, `rsvpUrl(siteUrl, token)` → `/rsvp/{token}`. Il segreto si legge con `readRsvpLinkSecret()` in `app-config.ts`.
- **`src/features/rsvp/public-rpc.ts`** (server-only, quinto ambito di `admin.ts`): solo `gate`, `page` e `submit`; restituisce codici, mai messaggi Postgres.
- **`src/features/rsvp/limiter.ts`**: `rsvpIpKey(secret, ip)` con contesto `r2y-rsvp:ip:`; IPv6 ridotto al /64; riusa `clientIp`.
- **`src/proxy.ts`** su `/rsvp/{token}`, solo se la forma è valida e il backend risponde:
  - `gate` con timeout di 3 s, fail-open;
  - bloccato → `429` con `Retry-After`, `X-Robots-Tag` e HTML minimo (schema di `email/disattiva/html.ts`): `lang="it"`, viewport, `color-scheme`, CSS inline chiaro/scuro, h1 e testo a 18 px (DES-29);
  - forma non valida o link che non funziona → 404 neutra in HTML (Arbitrato S3);
  - altrimenti imposta l'intestazione di richiesta `x-r2y-theme` (sempre tolta da quelle del client, come `x-r2y-backend`);
  - `/rsvp` in `NO_REFERRER_PREFIXES`; pagina del modulo `same-origin` (D15, Change log).
- **`guards.ts`**: `/rsvp` in `PUBLIC_PREFIXES`. **`themes/server.ts`**: `x-r2y-theme`, se presente e approvato, vince su tutto.
- **Pagina `src/app/(public)/rsvp/[token]/page.tsx`**:
  - `connection()`; neutra all'apertura (404) dal proxy, nella pagina `neutral` → `LinkUnavailable` in 200 (Arbitrato S3); **niente `loading.tsx`**;
  - `metadata` statico: noindex, "Conferma la tua presenza" / "Ci vuole un minuto", nessuna immagine;
  - modulo con `useActionState` su `submitRsvp` (legata al token); con JS aggiunge "Vengono tutti", preferenze che compaiono e contatore (design §1.1);
  - **senza JS** (DES-24, DES-34): riepilogo e modulo in un `<details>` dal server, "Modifica" = `summary`; preferenze sempre visibili; "zero scelte" controllato sul server;
  - **campi controllati** dall'ultimo stato inviato (DES-26); errore di rete da un wrapper `try/catch` in `role="alert"`;
  - `ok:false` durante la compilazione → `unavailable`: `LinkUnavailable` al posto di **tutto** il contenuto (DES-25), 200, uguale per ogni causa (Q-P2);
  - nessuna bozza nel dispositivo (AC11).
- **Lato coppia `src/features/rsvp/actions.ts`**: `createLinks`, `getLinkUrl` (sola lettura: RLS + `guests/write`, ricalcolo e controllo dell'hash), `rotateLink`, `revokeLink`, `markShared`/`unmarkShared`, `setGroupMode` (versionata).
  - Il foglio carica l'URL all'apertura: Copia, Condividi e WhatsApp (`<a href="https://wa.me/?text=…">`) con un solo tocco, anche su iOS (AC1); "Crea link" è un'azione separata.
  - "Condiviso il" solo dopo copia riuscita o condivisione completata (non con `AbortError` o permesso negato, QA-12).
  - "Crea link per tutti (N)" (DES-31, PO-7): N = destinatari senza link funzionante, "Da rimandare" compresi; conferma con N e avviso "data non scelta"; toast "Ho creato N link" senza Annulla; disattivato dopo la scadenza, con spiegazione.
- **Esportazione** (AC13): `gatherGuests` aggiunge `rsvpResponses` e `rsvpLinks` (mai `token_hash`: la colonna non è leggibile).

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Colonne RSVP su `guests` (ARC-6 in F1) | Una riga, un conflitto | Ogni risposta incrementa `guests.version`: conflitto spurio nel modulo R-03, `updated_by` nullo | Risposta a mano in R-07 (D1); la tabella separata non tocca R-03 |
| Destinatario salvato da trigger | Lettura semplice | Trigger su sposta, importa, elimina, ripristina, modalità: facile sbagliare | Calcolo a costo zero sui volumi di R-03 (500) |
| Stato dei link solo in TS | Niente RPC | Due implementazioni (SQL e TS) che possono divergere | Una sola regola SQL |
| Pagina pubblica come Route Handler HTML | Stato HTTP pieno anche sugli invii | Niente componenti, temi e Tailwind; più codice | 429 dal proxy sul GET, messaggio nel modulo all'invio (Q-P2) |
| Tema con `div[data-theme]` annidato | Niente proxy | `data-mode` deve stare sullo stesso elemento: cambierebbe il CSS dei 12 temi | Intestazione dal proxy, nessun lampeggio |

## Impacts
- **Dati e migrazioni.** Due additive: `20261203100000_rsvp.sql` (schema, RLS, RPC coppia, `undo_guest_import`), `20261203200000_rsvp_public.sql` (limitatore, RPC pubbliche). Nessuna colonna rimossa: il codice precedente gira sul nuovo schema (Instant Rollback); indietro solo con una migrazione nuova.
- **Contratti.** Nuove RPC (sopra); `GroupView.rsvpMode`; due chiavi nel JSON di esportazione, CSV invariato (D13).
- **Prestazioni.** Pagina pubblica: 2 RPC per apertura (gate + pagina, o gate + `rsvp_page` nel proxy per un link morto), nessuna libreria di terzi. Invitati: + `rsvp_status` e `rsvp_responses` paginate (≤ 500), < 1 s.
- **Sicurezza.** Quinto ambito della chiave segreta (ADR-0003); round di sicurezza in F3; dati sanitari fuori da audit, log e "Novità".
- **Dipendenze e servizi.** Nessuno.
- **Configurazione.** `RSVP_LINK_SECRET` (≥ 32 caratteri): Vercel Production e Preview con valori diversi, `.env.local`, valore finto in `ci.yml` e `.env.example` (D4).

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Esposizione di dati (altre persone, altro matrimonio) dalla funzione pubblica | M | H | Insieme di chiavi chiuso in pgTAP; casi su più matrimoni; id ricontrollati in `rsvp_submit`; round di sicurezza |
| Regola del destinatario sbagliata in un caso limite (BR1-BR4) | M | M | Una sola funzione SQL; matrice pgTAP del ciclo di vita |
| Il 404 diventa 200 per lo streaming, o il 429 si perde | M | M | Neutra e 429 dal proxy (Arbitrato S3); niente `loading.tsx`; test sugli stati HTTP |
| Copia/Condividi/WhatsApp falliscono su iOS | M | M | URL caricato all'apertura del foglio; `<a href>` per WhatsApp; smoke WebKit + iPhone vero al Gate C |
| "Annulla importazione" cancella chi ha risposto | M | H | `undo_guest_import` sostituita + pgTAP |
| `RSVP_LINK_SECRET` mancante o ruotato | L | M | Errore leggibile nel foglio, pagina pubblica indipendente; controllo dell'hash al ricalcolo; runbook |
| Finestra codice nuovo / schema vecchio dopo il merge | H (minuti) | L | Lista senza stati RSVP (schema `not_migrated` dell'export); pagina pubblica neutra |
| Gate nel proxy rallenta o fallisce | L | L | Timeout di 3 s, fail-open; la pagina decide comunque |

## Steps
| Step | Tasks | What the developer can see or check at the end |
|---|---|---|
| S1 Dati | T1, T2, T3 | `npm run db:reset && npm run db:test` verdi: tabelle, RLS, regole del destinatario, RPC pubbliche e limiti provati in pgTAP; import annullabile senza perdere risposte |
| S2 Server | T4, T5, T6 | Unit e integrazione verdi; `curl` su `/rsvp/<token di prova>`: intestazioni, 404 neutro, 429 dopo 10 token sbagliati; export JSON con le chiavi RSVP |
| S3 Pagina pubblica | T7 | Link di prova del seed locale aperto a 320 px, anche senza JS: risposta, Modifica, neutra, tema del matrimonio |
| S4 Lato coppia | T8, T9 | In Invitati: stati per persona e gruppo, foglio link (crea, copia, WhatsApp, nuovo, revoca, Annulla), modalità del gruppo, "Da rimandare" |
| S5 Prove, documenti, rilascio | T10, T11, T12, T13 | e2e + axe verdi (Chromium + WebKit smoke), documentazione e Guida aggiornate, checklist di rilascio pronta |

## Tasks
| # | Task | Owner | Files (owned) | Depends on | AC |
|---|---|---|---|---|---|
| T1 | Migrazione schema + RPC coppia: tabelle, `rsvp_mode`, audit, RLS e grant, funzioni private, `rsvp_status`, RPC coppia, `undo_guest_import`; pgTAP del modello e dell'RLS; allowlist aggiornate; tipi DB | developer | `supabase/migrations/20261203100000_rsvp.sql`, `supabase/tests/rsvp_model.test.sql`, `supabase/tests/rsvp_rls.test.sql`, `supabase/tests/guests_model.test.sql`, `supabase/tests/guests_import.test.sql`, `supabase/tests/core_schema.test.sql`, `supabase/tests/qa_catalog_matrix.test.sql`, `src/lib/supabase/database.types.ts` | — | AC5, AC7, AC9, AC12, AC14 |
| T2 | Migrazione pubblica: `rsvp_attempts`, `rsvp_gate`, `rsvp_page`, `rsvp_submit` (solo `service_role`); pgTAP (insieme di chiavi, neutre, BR1-BR4, scadenza, invii, limiti); allowlist e tipi | developer | `supabase/migrations/20261203200000_rsvp_public.sql`, `supabase/tests/rsvp_public.test.sql`, + le stesse allowlist e tipi di T1 | T1 | AC3-AC6, AC10-AC12, AC14 |
| T3 | Seed locale: un matrimonio di prova con gruppo "insieme", gruppo "separato", persona senza gruppo, un link con token **finto** documentato (solo locale, BR12) | developer | `supabase/seeds/05_rsvp.sql`, `supabase/config.toml` (se serve l'elenco dei seed) | T1 | — |
| T4 | Token e configurazione: `token.ts` + unit (vettori fissi, forma, URL); `readRsvpLinkSecret`; variabile in `.env.example`, `ci.yml` e `vitest.config.ts` (valore finto, 32+ caratteri, QA-6) | developer | `src/features/rsvp/token.ts`, `src/features/rsvp/token.test.ts`, `src/lib/app-config.ts`, `src/lib/app-config.test.ts`, `.env.example`, `.github/workflows/ci.yml`, `vitest.config.ts` | — | AC1, AC2 |
| T5 | Bordo pubblico: `public-rpc.ts`, `limiter.ts` (+ unit /64), pagina 429; proxy (gate, 429, `x-r2y-theme`, no-referrer), guardie, tema; quinto ambito in ESLint e nel commento di `admin.ts`; lint fixture; `p_now` da `resolveNow()` sul cookie della richiesta (+ unit: ignorato senza `E2E_CLOCK` o con `VERCEL`); `x-r2y-theme`/`x-r2y-backend` del client ignorati | developer | `src/features/rsvp/public-rpc.ts`, `src/features/rsvp/limiter.ts`, `src/features/rsvp/limiter.test.ts`, `src/features/rsvp/blocked-html.ts`, `src/features/rsvp/neutral-html.ts` (+ test), `src/proxy.ts`, `src/features/auth/guards.ts`, `src/themes/server.ts`, `eslint.config.mjs`, `src/lib/supabase/admin.ts`, `tests/lint-fixtures/*` (nuovi) | T2, T4 | AC2, AC6, AC10 |
| T6 | Lato coppia, dati e azioni: `data.ts` (`loadRsvp`, degrado se non migrato), `view.ts` (destinatari, stato del link, riepilogo "2 sì · 1 in attesa", testo WhatsApp con al massimo 3 nomi) + unit; `actions.ts`; `rsvpMode` in `guests/data.ts`; `skipped` di `undo_guest_import` nell'azione d'importazione; esportazione JSON + test; `now` da `resolveNow()` | developer | `src/features/rsvp/data.ts`, `src/features/rsvp/view.ts`, `src/features/rsvp/view.test.ts`, `src/features/rsvp/actions.ts`, `src/features/guests/data.ts`, `src/features/guests/import-actions.ts`, `src/features/guests/import-actions.test.ts`, `src/features/export/data.ts`, `src/features/export/data.test.ts`, `tests/integration/rsvp.actions.test.ts` | T1, T4 | AC1, AC7-AC9, AC12, AC13 |
| T7 | Pagina pubblica: route, `not-found`, `RsvpShell`, `RsvpForm`, `RsvpPersonCard`, `RsvpSummary`, `LinkUnavailable`; server action `submitRsvp` (legata al token, `now` da `resolveNow()`, nessun log di valori); `<details>` senza JS, campi controllati, errore di rete, vista `unavailable` (DES-24..26); testo della pagina di servizio adatto anche agli invitati (AC6) | developer | `src/app/(public)/rsvp/[token]/page.tsx`, `src/app/(public)/rsvp/[token]/not-found.tsx` (da eliminare, Arbitrato S3), `src/features/rsvp/public/*`, `src/features/rsvp/public-actions.ts`, `src/components/ServiceDownPage.tsx` | T5 | AC2-AC6, AC11 |
| T8 | Foglio "Link di {destinatario}" e dialoghi: crea, copia, condividi, WhatsApp, nuovo, revoca, Annulla di "Condiviso", avviso "data non scelta", "Scade il", conferma della modalità del gruppo | developer | `src/features/rsvp/LinkSheet.tsx`, `src/features/rsvp/GroupModeDialog.tsx`, `src/features/rsvp/components.test.tsx` | T6 | AC1, AC7, AC12 |
| T9 | Integrazione in Invitati: stato per persona (testo + icona), riepilogo del gruppo, stato del link e "Invia" sul titolo del gruppo **e sulla seconda riga dei destinatari individuali** (DES-27), "Crea link per tutti (N)" in Altro, "Come rispondono" nel menu del gruppo, presenza in sola lettura nel foglio persona, toast "N restano" dopo Annulla importazione (DES-28); caricamento nella pagina | developer | `src/features/guests/GuestsScreen.tsx`, `GroupHeader.tsx`, `GuestRow.tsx` (`rowColumns`), `row-columns.test.ts`, `GuestSheet.tsx`, `ImportSheet.tsx`, `src/app/(app)/invitati/page.tsx`, `src/features/guests/components.test.tsx` | T6, T8 | AC1, AC8, AC9 |
| T10 | Test di accettazione e integrazione QA (vedi Test plan): PostgREST, bordo HTTP, neutra normalizzata, 429, concorrenza, log, "Novità". Helper: IP sintetico per test (`x-forwarded-for`) e pulizia di `private.rsvp_attempts` (QA-2) | qa-engineer | `tests/acceptance/rsvp.test.ts`, `tests/acceptance/rsvp.concurrency.test.ts`, `tests/acceptance/support/*` (aggiunte), `tests/integration/rsvp.logs.test.ts`, `tests/integration/home.data.test.ts` | T2, T5, T7 | AC2, AC6, AC10, AC11, AC14 |
| T11 | e2e (vedi Test plan), con il seed e2e che usa solo `token.ts` e `rsvp_create_links`, mai il token del seed locale (QA-6); `webServer.stdout` intercettato per cercare il token di prova | qa-engineer | `e2e/rsvp.public.spec.ts`, `e2e/rsvp.invitati.spec.ts`, `e2e/rsvp.time.spec.ts` (progetto `time`, seriale), `e2e/support/seed.ts`, `e2e/a11y.spec.ts`, `e2e/cross-browser.spec.ts`, `playwright.config.ts` | T7, T9 | AC1-AC14 |
| T12 | Documentazione (vedi piano) | technical-writer | `docs/functional/*`, `docs/technical/*`, `docs/adr/0002-…`, `docs/adr/0003-…` | T9 | — |
| T13 | Checklist di rilascio: variabile d'ambiente, migrate, controlli post-deploy, rollback; verifica che `05_rsvp.sql` non giri mai su staging o produzione (QA-17) | release-manager | `docs/technical/ambienti-e-rilascio.md` (sezioni di rilascio; T12 ne cura il resto, in sequenza dopo T12) | T12 | — |

**In parallelo:** T3 dopo T1, con T2; T4 subito; T5 e T6 dopo T1, T2, T4. T7 (dopo T5) in parallelo con T8 → T9. T10 dopo T2 e T5; T11 alla fine. T2 dopo T1 per le allowlist e `database.types.ts` condivise.

## Test plan
| Level | What | Cases (incl. edge cases) | AC covered | Owner |
|---|---|---|---|---|
| pgTAP | Modello e RLS (`rsvp_model`, `rsvp_rls`, allowlist) | Check: uno tra gruppo e persona, preferenze solo con Sì, testo ≤ 200, valori ammessi; un solo link non revocato per bersaglio; cancellazioni a cascata (guest, group, svuota); `audit_log` senza `status`/`diet`/`diet_note`/`token_hash`; `token_hash` non selezionabile; `anon`, family/planner e altro matrimonio negati; `undo_guest_import`: salta risposta, link personale e fotografia, **non** la sola copertura del gruppo; `skipped` corretto | AC7, AC14, BR5 | developer |
| pgTAP | **Matrice del ciclo di vita** (QA-3, tabellare come `qa_catalog_matrix`) | Per riga: azione → valori attesi di `working`, destinatario, `resend_guest_ids`, pagina ok/neutra. Gruppo insieme/separato × link di gruppo/personale × {entra, esce, cambio modalità nei due sensi, elimina e ripristina gruppo, elimina e ripristina persona, elimina definitivamente persona e gruppo, importa e annulla, revoca, nuovo link, scadenza, data riaperta, data cambiata}. In più: gruppo senza membri vivi → neutra; persona coperta da un solo link dopo due gruppi; revoca + nuovo link non condiviso → "Da condividere"; nuovo link → vecchio revocato, risposte conservate; link dormiente riattivato (gruppo e personale); stessi nomi e chiavi in due matrimoni, senza incroci | AC5, AC7, AC9, AC12, BR1-BR5 | developer |
| pgTAP | RPC pubbliche (`rsvp_public`) | Insieme **esatto** delle chiavi; data/location solo se prese. Scadenza: +30 alle 23:59:59 funziona, +31 alle 00:00 neutra (Europe/Rome), su date che attraversano il cambio d'ora (2027-03-10, 2027-10-05); data riaperta → nessuna scadenza. Validazione di `rsvp_submit` (QA-8): 100 ok/101 rifiutate, array vuoto, JSON non array, id duplicati (vince l'ultimo), stato o preferenza non ammessi, preferenze duplicate, nota di 200/201 caratteri e di soli spazi, preferenze con No (azzerate), `<script>`, emoji → `invalid_answers` (NUL è rifiutato dal parsing jsonb prima della RPC: coperto da `public-rpc.ts` e da T10, REV-2); `create_links` > 1000. `changed_meanwhile`; reinvio identico senza cambio di `answered_at`/`version`/audit. Limiti: con lo stesso IP il 10° errore è 404 e l'11° è bloccato, un token valido non è bloccato, IP null senza limite; 21° invio bloccato. `rsvp_gate` non scrive. Grant solo `service_role` | AC3-AC6, AC10-AC12, AC14 | developer |
| Unit | `token.ts`, `limiter.ts`, `view.ts`, `app-config`, clock | Vettori fissi; 32 byte decodificati; 1000 id → 1000 token distinti; segreto o id diversi → token diverso; `hashRsvpToken` uguale al `digest` pgTAP; forme malformate scartate senza DB (QA-15); IPv6 /64, IP assente; precedenza dei 4 stati, Scaduto prima di tutto; destinatari con gruppo eliminato o "separato"; "2 sì · 1 in attesa"; saluto WhatsApp con 1, 3, 4 persone e caratteri codificati; segreto mancante o corto; `resolveNow` ignorato senza `E2E_CLOCK` o con `VERCEL` | AC1, AC2, AC8, AC9, AC12 | developer |
| Integration | Azioni coppia ed esportazione | Senza `guests/write` → `forbidden`; URL ricalcolato = link salvato, hash diverso → "va rigenerato"; Annulla di "Condiviso" ripristina `shared_at` e fotografia; `setGroupMode` con conflitto; export con `rsvpResponses`/`rsvpLinks`; nel JSON serializzato nessun token, nessun hash a 64 caratteri esadecimali, nessun segreto; export anche con `not_migrated` (QA-16) | AC1, AC7, AC8, AC13 | developer |
| Integration (QA) | Log e "Novità" (QA-7, QA-10) | `public-rpc.ts`/`submitRsvp` con un errore Postgres che contiene hash e nota → `console` senza token, hash, nota, stato o id, e al browser solo codici; "Novità" senza righe `rsvp_*` dopo risposte e link | AC14 | qa-engineer |
| Acceptance (HTTP) | Bordo pubblico (IP sintetico per test, pulizia di `rsvp_attempts`) | Neutra (QA-4, Arbitrato S3): stato, corpo e intestazioni (`Cache-Control`, `X-Robots-Tag`, `Referrer-Policy`, `Content-Type`) identici per le 5 cause; nessuna traccia del tema del matrimonio né di `x-r2y-theme`; invio su link revocato, scaduto o sconosciuto → stesso contenuto neutro per tutte le cause. 429: `Retry-After` in (0, 900], sblocco spostando la riga (schema `login-neutral.test.ts`). OG statico, meta noindex. "Aprire non modifica" (QA-11): conteggi e `max(updated_at)` di `rsvp_responses`, `rsvp_links`, `guests`, `audit_log` invariati dopo GET valido e non valido. Cookie dell'orologio ignorato da un server senza `E2E_CLOCK`. Nessun accesso PostgREST | AC2, AC6, AC10, AC14 | qa-engineer |
| Acceptance | Concorrenza (QA-9) | N `rsvp_submit` paralleli sulla stessa persona → una riga, vince l'ultimo, nessun errore; 25 invii paralleli → al massimo 20 scritture | AC11 | qa-engineer |
| E2E | Pagina pubblica | 320 px e desktop; un solo spec senza JS (invio, riga "zero scelte", Modifica con `<details>`); gruppo di 4 con bambino e neonato, "Vengono tutti", invio parziale, contatore; conferma, Modifica, riapertura; due schede → "erano già cambiate"; revoca durante la compilazione → vista neutra completa; offline (`setOffline`) → scelte conservate + avviso; partner con sessione vede la pagina pubblica col tema del matrimonio (QA-14); nessuna richiesta a terzi. Scadenza in `rsvp.time.spec.ts` | AC2-AC6, AC11, AC12 | qa-engineer |
| E2E | Lato coppia (solo ciò che pgTAP non prova, QA-13) | Crea link, Copia (Chromium con permessi clipboard), `href` WhatsApp, Condividi annullato o copia negata → nessun "Condiviso il", Annulla; URL aggiornato dopo un nuovo link; Nuovo/Revoca → neutra; "Crea link per tutti (N)"; sposta → "Da rimandare"; elimina/ripristina; elimina definitivamente; sola lettura; Annulla importazione con "N restano"; nota con `<script>` mostrata come testo | AC1, AC7-AC9, AC13 | qa-engineer |
| E2E | axe | Modulo, riepilogo, neutra, 429 × chiaro/scuro, tema predefinito + un altro tema (matrice dei 12 temi solo se `themes.spec.ts` non copre già i contrasti) | AC2, AC6, AC10 | qa-engineer |
| E2E / browser | Smoke WebKit (CI, 2 test) | Apertura della pagina pubblica e invio; foglio link senza errori (la clipboard si prova solo su dispositivo vero) | AC1, AC2 | qa-engineer |
| Manuale (Gate C) | Dispositivi veri | Link aperto da WhatsApp su iOS e su Android (browser interno), Safari; Condividi da iPhone | AC1, AC2 | developer |

## Documentation plan
| Type | Destination | What changes |
|---|---|---|
| Functional | `docs/functional/conferme-di-presenza.md` (nuova, + riga in `README.md`) | Cosa vede l'invitato; creare e condividere i link; WhatsApp e nota privacy (DES-36); stati del link; modalità del gruppo ("ognuno per sé" = un foglio per persona, DES-35); Da rimandare; **solo** scadenza dei link (data + 30, PO-7); privacy |
| Functional | `invitati.md`, `esportazione.md`, `servizio-in-pausa.md` | Stati nella lista; Annulla importazione lascia chi ha risposto o ha un link; elimina definitivamente un gruppo = via link e fotografia (P6); chiavi del JSON; testo per gli invitati |
| Technical | `modello-dati.md` | Tabelle `rsvp_*`, `rsvp_mode`, RPC, matrice delle scritture, allowlist |
| Technical | `sicurezza.md` | "Pagina pubblica RSVP": token derivato, quinto ambito della chiave segreta, limiti (IP affidabile solo dietro Vercel, falsificabile in locale e nei test, QA-2), 404/429, residuo dei log e REV-104 (rimando ad ADR-0003) |
| Technical | `architettura.md`, `sviluppo-locale-e-test.md` | Passo RSVP nel proxy, intestazione del tema; link di prova del seed, segreto di test, orologio |
| Technical | `ambienti-e-rilascio.md` | `RSVP_LINK_SECRET` (rotazione ≠ invalidazione, runbook di revoca totale), controlli post-deploy (T13) |
| ADR | `0003-link-rsvp-token-derivato-accesso-pubblico.md` | Proposed (F2) → accepted al Gate B; riga referrer (D15) |
| ADR | `0002-dati-personali-invitati.md` | In "Follow-up": "R-04: vedi ADR-0003 (token derivato, accesso pubblico)" |

## Release plan
- **Percorso**: PR → preview Vercel (staging, senza le migrazioni di R-04, come D-A di R-03) → merge su main = **produzione** (`merge_deploys_production: true`).
- **Prima del merge (sviluppatore, guidato dal release-manager):** `RSVP_LINK_SECRET` in Vercel, *Sensitive*, Production e Preview con valori diversi generati in locale (es. `openssl rand -base64 48`), mai in chat o nei file; il release-manager verifica solo il nome nei due ambienti prima di approvare.
- **Ordine al merge**: deploy di Vercel e `migrate.yml` in parallelo (`migrate` con approvazione); per qualche minuto la lista è senza stati RSVP e la pagina pubblica dà la neutra (nessun link esiste).
- **Feature flag**: nessuno; finché la coppia non crea link, la superficie pubblica non dà nulla.
- **Rollback**:
  - codice: Instant Rollback di Vercel (lo schema additivo resta compatibile);
  - schema: si corregge con una migrazione nuova;
  - fuga del segreto: ruotare `RSVP_LINK_SECRET` e revocare tutti i link attivi (runbook in `ambienti-e-rilascio.md`), poi "Crea link per tutti".
- **Controlli post-deploy**, con un invitato finto `@example.test`, da cancellare alla fine:
  1. `migrate` verde sulle due migrazioni.
  2. Creare il link, aprirlo in incognito e da WhatsApp sul telefono, rispondere; la lista mostra lo stato.
  3. Revoca → pagina neutra 404.
  4. `curl -I`: `X-Robots-Tag`, `Referrer-Policy`, `Cache-Control`.
  5. `audit_log` di `rsvp_responses` senza `status`/`diet`.
  6. JSON esportato senza `token_hash`.
  7. "Elimina definitivamente" → risposta e link spariti.

## Decisions
| # | Decision | By | Date |
|---|---|---|---|
| P1 | Risposte in `rsvp_responses` (1:1), non su `guests` (sostituisce la nota ARC-6) | architect | 2026-11-26 |
| P2 | Destinatario e funzionamento del link calcolati da una sola funzione SQL; "Da rimandare" dalla fotografia `rsvp_link_people` | architect | 2026-11-26 |
| P3 | 429 dal proxy sul GET; il tema arriva dal proxy (`x-r2y-theme`); `public-rpc.ts` quinto ambito di `admin.ts` (ADR-0003) | architect | 2026-11-26 |
| P4 | Precisazione di D4: ruotare il segreto non invalida i link già condivisi (il DB confronta lo sha256); per invalidarli si revocano (runbook) | architect | 2026-11-26 |
| P5 | IP assente = nessun limite per IP, resta quello per link (QA-Q4): un contenitore comune bloccherebbe tutti, come nel login (R27(b)) | architect | 2026-11-26 |
| P6 | Eliminare definitivamente un gruppo cancella il suo link e la fotografia: i membri passano a "Nessun link", non a "Da rimandare" (QA-Q3). È coerente con ADR-0002 §2 ("elimina definitivamente" = dimenticare); il caso è fissato nella matrice | architect | 2026-11-26 |
| P7 | AC11 "erano già cambiate" = la scelta è salvata comunque; la frase segnala chi era stato cambiato da altri dopo l'apertura della pagina (`seen_at` → `changed_meanwhile`, PO-1) | architect, PO | 2026-11-26 |

### Modifiche agli AC (Q-P1..Q-P3, QA-Q1, QA-Q2; accettate da PO, designer e QA)
AC3 (id opaco e categoria per persona), AC6 (all'apertura sempre 404; all'invio neutra in 200), AC10 (429 all'apertura, messaggio nel modulo all'invio), AC12 (testi della scadenza, nessuna creazione dopo, link che tornano a funzionare): approvate al Gate B, testo in `brief.md`. QA-Q3 e QA-Q4 sono P6 e P5.

### Arbitrato S3: 404 senza JS (architect, 2026-11-27)
- **Causa.** `not-found.tsx` è un error boundary client, non eseguito in SSR: `notFound()` dà 404 con `<html id="__next_error__">` e `<body>` vuoto (`error-boundary.js:18,36`; `app-render.js:2507-2510,1324-1330`; riprodotto con `next start`). Stesso effetto dopo un invio senza JS su link morto.
- **Decisione: la neutra all'apertura la risponde il proxy**, come il 429:
  - forma non valida o escape rotto → 404 neutra, senza DB;
  - gate non bloccato e `themeId === null` (link morto; `weddings.theme_id` è `not null`) → `rsvpLoadPage` (conta l'errore, BR9) → `neutral` → 404 neutra; `ok`, `retry` o gate `null` → pagina;
  - `neutralHtml()` in `neutral-html.ts` (schema di `blocked-html.ts`, senza script): stringa costante, byte identici per ogni causa, intestazioni del 429 senza `Retry-After`; esporta i testi usati da `LinkUnavailable`;
  - la pagina non chiama più `notFound()`: `neutral` → `RsvpShell` + `LinkUnavailable` in 200 (gate scaduto o invio senza JS; AC6).
- **Residuo.** Gate scaduto (3 s) e pagina viva: link morto in 200 con la neutra (`noindex` resta). Aspetto = 429 (DES-29).
- **Scartata.** Rewrite a URL senza rotta + `app/not-found.tsx` radice: cambia il 404 dell'app (`not-found.md:138`).
- **File.** T5: `src/proxy.ts`, `neutral-html.ts` + test (nuovi). Poi T7: `page.tsx`, `LinkUnavailable.tsx`, elimina `not-found.tsx`.
- **Test.** T10: 5 cause + forma non valida → 404, corpo identico byte per byte, senza `<script>` né `__next_error__`; un incremento di `rsvp_attempts` per apertura. T11: senza JS, link morto e invio su link revocato mostrano il testo.

## Risposte alle obiezioni F2
Tutte accolte (QA 17, designer 13, PO 7; riepilogo in `log.md`), integrate nelle sezioni sopra coi loro codici. QA-15: una variante ben formata (es. maiuscole) è un token sconosciuto, va al DB e conta; senza DB si scartano solo le forme non valide; slash finale = redirect 308.

## Change log
| Date | Change | Why | Approved by |
|---|---|---|---|
| 2026-11-26 | Round 1 di F2: contratto di `rsvp_submit` (`seen_at`, `invalid_answers`), `undo_guest_import` più stretta, orologio, matrice, file aggiunti a T4/T6/T9/T10/T11 | Obiezioni QA, designer, PO | — (Gate B) |
| 2026-11-26 | T1: + `qa_cross_wedding.test.sql`, `rsvp_lifecycle.test.sql` (matrice), `tests/acceptance/support/matrix.ts` se serve; `rsvp_status` e RPC coppia DEFINER con controllo `guests/read`; `unique (id, wedding_id)` su `guests`; `created_*/updated_*` sulle tabelle RSVP; `mark_shared` unisce la fotografia | Oracoli per tabella; niente USAGE su `private`; FK composte; trigger audit/versione | coordinatore (perimetro Gate B) |
| 2026-11-26 | Revisione S1: create/rotate rifiutano dopo la scadenza (Q2); NUL in `public-rpc.ts` + T10 (REV-2); nota vuota → null in T7 (Q1); REV-104 residuo accettato, in `sicurezza.md` (T12) | code-1, code-2 | coordinatore |
| 2026-11-27 | T6: + `src/domain/export/types.ts`, `build.ts`, `export.test.ts` | `buildExportJson` elenca le chiavi in modo esplicito | coordinatore |
| 2026-11-27 | RPC `rsvp_link_matches(p_link_id, p_hash)` (DEFINER, `guests/write`) nella migrazione di T1, fatta da T6; `GroupView.rsvpMode` facoltativo (T9 può renderlo obbligatorio) | `token_hash` non leggibile: serve per "va rigenerato" | coordinatore |
| 2026-11-27 | Arbitrato S3 (sopra) | 404 col corpo vuoto senza JS (DES-24, DES-34) | architect (arbitrato) |
| 2026-11-27 | T7: `retry` = errore nel modulo, scelte conservate (non `unavailable`); input nativi, non Radix; niente `aria-expanded` sul Sì; nota > 200 e NUL scartati in locale; titolo `absolute`. Revisione S3: T7 tocca anche `proxy.ts`, `neutral-html.ts`, `public-rpc.ts` (proiezione chiavi AC3, REV-117) | `retry` è transitorio; Radix non invia senza JS; REV-23, code-6 | coordinatore |
| 2026-11-27 | `Referrer-Policy: same-origin` sulla pagina del modulo (proxy + meta di `RsvpShell`); neutra e 429 `no-referrer`; T10 controlla per tipo di pagina, T11 invia senza JS; T12 aggiorna ADR-0003 | DES-37: con `no-referrer` l'invio senza JS dà 500 (`Origin: null`) | sviluppatore (brief D15) |
| 2026-11-28 | T8: "Copia link" copia solo l'URL (il messaggio va con Condividi/WhatsApp); modalità del gruppo = conferma del passaggio all'altra modalità, non scelta a due opzioni; il tocco su WhatsApp segna "Condiviso il". T9: + `src/features/guests/GuestList.tsx` (costruisce le props di `GuestRow`/`GroupHeader`) e `src/features/rsvp/CreateAllDialog.tsx`; avviso "data non scelta" solo sulla data (nessun segnale della location nello snapshot) | Etichetta "link"; testo delle conseguenze copre i due sensi; unico punto in cui nascono le props della lista | coordinatore |

## Outcome
Stato prima del merge (F5, in attesa di Gate C).

**Costruito, per step**
- S1 Dati: migrazioni `20261203100000_rsvp.sql` e `20261203200000_rsvp_public.sql` (tabelle `rsvp_*`, `rsvp_mode`, RPC coppia e pubbliche, `undo_guest_import` più stretta), seed locale.
- S2 Server: token derivato (`token.ts`), `public-rpc.ts` (quinto ambito della chiave segreta), limitatore, proxy (gate, 429, tema), esportazione JSON con le chiavi RSVP.
- S3 Pagina pubblica `/rsvp/[token]`: modulo con e senza JS, neutra 404 dal proxy (Arbitrato S3), `same-origin` sul modulo (D15).
- S4 Lato coppia: stati in Invitati, foglio link (crea, copia, condividi, WhatsApp, nuovo, revoca, Annulla), modalità del gruppo, "Crea link per tutti", "Da rimandare".
- S5 Prove, documenti, rilascio: acceptance, e2e, docs, checklist di rilascio.

**Test (ultimo `adf verify --with-e2e`, contenuto 63170e5888b7)**: unit 1523, e2e 364 pass / 1 skip (WebKit smoke compreso), pgTAP 1785, integrazione 952 pass / 2 skip, lint, typecheck e build verdi. Revisioni code-1..10, security e design-1..3 chiuse.

**Documenti**: `docs/functional/conferme-di-presenza.md`, `docs/technical/sicurezza.md`, `ambienti-e-rilascio.md`, ADR-0002 e ADR-0003.

**Follow-up**: cancellazione massiva dei link (R-07); DES-63 nomi lunghi di gruppo/tavolo a 768 px (R-03); ordine del saluto WhatsApp a parità di cognome; DES-62 padding; DES-54 (Annulla del toast a 24 px) e focus di `ConfirmDialog` in sessione separata; QA-24 (comando e2e in `.adf/project.md`, serve il sì dello sviluppatore).

**In sospeso**: Gate C; prove su dispositivi veri (link da WhatsApp su iOS e Android, Safari, Condividi da iPhone); `RSVP_LINK_SECRET` in Vercel (Production e Preview, valori diversi) prima del merge; controlli post-deploy 1-7.
