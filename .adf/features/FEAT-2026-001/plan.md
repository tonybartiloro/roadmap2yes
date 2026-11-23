# FEAT-2026-001 — R1 Fondamenta, onboarding guidato, Percorso e budget: piano di implementazione

<!-- Owner: architect. Approved at Gate B. Updated through the change log if the solution changes. -->

| Brief | Design | Size | Status |
|---|---|---|---|
| brief.md (approvato 2026-11-23, 52 AC attivi) | design.md (bozza F1 round 2) | L | draft (F2) |

Identificatori di codice, tabelle e funzioni in inglese; testi, documentazione e interfaccia in italiano. ADR collegato: `docs/adr/0001-stack-auth-ambienti.md`.

## Current state
- Greenfield: il repository contiene solo `README.md`, `.gitignore` (già esclude `.env`, `.env*.local`, `.next/`, `coverage/`, `playwright-report/`, `test-results/`) e `.adf/` (`git log`: 8 commit, tutti di documentazione ADF). Non esistono né `package.json` né `docs/`.
- `.adf/project.md`: `commands` tutti vuoti, `docker: false`, deploy = preview Vercel per PR, merge su main = produzione (`merge_deploys_production: true`), comandi di produzione protetti `vercel --prod`, `vercel deploy --prod`, `vercel promote`.
- Toolchain locale verificata: Node v24.21.0 e npm presenti, Docker presente (`~/.docker/bin/docker`); pnpm e Supabase CLI assenti (la CLI entrerà come devDependency npm, senza installazioni globali).
- Vincoli approvati: brief D1–D28 e risposte in `log.md` (solo Supabase per dati/auth/storage, Resend come unico fornitore email dal dominio della coppia non ancora acquistato, sviluppo interamente locale con Docker, invito solo su invito, un progetto Vercel con Preview → Supabase staging).

## Solution

### 1. Architettura in sintesi
- **Next.js (App Router, ultima 16.x stabile) + React 19 + TypeScript strict**, ospitato su Vercel Hobby. È il progetto unico per UI, server actions, route handler (accesso, invito, cron, disattivazione email) e header di sicurezza.
- **Supabase** (Postgres + Auth) è l'unico backend. **RLS è l'unico confine di autorizzazione.** Ogni lettura e scrittura dell'utente passa con il suo JWT tramite `@supabase/ssr`, da server component, server action o client. La chiave segreta Supabase (`sb_secret_…`, ex service role) esiste solo in `src/lib/supabase/admin.ts`, marcato `server-only`, e serve esattamente a 3 percorsi server:
  1. la creazione dell'utente Auth per un'email autorizzata al momento della richiesta di accesso;
  2. il job giornaliero;
  3. la disattivazione delle email da link firmato.
- **Pattern applicativo**:
  - I server component leggono, con rendering dinamico. Nessuna `'use cache'`, `unstable_cache` o cache condivisa sui dati utente: una regola ESLint/grep in CI lo vieta nelle cartelle dell'app autenticata.
  - Le server action scrivono, con validazione zod al confine.
  - Il client usa `useOptimistic` + `revalidatePath` per l'aggiornamento ottimistico con rollback.
  - Le transizioni di stato con invarianti (scelta e riapertura di una decisione, accettazione dell'invito, conclusione dell'onboarding) sono **funzioni Postgres (RPC)** atomiche. Il resto è CRUD diretto protetto da RLS.
- **Logica di dominio in funzioni TypeScript pure**, in `src/domain/*`, senza I/O e testate con Vitest: motore del Percorso, riferimento di scenario, raggruppamento in fasi, suggerimenti, totali budget, "Prossimo passo", pianificazione promemoria, export, testi delle "Novità".
- **Regione**: entrambi i progetti Supabase in `eu-central-1` (Francoforte) e funzioni Vercel in `fra1`. Serve per la latenza (LCP < 3 s) e tiene i dati in UE. Da impostare alla creazione: con la regione USA predefinita di Vercel ogni query costerebbe circa 90 ms in più.

### 2. Struttura del repository (proprietà dei file nei task)
```
src/
  app/
    layout.tsx                    # html lang="it", data-theme dal matrimonio (SSR), script modo chiaro/scuro, metadata noindex
    robots.ts, manifest.ts, globals.css, themes.css (generato)
    (public)/accesso/…            # login: email → "Controlla la posta" + codice
    (public)/auth/conferma/…      # pagina con pulsante + POST verifyOtp(token_hash)
    (public)/invito/[token]/…     # atterraggio invito
    (public)/su-invito/…          # "Questo spazio è su invito"
    (public)/email/disattiva/…    # opt-out da link firmato
    onboarding/…                  # passi 1–8
    (app)/layout.tsx              # AppNav (barra inferiore / sidebar)
    (app)/page.tsx                # Home
    (app)/percorso/… (app)/scelte/… (app)/budget/… (app)/altro/…
    api/cron/daily/route.ts       # heartbeat + promemoria + riepilogo
  proxy.ts                        # (Next 16; ex middleware) refresh sessione + redirect non autenticati
  lib/supabase/{server,client,admin,versioned-update}.ts, database.types.ts (generato)
  lib/email/{types,index,smtp,resend,unsubscribe-token}.ts, lib/email/templates/*.ts
  lib/dates/plain-date.ts, lib/money.ts, lib/clock.ts
  domain/timeline/*, domain/budget/*, domain/home/*, domain/reminders/*, domain/export/*, domain/news/*
  content/milestones/{schema,it}.ts, content/budget-categories.ts
  themes/{catalogue,approved,contrast}.ts
  components/ui/* (shadcn), components/* (condivisi: AppNav, EmptyState, ErrorState, OfflineBanner, ConflictDialog…)
  features/{auth,onboarding,timeline,decisions,budget,home,settings,export}/*  # componenti + server action per area
supabase/
  config.toml, migrations/*.sql, seeds/NN_*.sql, templates/*.html, tests/*.test.sql
tests/integration/*.test.ts      # Vitest contro lo stack Supabase locale
tests/fixtures/date-offset-vectors.json
e2e/*.spec.ts, e2e/support/*
scripts/gen-themes-css.ts
.github/workflows/{ci,migrate,keepalive}.yml
vercel.json                       # cron
docs/{functional,technical,adr}/*
```

### 3. Modello dati (migrazioni additive, schema `public` esposto con RLS su tutto, schema `private` non esposto)

**Convenzioni comuni**
- Ogni tabella di dominio ha `wedding_id uuid not null` (AC11).
- Le tabelle modificabili hanno `version int not null default 1`, `created_at`, `created_by`, `updated_at` e `updated_by`, gestiti dal trigger `private.bump_version()` (BEFORE UPDATE: `version+1`, `updated_at=now()`, `updated_by=auth.uid()`).
- Gli importi sono `bigint` in centesimi con `check (… >= 0)` (AC38).
- Le date di calendario sono `date`, senza orario (BR2).
- Gli enum sono `text` con `check`. Aggiungere valori richiede solo una migrazione additiva; per i tipi di decisione non serve nemmeno quella (vedi `decisions`).

**Identità, spazio, ruoli** (migrazione core, T2)

| Tabella | Colonne chiave | Note |
|---|---|---|
| `weddings` | `id`, `rite` (`civile`/`cattolico_civile`/`simbolico`/null = "non lo so"), `guest_band` (`fino_50`/`50_80`/`80_120`/`oltre_120`/null), `style_label`, `style_note`, `region`, `comune`, `theme_id text default 'giardino'`, `onboarding_answers jsonb` (bozza dei passi, AC12), `onboarding_unknown text[]` (passi "Non lo so ancora", AC13), `onboarding_completed_at`, `manual_reference_option_id uuid null`, `applied_reference_date date null`, versione | Un matrimonio = uno spazio. |
| `wedding_partners` | `wedding_id`, `slot` (`A`/`B`), `label`, `first_name`, `last_name`, `email citext`, `user_id uuid null` | Partner generici A/B (AC46). **Nessuna data di nascita** (D26). `unique(wedding_id, slot)`. |
| `memberships` | `wedding_id`, `user_id`, `role` (`partner`/`family`/`planner`), `partner_slot` (`A`/`B`/null) | PK `(wedding_id, user_id)`, quindi un utente può appartenere a più matrimoni (AC11). `check ((role='partner') = (partner_slot is not null))` + `unique(wedding_id, partner_slot)`: **al massimo 2 partner, garantito da un vincolo anche con accettazioni simultanee** (AC6, BR12), senza lock applicativi. |
| `private.role_permissions` | `role`, `area`, `action` (`read`/`write`) | Aree: `wedding`, `invitations`, `decisions`, `tasks`, `budget`, `history`, `export`. In R1 solo `partner` ha righe (tutto read+write). Abilitare in futuro famiglia o planner = inserire righe qui, nessuna policy da riscrivere (AC11, ruoli futuri). |
| `private.founder_allowlist` | `email citext pk`, `consumed_at`, `wedding_id` | Email del primo partner, inserita dallo sviluppatore con una riga SQL nel pannello Supabase. **Mai nel repo** (AC3, BR12). |
| `invitations` | `wedding_id`, `slot='B'`, `email citext`, `token_hash bytea unique`, `expires_at`, `revoked_at`, `accepted_at`, `accepted_by`, `last_sent_at`, `send_count` | Indice unico parziale: un solo invito pendente per matrimonio. `token_hash` è escluso dalla SELECT con privilegi di colonna. |
| `user_wedding_state` | `user_id`, `wedding_id`, `last_seen_at`, `previous_seen_at`, `last_export_at` | Per "Novità dall'ultimo accesso" (AC41) e "ultimo export" (AC42). RLS: solo la propria riga. |
| `audit_log` | `id bigserial`, `wedding_id`, `table_name`, `record_id`, `action`, `actor_id`, `at`, `old jsonb`, `new jsonb` | Scritto **solo** dal trigger generico `private.audit_capture()` (SECURITY DEFINER) attaccato a ogni tabella di dominio. RLS: SELECT per l'area `history`; nessun grant di insert/update/delete (BR14). |
| `heartbeats` | `id`, `source` (`vercel_cron`/`github`), `ran_at`, `details jsonb` (solo conteggi) | Nessuna policy client. La funzione `public.last_heartbeat()` restituisce solo il timestamp agli autenticati (AC44 "consultabile"). |

**Funzione di autorizzazione**
- `private.has_permission(wedding_id, area, action) returns boolean`: SECURITY DEFINER, STABLE, `set search_path = ''`, usa `(select auth.uid())`, fa join `memberships × role_permissions`.
- Ogni policy ha la forma `using (private.has_permission(wedding_id, '<area>', 'read'))` e `with check (private.has_permission(wedding_id, '<area>', 'write'))`.
- Indici su `memberships(user_id)` e su `wedding_id` di ogni tabella.

**Immutabilità** (BR4, AC21, AC33)
- Le tabelle append-only (`decision_events`, `budget_versions`, `audit_log`) hanno un trigger `private.forbid_mutation()` BEFORE UPDATE/DELETE che solleva eccezione per qualunque ruolo, chiave segreta inclusa.
- In più non hanno policy UPDATE/DELETE.

**Decisioni, scenari, Percorso** (migrazione T8)

| Tabella | Colonne chiave | Note |
|---|---|---|
| `decisions` | `wedding_id`, `type text` (`date`, `location`; R2–R4 aggiungono valori senza DDL), `question`, `status` (`open`/`decided`), `chosen_option_id`, `decided_by`, `decided_at`, versione | Indice unico parziale `(wedding_id, type) where type in ('date','location')`. `status`, `chosen_option_id` e `decided_*` non sono aggiornabili dal client (grant di UPDATE solo su `question`): cambiano solo via RPC (AC21). Generica (AC23). |
| `decision_options` | `decision_id`, `wedding_id`, `label`, `notes`, `url`, `pros text[]`, `cons text[]`, `indicative_cost_cents`, `attributes jsonb` (campi specifici per tipo, es. `comune` per location, validati da zod per tipo), `status` (`candidate`/`chosen`/`discarded`), `deleted_at`, versione | Campi comuni come colonne, specifici in `attributes`. R2 può aggiungere tabelle-sottotipo come `date_scenarios` (AC23). |
| `date_scenarios` | `option_id pk/fk`, `wedding_id`, `kind` (`fixed`/`period`), `date_from date`, `date_to date null` | Sottotipo 1:1 delle opzioni della decisione `date` (gli scenari **sono** le opzioni, AC14). Per un periodo, `date_from` = primo giorno (BR3). |
| `decision_events` | `decision_id`, `wedding_id`, `kind` (`option_added`/`option_updated`/`option_removed`/`chosen`/`reopened`/`note`/`reference_set`), `option_id`, `reason`, `payload jsonb`, `actor_id`, `at` | Append-only (AC21). Gli eventi sulle opzioni sono scritti dai trigger su `decision_options`; quelli di scelta e riapertura dalle RPC, nella stessa transazione. |
| `option_reactions` | `option_id`, `user_id`, `wedding_id`, `reaction` (`prefer`/`doubt`) | PK `(option_id, user_id)`. Non vincolante: nessun effetto sullo stato (AC22). Tracciata dall'audit. |
| `tasks` | `wedding_id`, `title`, `advice`, `notes`, `category`, `due_date date null`, `assignee` (`both`/`A`/`B`, default `both`, BR19), `reminders_enabled bool default true`, `status` (`todo`/`done`), `completed_at`, `completed_by`, `source` (`template`/`user`), `template_key`, `template_version`, `offset_months`/`offset_weeks`/`offset_days` (con segno: negativo = prima della data; null = indipendente dalla data), `priority`, `highlight_first bool`, `bureaucratic bool`, `due_overridden bool`, `needs_review bool`, `deleted_at`, `deleted_by`, versione | `unique(wedding_id, template_key) where template_key is not null`. L'eliminazione è sempre logica (`deleted_at`), quindi la tappa resta "marcata" e non viene mai rigenerata né ri-suggerita (AC31, BR6, AC16). |
| `task_suggestion_dismissals` | `wedding_id`, `template_key`, `kind` (`add`/`remove`), `dismissed_at` | "Ignora" nella casella "Suggerimenti da rivedere" (AC16). |

**Budget** (migrazione T9)

| Tabella | Colonne chiave | Note |
|---|---|---|
| `budget_versions` | `wedding_id`, `total_cents >= 0`, `reason`, `created_by`, `created_at` | Append-only. Il totale corrente è l'ultima versione (AC33). |
| `budget_categories` | `wedding_id`, `name`, `allocated_cents >= 0`, `sort_order`, `deleted_at`, versione | Predefinite da `content/budget-categories.ts` (AC34). |
| `budget_items` | `category_id`, `wedding_id`, `description`, `estimated_cents >= 0`, `status` (`previsto`/`concordato`/`annullata`), `agreed_cents >= 0 null`, `notes`, `deleted_at`, versione | AC35, BR8. |
| `payments` | `item_id`, `wedding_id`, `kind` (`acconto`/`saldo`/`altro`), `amount_cents >= 0`, `due_date`, `paid bool`, `paid_on date`, `deleted_at`, versione | AC36. |

**Email e job** (migrazione T9)

| Tabella | Colonne chiave | Note |
|---|---|---|
| `notification_preferences` | `user_id pk`, `reminders_enabled bool default true`, `digest_enabled bool default true` | RLS: solo il proprio utente (AC52). |
| `notification_log` | `user_id`, `wedding_id`, `kind` (`task_7d`/`task_due`/`digest`), `task_id`, `due_date`, `period_key` (settimana ISO per il riepilogo), `status` (`claimed`/`sent`/`failed`/`skipped_quota`), `attempts`, `provider_message_id`, `error_code`, `created_at`, `sent_at` | `unique(user_id, kind, task_id, due_date)` e `unique(user_id, kind, period_key)`: l'idempotenza è nel DB (AC53). RLS attiva senza policy client: accesso solo dal job. |

**Funzioni RPC** (tutte `set search_path = ''`; quelle SECURITY DEFINER verificano esplicitamente `has_permission`)
- `create_wedding()`:
  - richiede che l'email sia nell'allowlist e non ancora consumata, che l'utente non abbia appartenenze e che **non ci sia un invito pendente per la sua email** (BR13);
  - crea il matrimonio, il partner A (email = login), l'appartenenza A, le decisioni `date` e `location` e lo stato utente.
- `complete_onboarding(payload jsonb)`, SECURITY INVOKER (vale la RLS), in un'unica transazione:
  - partner B, scenari/opzioni, versione budget, categorie predefinite, compiti generati (calcolati in TS e passati nel payload) e hash dell'invito;
  - imposta `onboarding_completed_at`;
  - idempotente: rifiuta se l'onboarding è già completo (AC14).
- `accept_pending_invitation()`:
  - per `auth.email()` controlla invito valido, non revocato e non scaduto;
  - inserisce l'appartenenza B (il vincolo unico protegge dalle gare), collega `wedding_partners.user_id` e marca l'invito accettato;
  - restituisce un codice di esito (`ok`/`expired`/`revoked`/`used`/`email_mismatch`/`full`) per i messaggi di AC7.
- `choose_option(option_id, expected_version)`, `reopen_decision(decision_id, reason, expected_version)` (motivo obbligatorio, `check length(trim(reason)) > 0`), `add_decision_note(decision_id, body)`: cambiano stato e scrivono l'evento in modo atomico (AC18, AC19, AC21).
- `set_reference_scenario(option_id)`: AC24, AC32 "Imposta come riferimento".
- `acknowledge_task_review(task_id)`: "Va bene così" (AC20).
- `private.sync_timeline(wedding_id)`: vedi §5. È invocata da trigger AFTER su `date_scenarios`, `decision_options` (cancellazione logica), `decisions` (cambio stato) e `weddings` (`UPDATE OF manual_reference_option_id`).
- `private.add_date_offset(date, months, weeks, days)`: aritmetica di sole date. Postgres adegua già il fine mese con `date + interval 'n months'` (31/01 + 1 mese = 28/02).
- `private.is_entitled_email(email)`: concessa solo al ruolo con chiave segreta. Vero se l'email è nell'allowlist non consumata o ha un invito pendente valido.
- `private.record_heartbeat(source)`: concessa solo al ruolo con chiave segreta. `public.last_heartbeat()`.

### 4. Accesso e invito (AC1–AC9)
1. **Registrazione pubblica chiusa** nel server Auth: `enable_signup = false` in `supabase/config.toml` per il locale e nel pannello o con `supabase config push` per staging e produzione. La chiave pubblicabile è pubblica: solo la chiusura lato GoTrue impedisce davvero la creazione di utenti.
2. **Richiesta di accesso** (server action `requestSignIn(email)`):
   - valida con zod;
   - chiama `signInWithOtp({ email, options: { shouldCreateUser: false } })`;
   - se l'utente non esiste, chiama `is_entitled_email(email)` con la chiave segreta. Se l'email è autorizzata (primo partner da allowlist, oppure invitato con invito valido) esegue `auth.admin.createUser({ email, email_confirm: true })` e ripete la richiesta;
   - in ogni caso risponde con lo **stesso messaggio neutro** (AC2: nessun utente creato per estranei, nessuna enumerazione);
   - gestisce in chiaro gli errori di limite (429) e di attesa di 30 s (AC8). L'intervallo minimo tra invii è `max_frequency = "30s"` in config.
3. **Email di accesso** (template Supabase versionati in `supabase/templates/magic_link.html`):
   - contengono il codice `{{ .Token }}` (6 cifre, `otp_length = 6`) e il link `{{ .SiteURL }}/auth/conferma?token_hash={{ .TokenHash }}&type=email`;
   - la pagina `/auth/conferma` **non consuma il token in GET**: mostra il pulsante "Entra" e verifica con `verifyOtp({ token_hash, type })` in POST. Questo evita che gli scanner dei link delle caselle di posta lo brucino;
   - funziona in un browser diverso da quello della richiesta (AC8);
   - il codice si inserisce in `/accesso` con `verifyOtp({ email, token, type: 'email' })`. Il campo è copiabile, con `autocomplete="one-time-code"`.
4. **Instradamento dopo l'accesso** (server, nell'ordine):
   - (a) se l'utente ha un'appartenenza, va alla home, o all'onboarding se non è completo;
   - (b) altrimenti chiama `accept_pending_invitation()`: se l'esito è `ok`, entra nello spazio invitante (AC4, BR13);
   - (c) altrimenti, se l'email è autorizzata come primo partner, apre `create_wedding()` e l'onboarding;
   - (d) altrimenti va a `/su-invito` (AC3).
5. **Invito** (AC5–AC7):
   - alla conferma dell'onboarding, o da Altro > "Invita il partner", la server action genera 32 byte casuali (`crypto.randomBytes`, base64url) e salva solo lo `sha256` (NFR: token non reversibile);
   - invia l'email tramite l'interfaccia email (§7) con il link `/invito/<token>`. La UI mostra anche "Copia link" per WhatsApp e simili;
   - scadenza 7 giorni. "Invia di nuovo" genera un nuovo token, invalida il precedente e rinnova la scadenza; "Revoca" imposta `revoked_at`;
   - `/invito/[token]` (server, chiave segreta in sola lettura dell'invito per hash) mostra lo stato: valido / scaduto / usato / revocato / aperto con un altro account (email mascherata), con un'azione in italiano;
   - se l'invito è valido, la pagina invia l'utente al flusso di accesso con l'email precompilata. L'accettazione vera la fa sempre `accept_pending_invitation()` nel DB (AC6).
   - Header `Referrer-Policy: no-referrer` su `/invito/*` e `/auth/*`.
6. **Primo account**: lo sviluppatore esegue una volta, nel SQL editor del progetto di produzione, `insert into private.founder_allowlist(email) values ('…')`. Non deve creare utenti a mano, e l'email non tocca mai il repo. Il runbook è in `docs/technical/ambienti-e-rilascio.md`. In locale la seed inserisce solo email finte `@example.test`.
7. **Protezione delle route**:
   - `src/proxy.ts` aggiorna i cookie di sessione e reindirizza a `/accesso` ogni route non pubblica (AC1);
   - i dati sono comunque protetti dalla RLS: la chiave pubblicabile senza sessione restituisce 0 righe o un rifiuto su ogni tabella.
   - Header globali: `X-Robots-Tag: noindex, nofollow`, `robots.txt` con disallow totale, `metadata.robots` noindex anche su `/accesso` (NFR), `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin` e una CSP di base (`default-src 'self'`; `connect-src` verso l'URL Supabase).

### 5. Motore del Percorso (AC15, AC16, AC20, AC24–AC32, AC48)
- **Modello di tappe**: è contenuto di prodotto in `src/content/milestones/it.ts`, tipizzato e validato da `schema.ts` (zod, test).
  - Campi: `key`, `version`, `title`, `advice`, `category`, `offset {months, weeks, days} | null`, `rites: Rite[] | 'all'`, `priority`, `highlightFirst` (solo location/data, budget, lista invitati preliminare), `bureaucratic` (mostra "Indicativo: verifica sempre con il comune o la parrocchia"), `dependsOnDate` (= offset non nullo).
  - Il contenuto è scritto dal product-owner nel task T4 (BR7, D14) ed è indicativo.
- **Aritmetica**: `src/lib/dates/plain-date.ts`, senza librerie.
  - Le date sono stringhe ISO `YYYY-MM-DD` trattate come date di calendario.
  - Ordine fisso: prima i mesi, con adeguamento a fine mese (31 → 28/29), poi settimane×7, poi giorni.
  - "Oggi" si calcola in Europe/Rome con `Intl.DateTimeFormat`.
  - La stessa regola è in SQL (`private.add_date_offset`) per il ricalcolo nel DB. **Un unico file di vettori di test** (`tests/fixtures/date-offset-vectors.json`: fine mese, anni bisestili, offset negativi, cambi d'ora) è eseguito sia da Vitest sia da pgTAP, così le due implementazioni non possono divergere.
- **Scenario di riferimento** (AC24, BR3, D28), funzione pura `resolveReference()` duplicata in SQL dentro `sync_timeline`:
  - se la decisione `date` è presa, il riferimento è lo scenario scelto ("definitivo");
  - altrimenti, se `manual_reference_option_id` punta a uno scenario aperto e non cancellato, è quello ("provvisorio");
  - altrimenti è lo scenario aperto con `date_from` più vicino ("provvisorio");
  - nessuno scenario significa nessun riferimento.
  - Alla riapertura, `reopen_decision` imposta `manual_reference_option_id` = lo scenario che era scelto: il riferimento non cambia e torna "provvisorio".
- **Ricalcolo** (`private.sync_timeline`, AC28):
  - calcola la data di riferimento corrente; se è diversa da `applied_reference_date`, aggiorna `due_date` solo dove `source='template' and offset non nullo and status='todo' and not due_overridden and deleted_at is null`, poi salva `applied_reference_date`;
  - con riferimento nullo, i compiti dipendenti dalla data hanno `due_date` null e la UI mostra solo quelli indipendenti, con il "Prossimo passo" "Scegli la data" (AC15);
  - modificare a mano la scadenza imposta `due_overridden = true` (server action).
- **Riapertura della data** (AC20): `reopen_decision` imposta `needs_review = true` sui compiti dipendenti dalla data e non completati. La scelta successiva o "Va bene così" lo azzera. Il banner del Percorso si basa su `decisions.status='open'` più il riferimento ereditato.
- **Anteprima** (AC32): calcolo puro lato client (`previewDueDates(tasks, scenario)`), nessuna scrittura (verificato in e2e). "Imposta come riferimento" chiama `set_reference_scenario`.
- **Generazione**:
  - all'onboarding, `buildTasksFromTemplate(rite, reference)` produce le righe incluse nel payload di `complete_onboarding`;
  - rito "Non lo so ancora": solo le tappe valide per tutti i riti, più la tappa "Scegli il rito" (proposta, vedi Decisions P4).
- **Suggerimenti da rivedere** (AC16, AC48): calcolo puro `diffSuggestions(template, wedding, tasks incl. eliminati, dismissals)`.
  - Nuove tappe applicabili mai presenti → "aggiungi"; tappe presenti non più applicabili e non completate → "non più pertinente".
  - "Accetta" crea il compito o lo elimina logicamente; "Ignora" scrive in `task_suggestion_dismissals`. Nulla avviene in automatico.
  - Lo stesso meccanismo copre le nuove versioni del modello di tappe.
- **Fasi** (AC29, AC30), funzione pura `groupTasks(today)`:
  - "Adesso" = max 3 scadute con `highlightFirst`, più quelle in scadenza entro 30 giorni;
  - "Da recuperare" = le altre scadute, per `priority`, con la loro scadenza calcolata (nessuna compressione, D15);
  - "Prossimi 3 mesi" = scadenza tra 31 e 90 giorni; "Più avanti" = oltre o senza data; "Fatti" = completati.
  - Soglie da confermare dal designer (Decisions P6).
- **Prossimo passo** (AC27): funzione pura `nextSteps()` con l'ordine dell'AC, che filtra "miei + entrambi" come in design.md §3.3.

### 6. Budget (AC33–AC38)
- Il totale è sempre l'ultima `budget_versions`. Le modifiche aggiungono una riga con motivo opzionale.
- I totali sono calcolati da funzioni pure in `src/domain/budget/totals.ts`: Assegnato, Previsto, Concordato, Pagato, Ancora da pagare, non assegnato, per categoria e totale.
  - Le voci `annullata` sono escluse da Previsto e Concordato; i loro pagamenti già fatti restano in "da recuperare" (BR8).
  - Nessuna vista SQL. Se un domani serve una vista, deve essere `security_invoker = true`.
- Avvisi (`warnings.ts`): Concordato > Assegnato per categoria; Concordato > totale; Pagato > Concordato per voce (conferma, non blocco); totale ridotto sotto il Concordato (informativo, AC33).
- `MoneyInput` e `src/lib/money.ts`: accetta virgola o punto, formatta it-IT in uscita dal campo, max 2 decimali, ≥ 0. Il DB ha comunque `check >= 0` (AC38).
- "Prossimi pagamenti" in ordine di scadenza. La home mostra i pagamenti scaduti o entro 14 giorni (AC27).

### 7. Email: interfaccia unica, job giornaliero, promemoria (AC9, AC44, AC50–AC53)
- **Interfaccia** `EmailSender.send({ to, subject, html, text, headers, idempotencyKey }) → { id }` con 3 implementazioni scelte da `EMAIL_TRANSPORT`:
  - `smtp` (locale e CI): nodemailer verso il mail catcher dello stack Supabase locale, porta SMTP abilitata in `config.toml`;
  - `resend` (produzione): `fetch` all'API REST di Resend con header `Idempotency-Key`, nessun SDK;
  - `none` (Preview prima del dominio): non invia; la UI mostra il link d'invito da copiare.
  - Selezione e validazione delle variabili all'avvio (`src/lib/email/index.ts`).
- **Email di Supabase Auth**: in produzione usano il **custom SMTP** di Supabase verso `smtp.resend.com` con la chiave Resend impostata nel pannello o via `env()` in `config.toml`, mai nel repo. In locale vanno al mail catcher. Un solo fornitore (AC9).
- **Template app** (`src/lib/email/templates/*.ts`): funzioni TS che restituiscono html + testo, in italiano con il "tu". Nessuna libreria di template.
  - Invito: nessun link di disattivazione (AC52).
  - Promemoria e riepilogo: link di disattivazione, più gli header `List-Unsubscribe` e `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- **Job giornaliero** `GET /api/cron/daily`, Vercel Cron `0 5 * * *` UTC, cioè 06:00 CET / 07:00 CEST con la tolleranza Hobby fino a +59 min (BR16).
  - Autorizzazione: `Authorization: Bearer ${CRON_SECRET}`, altrimenti 401.
  - Passi:
    1. heartbeat `record_heartbeat('vercel_cron')` = vera query (AC44);
    2. lettura dei dati con la chiave segreta;
    3. `planReminders(today_Rome, …)` pura:
       - `task_7d` quando `due-7 ≤ oggi < due`, con recupero dei giorni persi se il cron è saltato;
       - `task_due` solo `oggi == due`;
       - destinatari secondo l'assegnatario `both`/`A`/`B`, solo partner con account e `reminders_enabled`;
       - nessuna email per compiti completati, eliminati, senza scadenza o con promemoria spenti, né solleciti dopo la scadenza (AC50, BR16);
    4. se oggi è lunedì (Europe/Rome), `planDigest`: per utente, compiti propri o di entrambi scaduti o entro 7 giorni, pagamenti entro 14 giorni, novità dell'altro partner negli ultimi 7 giorni. Niente email se vuoto (AC51);
    5. per ogni email: **claim** `insert … on conflict do nothing returning id`. Solo chi ottiene il claim invia, con `Idempotency-Key = claim id`, poi `sent`. In caso di errore `failed`, ritentato alla prossima esecuzione **solo** se ancora nella finestra e con la stessa chiave. Mai due volte (AC53);
    6. tetto: `EMAIL_DAILY_CAP` (predefinito 50) e `EMAIL_MONTHLY_CAP` (predefinito 1.500), ben sotto Resend free (vedi Risks). Oltre il tetto il claim va a `skipped_quota`, l'evento è scritto in `heartbeats.details` e il controllo settimanale fallisce, quindi notifica (AC53).
  - Log strutturati con soli conteggi, nessuna email né nome.
- **Disattivazione** (AC52):
  - il link `/email/disattiva?t=<token>` usa un token HMAC-SHA256 (`EMAIL_LINK_SECRET`) su `user_id` + tipo, senza scadenza;
  - GET mostra una pagina di conferma, POST (anche one-click) aggiorna `notification_preferences` con la chiave segreta, solo per quell'utente;
  - le preferenze sono modificabili anche da Altro > Promemoria (RLS).
- **Controllo secondario** (AC44) `.github/workflows/keepalive.yml`, settimanale (`0 7 * * 1`) e manuale:
  - con `curl` chiama `rpc/record_heartbeat` su **staging e produzione** usando le chiavi segrete nei secret GitHub; stampa solo lo stato HTTP;
  - fallisce, e quindi GitHub manda un'email di errore, se l'ultimo heartbeat `vercel_cron` di produzione ha più di 36 h o se `details` segnala quota superata;
  - tiene vivo anche lo staging, che non ha cron.

### 8. Temi (AC49, design.md §5)
- `src/themes/catalogue.ts` contiene i 12 temi di design.md §5.3. `approved.ts` contiene `APPROVED_THEME_IDS`, fissato al Gate B dallo sviluppatore (predefinito `giardino`).
- `scripts/gen-themes-css.ts` genera `src/app/themes.css` con `:root[data-theme=id]` e `[data-mode=dark]` (solo variabili CSS, pochi KB). Un test verifica che il file sia aggiornato rispetto al catalogo.
- **Test di contrasto automatico** (`contrast.ts` + Vitest): calcola i rapporti WCAG per tutte le coppie di design.md §5.2, chiaro e scuro, per ogni tema approvato. Il CI fallisce sotto 4,5:1 (testo) o 3:1 (componenti).
- Applicazione:
  - `theme_id` del matrimonio è letto nel root layout (server) e scritto come `<html data-theme>`: nessun lampo di tema;
  - chiaro/scuro è una preferenza del dispositivo, applicata da un piccolo script inline prima del paint (`localStorage`, default `prefers-color-scheme`), senza dipendenze;
  - l'anteprima dal vivo cambia `data-theme` sul client senza salvare; "Usa questo tema" salva via server action e i partner la vedono al caricamento successivo (AC49).
- Font: `next/font/google` (self-hosted al build), una dichiarazione per famiglia dei temi approvati, `preload: false`, `display: swap`, sottoinsieme `latin`, max 3 pesi. Il browser scarica solo le famiglie effettivamente usate dal tema attivo (LCP).
- La posizione del passo Tema nell'onboarding segue AC12 (ultimo passo). Spostarlo in testa è una scelta UX del designer senza impatto tecnico.

### 9. Concorrenza, novità, stati (AC39–AC41)
- **Aggiornamento versionato** (`src/lib/supabase/versioned-update.ts`):
  - `update(...).eq('id', id).eq('version', v).select()`: 0 righe significa conflitto;
  - in caso di conflitto rilegge la riga corrente e l'ultima voce di `audit_log` (autore e ora) e restituisce `{ conflict, current, changedBy, changedAt }`;
  - `ConflictDialog` offre "Vedi cosa è cambiato" (diff dei campi), "Salva comunque" (ritenta con la versione corrente) e "Annulla" (AC40, BR9).
- **Novità** (AC41): all'apertura della home, `user_wedding_state.previous_seen_at ← last_seen_at` e `last_seen_at ← now()`. Si leggono le voci di `audit_log` dell'altro partner successive a `previous_seen_at`, filtrate da una whitelist di eventi rilevanti e tradotte in frasi (`src/domain/news/messages.ts`).
- **Stati** (AC39):
  - vuoto, caricamento ed errore con "Riprova" sono componenti condivisi;
  - offline: banner da `navigator.onLine` più eventi, e hook `useFormDraft` che salva la bozza del modulo in `localStorage` e la cancella al salvataggio (D21);
  - DB in pausa o non raggiungibile: `classifyDbError()` mappa errori di rete e 5xx/540 sulla pagina dedicata. Nota tecnica: un progetto free in pausa **non** si risveglia da solo; va ripristinato dal pannello (runbook). Il testo della pagina va rivisto dal designer (Risks R9).

### 10. Esportazione (AC42)
- La generazione avviene **lato client** con le query RLS dell'utente. La barra di avanzamento segue le fasi delle query.
- `domain/export/json.ts` produce un JSON con `schemaVersion`: impostazioni, partner (senza data di nascita), decisioni + opzioni + eventi, compiti (inclusi gli eliminati, marcati), versioni di budget, categorie, voci, pagamenti, audit.
- `csv.ts` produce `compiti.csv` e `budget.csv` (voci + pagamenti): separatore `;`, BOM UTF-8 per Excel italiano, importi con virgola, escaping RFC 4180.
- Download via Blob con nome `roadmap2yes-export-AAAA-MM-GG.json|csv`: 3 pulsanti, nessuna libreria ZIP.
- Aggiorna `user_wedding_state.last_export_at`. La home mostra "ultimo export: N giorni fa" e il promemoria dopo 30 giorni.

### 11. Ambienti e configurazione
| Variabile | Locale (`.env.local`, da `.env.example`) | Preview (Vercel) | Production (Vercel) |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | stack locale | progetto staging | progetto prod |
| `SUPABASE_SECRET_KEY` (server-only) | locale | staging | prod |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | da `VERCEL_BRANCH_URL` | URL prod (`*.vercel.app`, poi il dominio) |
| `EMAIL_TRANSPORT` | `smtp` | `none` | `resend` (dopo il dominio; prima `none`) |
| `SMTP_HOST`/`SMTP_PORT` | mail catcher locale | — | — |
| `RESEND_API_KEY`, `EMAIL_FROM` | — | — | Resend, mittente sul dominio |
| `EMAIL_DAILY_CAP`, `EMAIL_MONTHLY_CAP` | 50 / 1500 | — | 50 / 1500 |
| `CRON_SECRET`, `EMAIL_LINK_SECRET` | valori locali finti | casuali | casuali |

- Supabase Auth per progetto: `site_url`; redirect consentiti (prod: URL prod; staging: `https://*-<slug-account>.vercel.app/**`); registrazione chiusa; OTP a 6 cifre; template; custom SMTP Resend (solo prod, dopo il dominio).
- Prima del dominio, lo staging usa l'SMTP integrato di Supabase, che consegna solo ai membri dell'organizzazione: va bene per gli smoke test di Tony con dati finti.
- Vercel: Deployment Protection (Vercel Authentication) sulle preview; regione funzioni `fra1`.
- GitHub: secret `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD_{PROD,STAGING}`, `SUPABASE_SECRET_KEY_{PROD,STAGING}`; variabili `SUPABASE_PROJECT_REF_{PROD,STAGING}`, `SUPABASE_URL_{PROD,STAGING}`; GitHub Environment `production` con revisore obbligatorio (lo sviluppatore) per il job di migrazione in produzione.

### 12. CI e migrazioni
- `ci.yml` su PR e push, runner ubuntu gratuiti (repo pubblico):
  - job `checks`: `npm ci`, lint, typecheck, test unitari, verifica che `themes.css` e `database.types.ts` non siano disallineati;
  - job `db-e2e`:
    - `npx supabase start -x studio,imgproxy,storage-api,edge-runtime,logflare,vector,realtime,supavisor`;
    - `db reset` (migrazioni + seed finti), `supabase test db` (pgTAP), test d'integrazione Vitest;
    - `npm run build`, poi Playwright (Chromium mobile 360 px, WebKit iPhone, Chromium desktop) con le email lette dal mail catcher;
    - artefatti (report Playwright) solo in caso di errore: contengono solo dati finti;
  - job `secrets`: gitleaks (immagine Docker ufficiale) su **tutta la cronologia** (`fetch-depth: 0`). In più scansione dei secret e push protection di GitHub, attive di default sui repo pubblici (AC45).
- `migrate.yml`:
  - su PR che toccano `supabase/migrations/**`: `supabase link` allo staging + `supabase db push`;
  - su push a main: stesso comando verso **prod**, nell'environment `production` con approvazione (comando verso la produzione, rientra nel Gate C).
- Regola: migrazioni **solo additive e compatibili con il codice precedente** (expand/contract). Il deploy Vercel del merge corre in parallelo, e il rollback del codice resta sicuro.
- `database.types.ts` è generato (`npm run db:types`) e committato; in caso di conflitto tra task si **rigenera**, non si unisce a mano.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Vite + React SPA + Supabase Edge Functions | Modello mentale più semplice, nessun server Next | Cron, invito e disattivazione richiedono Edge Functions (secondo runtime, secondo deploy); niente SSR per LCP e tema senza lampo; header noindex/CSP da gestire a parte | Più parti in movimento su due piattaforme; LCP < 3 s e tema SSR più difficili |
| Backend applicativo con chiave segreta e autorizzazione nel codice (RLS spenta o permissiva) | Logica in un solo linguaggio | Un errore di codice espone tutti i dati; la chiave pubblicabile è pubblica: con RLS debole l'API PostgREST è aperta | Contrario all'NFR (RLS unico confine) e ad AC10/AC11 |
| Event sourcing completo (stato derivato da eventi) | Storico perfetto | Costo alto su ogni lettura e proiezione; sproporzionato per 2 utenti | Audit trigger generico + eventi delle decisioni + versioni del budget coprono BR4/BR14 a costo minimo |
| Data di riferimento salvata e aggiornata dalle server action | Nessun trigger | Le invarianti dipendono da ogni punto di scrittura (scenari, scelta, riapertura, manuale): facile dimenticarne uno | Derivata in `sync_timeline`, invocata da trigger: invariante garantita nel DB |
| Opzioni di decisione EAV/solo jsonb | Massima genericità | Niente vincoli né indici sulle date; il ricalcolo SQL diventa fragile | Colonne comuni + `attributes jsonb` + sottotipo `date_scenarios` |
| Invito con `auth.admin.inviteUserByEmail` | Meno codice | Email e testo controllati da Supabase; crea l'utente subito per qualunque email digitata; nessun controllo su revoca/scadenza/limite partner | Tabella `invitations` + accettazione RPC con verifiche nel DB (AC5–AC7) |
| Primo account: elenco email in variabile d'ambiente Vercel | Nessuna tabella | Il DB non può verificarlo (`create_wedding` dovrebbe fidarsi del server); due fonti di verità | Allowlist in `private.founder_allowlist`, verificata nel DB |
| Primo account: utenti creati a mano dal pannello | Zero codice | Ogni nuovo accesso futuro (famiglia/planner) richiede intervento manuale; la creazione spazio andrebbe comunque limitata | Allowlist + creazione automatica solo per email autorizzate |
| Solo GitHub Actions schedulato per keep-alive e promemoria | Un solo scheduler | Ritardi o salti; disattivato dopo 60 giorni senza attività sul repo; log pubblici | Vercel Cron giornaliero primario, GitHub settimanale come controllo e notifica |
| Deploy di produzione dal workflow dopo la migrazione (Vercel Git disattivato su main) | Ordine migrazione → codice garantito | Token Vercel nei secret; diverge da project.md (merge = deploy automatico) | Migrazioni additive e compatibili rendono innocua la finestra; da rivalutare se servirà una migrazione non additiva |
| Resend SDK + React Email | Template con componenti | 2+ dipendenze per 3 template | `fetch` + template TS |
| Libreria date (date-fns/Temporal polyfill) per il dominio | Meno codice | Dipendenza in più; Temporal non disponibile su tutti i browser target | ~100 righe di `plain-date.ts` con vettori di test condivisi con SQL |
| Supabase Branching per staging | Integrato | A pagamento | Secondo progetto free + `supabase db push` da Actions |

## Impacts
- **Dati e migrazioni**: 3 migrazioni iniziali (core, decisioni/Percorso, budget/notifiche), tutte nuove e quindi non distruttive. Rollback in sviluppo con `supabase db reset`; in produzione si va solo avanti con migrazioni correttive. Le seed sono solo finte, in `supabase/seeds/NN_*.sql` (un file per task). Nessuna data di nascita in alcuna tabella (D26).
- **Contratti**: le RPC elencate in §3 e le route `/api/cron/daily`, `/auth/conferma`, `/invito/[token]`, `/email/disattiva`. Formato export JSON con `schemaVersion: 1`.
- **Prestazioni**:
  - SSR in `fra1` vicino al DB a Francoforte; bundle client limitato (niente librerie pesanti);
  - font self-hosted senza preload, solo variabili CSS per i temi;
  - query per matrimonio indicizzate su `wedding_id`; volumi minimi (≈100 compiti, ≈100 voci).
  - DB < 10 MB in R1, lontano dai 500 MB.
- **Sicurezza**:
  - registrazione chiusa a livello Auth; email autorizzate solo nel DB;
  - RLS con una sola funzione di permesso, test pgTAP per tabella e controllo CI "nessuna tabella senza RLS";
  - chiave segreta usata solo in 3 punti server-only;
  - token d'invito hashati, monouso e con scadenza; conferma OTP in POST;
  - noindex, CSP di base, `Referrer-Policy` restrittiva sulle route con token;
  - dati utente mai in cache condivisa;
  - log senza dati personali, gitleaks, artefatti CI solo finti.
  - **Cambio a autenticazione/permessi: è il modello di sicurezza iniziale e richiede l'approvazione dello sviluppatore al Gate B**, con un round di revisione sicurezza in F3.
- **Dipendenze e servizi nuovi**: elenco completo in "Decisions → P1". Tutti gratuiti tranne il dominio, già deciso (D12).
- **Configurazione**: variabili in §11. Aggiornamenti proposti a `.adf/project.md` sotto (commands, docker, deploy).

### Proposta per `.adf/project.md` (da approvare al Gate B; scritta dal coordinatore)
```yaml
docker: true   # Docker Desktop è necessario per lo stack Supabase locale (Postgres, Auth, mail catcher); l'app gira su Node 24 dell'host
commands:
  setup: "npm ci && npm run db:start && npm run db:reset"
  start: "npm run dev"            # db:start (idempotente) + next dev
  lint: "npm run lint"            # eslint + prettier --check + guardia 'use cache'
  typecheck: "npm run typecheck"  # tsc --noEmit
  test: "npm run test"            # db:start idempotente + vitest unit + vitest integration + supabase test db (pgTAP)
  build: "npm run build"          # next build
  e2e: "npm run e2e"              # db:start + playwright (build + start contro lo stack locale, email dal mail catcher)
```
In più:
- `deploy.staging`: "Vercel Preview per PR, collegata al progetto Supabase di staging (solo dati finti); migrazioni sullo staging da GitHub Actions".
- `deploy.production`: "merge su main → Vercel Production + migrazioni prod da GitHub Actions (environment `production` con approvazione)".
- "Tests" in project.md: Vitest (unit/integration), pgTAP, Playwright; solo dati finti.

## Risks
Limiti dei piani gratuiti: valori noti a fine 2026, **non riverificabili online in questa sessione** (nessun accesso web); il release-manager li ricontrolla alla creazione dei servizi.

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Pausa di Supabase free dopo ~7 giorni di inattività; oltre ~90 giorni di pausa il ripristino dal pannello non è più garantito | Media | Alta | Cron giornaliero con query vera + controllo settimanale GitHub su prod e staging; runbook di ripristino; export come backup (AC42) |
| R2 | GitHub disattiva i workflow schedulati dopo 60 giorni senza attività sul repo pubblico | Media | Media | GitHub avvisa via email prima; il primario è il cron Vercel; runbook "riattiva workflow" |
| R3 | Cron Hobby: max 1/giorno, orario impreciso (fino a +59 min), un'esecuzione può saltare | Media | Bassa | Finestra di recupero per `task_7d`; idempotenza nel DB; il controllo settimanale segnala heartbeat vecchi di 36 h |
| R4 | Dominio non ancora acquistato: niente email reali a Jessica; Resend free richiede un dominio verificato (SPF/DKIM) | Certa ora | Alta per il rilascio a Jessica | Sviluppo interamente locale (D27); rilascio in due tempi (P2); checklist DNS (SPF, DKIM, DMARC `p=none`) nel runbook |
| R5 | Quote Resend free (indicative: 100 email/giorno, 3.000/mese, 1 dominio), condivise da Auth e app | Bassa | Media | Tetto applicativo 50/giorno e 1.500/mese; stima di uso reale < 300 email in 9 mesi; `skipped_quota` registrato e segnalato |
| R6 | Scanner dei link (Outlook, antivirus) consumano il magic link in GET | Media | Media | Conferma in POST su `/auth/conferma`; codice a 6 cifre come alternativa |
| R7 | Errori RLS o fuga di dati da cache Next | Bassa | Alta | pgTAP per tabella (lettura/scrittura cross-matrimonio), controllo "RLS attiva ovunque", regola lint contro `use cache` nelle aree autenticate, revisione sicurezza dedicata |
| R8 | Divergenza tra aritmetica date in TS e SQL | Media | Media | Vettori di test condivisi eseguiti da Vitest e pgTAP |
| R9 | AC39 "si sta svegliando, riprova tra un minuto": un progetto free in pausa non si risveglia da solo | Certa | Bassa | Il designer rivede il testo (es. "Il servizio è in pausa: avvisa Tony"); runbook di ripristino; R1 lo rende improbabile |
| R10 | Gara tra deploy Vercel e migrazione al merge | Media | Bassa | Migrazioni additive e compatibili; uso reale minimo; il primo rilascio avviene prima che Jessica entri |
| R11 | Fuga di dati via repo pubblico (log CI, artefatti, seed) | Bassa | Alta | Solo dati `@example.test`; gitleaks su tutta la cronologia; nessun dump; log con soli conteggi; test che rifiuta email non finte nelle seed |
| R12 | 12 temi con 24 famiglie di font: peso e LCP | Media | Media | Solo i temi approvati entrano nel build; `preload: false`, `display: swap`, sottoinsieme latin, max 3 pesi; controllo LCP in e2e (design.md §11) |
| R13 | Nessun backup scaricabile sul piano free (da verificare) | Media | Alta | Export con promemoria a 30 giorni; runbook di `supabase db dump` locale (mai nel repo né negli artefatti) |
| R14 | Instabilità di versioni (Next 16 `proxy.ts`, chiavi Supabase pubblicabile/segreta, mail catcher Inbucket→Mailpit) | Media | Bassa | Versioni bloccate nel lockfile; helper `e2e/support/mailbox.ts` che astrae l'API del mail catcher; T1 verifica la versione della CLI |
| R15 | Più PR con migrazioni sullo staging condiviso | Bassa | Bassa | Un solo sviluppatore; lo staging ha solo dati finti; un eventuale reset dello staging va comunque confermato (security.md) |
| R16 | Trigger di sincronizzazione del Percorso: ricorsione o effetti inattesi | Bassa | Media | Trigger `UPDATE OF` su colonne specifiche, guardia `pg_trigger_depth()`, test pgTAP dedicati |

## Tasks
Regole di parallelismo:
- `package.json` e il lockfile sono di **T1**, che installa tutte le dipendenze approvate. Ogni altra aggiunta passa dal coordinatore.
- Ogni migrazione ha un prefisso riservato (`20261201100000_core`, `…200000_decisions_timeline`, `…300000_budget_notifications`) e ogni task ha il suo file seed `supabase/seeds/NN_*.sql`.
- `database.types.ts` si rigenera, non si unisce a mano.
- Le cartelle di route sono di un solo task.

| # | Task | Owner | Files (owned) | Depends on | AC |
|---|---|---|---|---|---|
| T1 | **Scaffolding**: Next.js 16 + TS strict, Tailwind v4, shadcn init + componenti base, ESLint/Prettier (+ guardia `use cache`), Vitest (progetti unit/integration), Playwright (3 progetti, webServer locale), Supabase CLI npm + `config.toml` (registrazione chiusa, OTP 6, `max_frequency` 30s, SMTP del mail catcher, seed glob), script npm (comandi sopra), `.env.example`, `.nvmrc` (24), header di sicurezza e noindex in `next.config.ts`, `robots.ts`, client Supabase `server/client/admin` + `proxy.ts` (redirect non autenticati), CI `ci.yml` + `.gitleaks.toml`, README sezione setup | developer | `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc`, `postcss.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `supabase/config.toml`, `.env.example`, `.nvmrc`, `src/app/robots.ts`, `src/lib/supabase/{server,client,admin}.ts`, `src/proxy.ts`, `src/components/ui/*`, `src/lib/utils.ts`, `.github/workflows/ci.yml`, `.gitleaks.toml`, `README.md` | — | AC1 (redirect), AC43, AC45 |
| T2 | **DB core e RLS**: migrazione core (§3 identità/ruoli/inviti/audit/versione/heartbeat/stato utente), `has_permission`, `forbid_mutation`, `audit_capture`, `bump_version`, `create_wedding`, `accept_pending_invitation`, `is_entitled_email`, `record_heartbeat`/`last_heartbeat`; helper `versioned-update.ts`; seed finti; pgTAP (isolamento, RLS ovunque, vincolo 2 partner, inviti) + integrazione (anon PostgREST, accettazioni simultanee, conflitto di versione) | developer | `supabase/migrations/20261201100000_core.sql`, `supabase/seeds/01_core.sql`, `supabase/tests/00_helpers.sql`, `supabase/tests/core_*.test.sql`, `src/lib/supabase/versioned-update.ts`, `src/lib/supabase/database.types.ts`, `tests/integration/core.*.test.ts` | T1 | AC1, AC3, AC4, AC6, AC10, AC11, AC40 (infra), AC46 (modello) |
| T3 | **Design system, temi, shell**: catalogo temi + `approved.ts` + generatore `themes.css` + test di contrasto, root layout (`data-theme` SSR, script modo, font), `(app)/layout.tsx` + `AppNav`, componenti condivisi (EmptyState, ErrorState, OfflineBanner, `useFormDraft`, ConflictDialog, Countdown, MoneyInput, BudgetBar, DateField, ThemeGallery), pagina DB in pausa / error boundary, `manifest.ts` | developer (+ designer review) | `src/themes/*`, `scripts/gen-themes-css.ts`, `src/app/{layout.tsx,globals.css,themes.css,manifest.ts,error.tsx,global-error.tsx}`, `src/app/(app)/layout.tsx`, `src/components/*` (non `ui/`), `src/lib/hooks/*` | T1 | AC39, AC40 (UI), AC49 (contrasto, applicazione), NFR a11y |
| T4 | **Motore del Percorso e contenuti**: `plain-date.ts`, `clock.ts` (oggi in Europe/Rome, orologio finto solo con `E2E_FAKE_TODAY` fuori da Vercel), vettori condivisi, `content/milestones` (schema + contenuto italiano: il **product-owner** redige le tappe), `domain/timeline/*` (riferimento, offset, generazione per rito, fasi, anteprima, suggerimenti), `domain/home/next-step.ts`, test unitari | developer (+ product-owner per i contenuti) | `src/lib/dates/*`, `src/lib/clock.ts`, `tests/fixtures/date-offset-vectors.json`, `src/content/milestones/*`, `src/domain/timeline/*`, `src/domain/home/*` | T1 | AC15, AC16, AC24, AC25, AC26, AC27, AC28, AC29, AC30, AC32, AC48 |
| T5 | **Budget, importi, export, novità (puri)**: `money.ts`, `domain/budget/{totals,warnings}.ts`, `content/budget-categories.ts`, `domain/export/{json,csv}.ts`, `domain/news/messages.ts`, test unitari | developer | `src/lib/money.ts`, `src/domain/budget/*`, `src/content/budget-categories.ts`, `src/domain/export/*`, `src/domain/news/*` | T1 | AC34, AC35, AC36, AC37, AC38, AC41, AC42 |
| T6 | **Livello email**: interfaccia `EmailSender` (smtp/resend/none), token HMAC di disattivazione, template app (invito, promemoria, riepilogo) in italiano "tu", template Supabase Auth (`magic_link` con link `token_hash` + codice), helper e2e del mail catcher | developer | `src/lib/email/*`, `supabase/templates/*`, `e2e/support/mailbox.ts` | T1 | AC8 (template), AC9, AC52 (link/header) |
| T7 | **Accesso e invito**: `/accesso` (email, codice, "Invia di nuovo" 30 s, errori), `/auth/conferma` (POST), `/su-invito`, `/invito/[token]` (stati AC7), server action `requestSignIn` + creazione utente autorizzato, instradamento dopo l'accesso, azioni invito (crea/invia di nuovo/revoca), Altro > Invito; test d'integrazione | developer | `src/app/(public)/{accesso,auth,su-invito,invito}/**`, `src/features/auth/**`, `src/features/invitations/**`, `src/app/(app)/altro/invito/**`, `tests/integration/auth.*.test.ts` | T2, T3, T6 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 |
| T8 | **DB decisioni + Percorso**: migrazione `decisions`, `decision_options`, `date_scenarios`, `decision_events`, `option_reactions`, `tasks`, `task_suggestion_dismissals`, RPC (`choose_option`, `reopen_decision`, `add_decision_note`, `set_reference_scenario`, `acknowledge_task_review`, `complete_onboarding`), `add_date_offset`, `sync_timeline` + trigger; seed finti; pgTAP (immutabilità, atomicità, riferimento, ricalcolo, vettori condivisi, marcature) | developer | `supabase/migrations/20261201200000_decisions_timeline.sql`, `supabase/seeds/02_decisions_timeline.sql`, `supabase/tests/decisions_*.test.sql`, `supabase/tests/timeline_*.test.sql` | T2, T4 (vettori) | AC14, AC18, AC19, AC20, AC21, AC22, AC23, AC24, AC28, AC31 (DB) |
| T9 | **DB budget + notifiche**: migrazione `budget_versions`, `budget_categories`, `budget_items`, `payments`, `notification_preferences`, `notification_log` (+ RLS, audit, check), seed finti, pgTAP | developer | `supabase/migrations/20261201300000_budget_notifications.sql`, `supabase/seeds/03_budget.sql`, `supabase/tests/budget_*.test.sql`, `supabase/tests/notifications_*.test.sql` | T2 | AC33, AC38 (DB), AC52 (prefs), AC53 (unicità) |
| T10 | **Onboarding + Impostazioni risposte**: passi 1–8 (bozza in `onboarding_answers`, ripresa, "Passo n di 8", "Non lo so ancora", errore email uguale), conferma → `complete_onboarding` + invio invito, Altro > Impostazioni nozze (rito, scenari, invitati, stile, luogo) e Profili partner (AC46) | developer | `src/app/onboarding/**`, `src/features/onboarding/**`, `src/app/(app)/altro/{impostazioni,profili}/**`, `src/features/settings/**` | T4, T5, T7, T8, T9 | AC12, AC13, AC14, AC15, AC46, AC48 |
| T11 | **Percorso UI**: fasi, filtri con contatore, "Miei / dell'altro / Tutti", compito CRUD (sheet, assegnatario, promemoria, scadenza manuale → `due_overridden`), elimina + Annulla ≥ 8 s, "Eliminati di recente", anteprima scenario + "Imposta come riferimento", banner data riaperta + "Da rivedere"/"Va bene così", casella "Suggerimenti da rivedere" | developer | `src/app/(app)/percorso/**`, `src/features/timeline/**` | T3, T4, T8 | AC15, AC16, AC20, AC24, AC25, AC29, AC30, AC31, AC32, AC40 |
| T12 | **Scelte UI**: elenco/dettaglio decisioni, OptionCard, "Confronta 2" / colonne da 768 px, aggiunta/modifica/rimozione opzioni (data fissa/periodo, avviso prima del 3/9/2027, location), scelta con riepilogo della conseguenza, riapertura con motivo, storico + nota, reazioni | developer | `src/app/(app)/scelte/**`, `src/features/decisions/**` | T3, T8 | AC17, AC18, AC19, AC21, AC22, AC23 |
| T13 | **Budget UI**: riepilogo, totale + storico versioni + motivo, categorie (CRUD, Assegnato con campi numerici, non assegnato sticky), voci, pagamenti, "Prossimi pagamenti", avvisi | developer | `src/app/(app)/budget/**`, `src/features/budget/**` | T3, T5, T9 | AC33, AC34, AC35, AC36, AC37, AC38, AC40 |
| T14 | **Home**: saluto, conto alla rovescia (provvisoria/definitiva/da decidere), Prossimo passo (1+2), pagamenti in evidenza, Novità dall'ultimo accesso, "ultimo export" | developer | `src/app/(app)/page.tsx`, `src/features/home/**` | T3, T4, T5, T8, T9 | AC26, AC27, AC41, AC42 (promemoria) |
| T15 | **Altro: aspetto, promemoria, export, info**: galleria temi con anteprima dal vivo e salvataggio, preferenze email, esportazione (avanzamento, 3 file), info (ultimo heartbeat) | developer | `src/app/(app)/altro/{page.tsx,aspetto,promemoria,esporta,info}/**`, `src/features/{appearance,notifications,export}/**` | T3, T5, T9 | AC42, AC44 (consultabile), AC49, AC52 |
| T16 | **Job e pipeline**: `/api/cron/daily`, `domain/reminders/{plan,digest}.ts`, claim/invio/tetto, `/email/disattiva` (GET/POST one-click), `vercel.json` cron, `migrate.yml`, `keepalive.yml` | developer | `src/app/api/cron/**`, `src/app/(public)/email/**`, `src/domain/reminders/**`, `src/features/jobs/**`, `vercel.json`, `.github/workflows/{migrate,keepalive}.yml`, `tests/integration/cron.*.test.ts` | T6, T8, T9 | AC43 (migrazioni), AC44, AC50, AC51, AC52, AC53 |
| T17 | **E2E e accessibilità**: spec Playwright per tutti i flussi (accesso/invito con mail catcher, onboarding, Percorso, Scelte, Budget, Home, Altro, conflitto a due contesti, offline, 360/768 px), axe su ogni schermata, LCP | qa | `e2e/**` (escluso `e2e/support/mailbox.ts`) | T10–T16 (si scrive man mano) | tutti quelli con E2E nel test plan |
| T18 | **Documentazione** | technical-writer | `docs/functional/**`, `docs/technical/**`, `README.md` (sezioni oltre il setup) | T1–T16 | — |

**Gruppi paralleli** (max 3 sviluppatori):
- **G0**: T1.
- **G1**: T2 ‖ T3 ‖ T4. Chi finisce prima prende T5 e T6.
- **G2**: T7 (dopo T2, T3, T6) ‖ T8 (dopo T2, T4) ‖ T9 (dopo T2).
- **G3**: T10 ‖ T11 ‖ T12.
- **G4**: T13 ‖ T14 ‖ T15.
- **G5**: T16 (può anticipare in G3/G4 se c'è uno sviluppatore libero).
- T17 (qa) parte da G3 e segue i flussi man mano; T18 in F5.

## Test plan
Strumenti: **Vitest** (unit: funzioni pure, componenti con Testing Library; integration: server action/route contro lo stack Supabase locale), **pgTAP** (`supabase test db`: RLS, vincoli, RPC, trigger, impersonando utenti finti con `set local role authenticated` + `request.jwt.claims`), **Playwright** (e2e contro `next build && next start` + Supabase locale; email lette dal mail catcher; orologio finto via `E2E_FAKE_TODAY` + `page.clock`; viewport 360/768/1280; WebKit per Safari iOS; `@axe-core/playwright`). Solo dati finti `@example.test`.

| Level | What | Cases (incl. edge cases) | AC covered | Owner |
|---|---|---|---|---|
| Integration | Accesso anonimo | Chiave pubblicabile senza sessione su **ogni** tabella `public` → 0 righe o rifiuto; RPC negate | AC1, AC10 | developer (T2) |
| E2E | Redirect | `/`, `/percorso`, `/budget`, `/altro` senza sessione → `/accesso`; l'HTML non contiene dati | AC1 | qa |
| Integration | `requestSignIn` | Email sconosciuta → nessun utente in `auth.users`, risposta identica a quella di un'email valida, nessuna email nel mail catcher; allowlist → utente creato; invito valido → utente creato; invito scaduto/revocato → nessun utente | AC2, AC3, AC4 | developer (T7) |
| pgTAP | `create_wedding` | Email non in allowlist → errore; allowlist già consumata → errore; invito pendente per l'email → errore (BR13); successo crea matrimonio + partner A + decisioni | AC3, AC4 | developer (T2) |
| E2E | Ingressi | Estraneo autenticato → "Questo spazio è su invito"; primo partner → onboarding; invitato → home dello spazio invitante, mai la creazione | AC3, AC4 | qa |
| pgTAP + Integration | Inviti | Un solo pendente per matrimonio; token solo come hash (colonna non leggibile); "Invia di nuovo" ruota il token; revoca; `accept_pending_invitation`: email diversa, scaduto, revocato, usato, terzo partner → codici di esito; **due accettazioni simultanee** (Promise.all) → una sola riuscita | AC5, AC6 | developer (T2, T7) |
| E2E | Invito end-to-end | Onboarding con partner B → email nel mail catcher con link; stato "In attesa", Revoca, Invia di nuovo; link scaduto/usato/revocato/altro account → messaggio + azione | AC5, AC7 | qa |
| E2E | Login | Link aperto in un **secondo contesto browser** → accesso (token_hash in POST); codice a 6 cifre inserito; "Invia di nuovo" disabilitato 30 s; codice errato o scaduto → messaggio; 429 simulato → messaggio limite (unit sul mapping degli errori) | AC8 | qa, developer (T7) |
| Unit + manuale | Email di produzione | Selezione del trasporto da env; payload Resend (`fetch` simulato) con `EMAIL_FROM` e `Idempotency-Key`; **verifica manuale post-deploy** dopo il dominio: email di accesso e invito ricevute da un indirizzo non membro di Supabase, mittente sul dominio | AC9 | developer (T6), release-manager |
| pgTAP | Isolamento | Due matrimoni finti: SELECT/INSERT/UPDATE/DELETE incrociati negati su ogni tabella di dominio, RPC incluse | AC10 | developer (T2, T8, T9) |
| pgTAP | Modello | Tutte le tabelle `public` con `rowsecurity = true`; `wedding_id not null` sulle tabelle di dominio; valori di `role`; un utente con 2 appartenenze ammesso dal DB; `role_permissions` senza righe famiglia/planner | AC11 | developer (T2) |
| Unit + E2E | Onboarding | Macchina a passi (ordine, "Passo n di 8", ripresa dall'ultimo non completato, "Non lo so ancora" valido tranne nome ed email di chi compila, email partner uguale alla propria → errore); e2e completo con ricarica a metà | AC12, AC13 | developer (T10), qa |
| Integration | `complete_onboarding` | Crea partner B, scenari, versione budget, categorie predefinite, compiti, invito; seconda chiamata rifiutata; risposte parziali (nessuno scenario/budget/rito) | AC14, AC15 | developer (T8, T10) |
| Unit | Motore del Percorso | Nessun riferimento → solo tappe indipendenti; rito → tappe pertinenti (pubblicazioni civile + cattolico, corso solo cattolico, simbolico senza burocrazia) con avviso "Indicativo"; rito sconosciuto | AC15, AC25 | developer (T4) |
| Unit + E2E | Suggerimenti | Cambio rito → nuove/non più pertinenti; nulla di automatico; eliminati e ignorati non ri-suggeriti; accetta/ignora | AC16, AC48 | developer (T4, T11), qa |
| E2E | Confronto opzioni | 360 px carte + "Confronta 2" con colonna etichette fissa; 768 px colonne; pro/contro con icona | AC17 | qa |
| pgTAP + E2E | Scelta/riapertura | `choose_option` atomico (stato + evento + altre scartate) con conflitto di versione; riapertura senza motivo → errore; con motivo → stato aperto, evento, scenario resta riferimento "provvisorio", `needs_review` sui compiti dipendenti; "Va bene così" | AC18, AC19, AC20 | developer (T8), qa |
| pgTAP | Immutabilità | UPDATE/DELETE su `decision_events`, `budget_versions`, `audit_log` falliscono anche con la chiave segreta; nota accodata | AC21, AC33 | developer (T8, T9) |
| pgTAP + E2E | Reazioni | Reazione non cambia lo stato della decisione; visibile all'altro partner | AC22 | developer (T8), qa |
| pgTAP | Genericità | Decisione con nuovo `type` (es. `supplier`) e `attributes` inseribile senza DDL | AC23 | developer (T8) |
| Unit + pgTAP + E2E | Riferimento | Predefinito = aperto più vicino; periodo = primo giorno; manuale; decisa = definitivo; riaperta = stesso, provvisorio; cancellazione dello scenario manuale → ritorno al più vicino; `sync_timeline` coerente con `resolveReference` | AC24 | developer (T4, T8), qa |
| Unit | Conto alla rovescia | Giorni/settimane con orologio finto a mezzanotte Europe/Rome e a cavallo dei cambi d'ora; etichette "provvisoria"/"data da decidere" | AC26 | developer (T4) |
| Unit | Prossimo passo | Ordine: decisione bloccante (data, poi location) → scaduti per priorità → pagamenti ≤ 14 gg → compiti ≤ 30 gg; max 1+2; filtro "miei + entrambi" | AC27 | developer (T4) |
| Unit + pgTAP | Ricalcolo | Vettori condivisi (31/01 ± mesi, 29/02, offset negativi); solo compiti generati, aperti, non modificati, non eliminati; completati e modificati invariati | AC28 | developer (T4, T8) |
| Unit + E2E | Fasi e ritardi | Max 3 "da fare per prime"; "Da recuperare" per priorità con scadenza calcolata; nessuno nascosto; fasi; filtri con contatore; "Miei / dell'altro / Tutti"; 360 px | AC29, AC30 | developer (T4), qa |
| E2E | Compiti | Aggiungi (assegnatario predefinito Entrambi), modifica, completa, riapri, elimina con Annulla visibile ≥ 8 s, "Eliminati di recente" ripristina; compito generato eliminato non rigenerato; nessuno swipe necessario | AC31 | qa |
| Unit + E2E | Anteprima | `previewDueDates` puro; e2e: banner fisso, nessuna richiesta di scrittura durante l'anteprima (intercettazione rete), passaggio tra scenari, "calcolata dal primo giorno", "Imposta come riferimento" | AC32 | developer (T4), qa |
| Unit + E2E | Budget | Versioni con motivo e storico; riduzione sotto il Concordato → avviso non bloccante; categorie predefinite e CRUD, non assegnato; totali per categoria (annullata esclusa); pagamenti → Pagato / Ancora da pagare, ordinamento per scadenza; avvisi con icona + testo, barre con testo equivalente | AC33–AC37 | developer (T5, T13), qa |
| Unit + pgTAP | Importi | `1.234,56`, `1234.56`, `1234,5`, `0`, `-1`, `1,234`, `12,345` (3 decimali), `abc`, vuoto; formattazione in uscita; DB rifiuta i negativi | AC38 | developer (T5, T9) |
| E2E + Unit | Stati | Vuoti con azione; skeleton; errore con "Riprova" che mantiene i dati; `context.setOffline` → banner + bozza conservata dopo la ricarica; `classifyDbError` → pagina DB in pausa | AC39 | qa, developer (T3) |
| Integration + E2E | Conflitto | `versioned-update` con versione superata → conflitto + autore/ora; e2e con due contesti (Tony/Jessica finti) sullo stesso compito → dialog con 3 azioni | AC40 | developer (T2), qa |
| Unit + E2E | Novità | Mapping audit → frasi con nomi propri; solo azioni dell'altro dopo `previous_seen_at`; e2e: modifica di B visibile ad A | AC41 | developer (T5), qa |
| Unit + E2E | Export | JSON completo con `schemaVersion` e senza data di nascita; CSV con `;`, BOM, escaping, importi con virgola; e2e: download con nome datato, barra di avanzamento, "ultimo export" e promemoria a 30 giorni (orologio finto) | AC42 | developer (T5, T15), qa |
| CI | Pipeline | Lint, typecheck, unit, pgTAP, integrazione, e2e verdi su PR; `migrate.yml` applica allo staging sulle PR con migrazioni; controllo post-deploy: la preview punta allo staging | AC43 | release-manager |
| Integration | Job | 401 senza `CRON_SECRET`; heartbeat scritto; `last_heartbeat` leggibile; workflow keepalive eseguito a mano su staging/prod (verifica release) | AC44 | developer (T16), release-manager |
| CI + review | Repo pubblico | gitleaks su tutta la cronologia; test che fallisce se le seed contengono email non `@example.test`; checklist di revisione su log e artefatti | AC45 | developer (T1), reviewer |
| pgTAP + E2E | Partner | Nessuna colonna di data di nascita; nomi/etichetta/email modificabili; email di B non accettato → nuovo invito; nessun "sposo/sposa" fisso nei testi (unit `displayName`) | AC46 | developer (T2, T10), qa |
| Unit + E2E | Temi | Contrasti WCAG per ogni tema approvato chiaro/scuro; `themes.css` allineato; e2e: tema salvato visibile al secondo partner, `data-theme` presente nell'HTML SSR (niente lampo), anteprima annullabile, selezione da tastiera | AC49 | developer (T3, T15), qa |
| Unit + Integration | Promemoria | `planReminders`: 7 giorni prima e giorno stesso; entrambi → 2 destinatari; A/B → solo quello; completati, eliminati, senza scadenza, promemoria spenti, B senza account → nessuno; recupero dopo un salto del cron; nessun sollecito dopo la scadenza; integrazione: email nel mail catcher | AC50 | developer (T16) |
| Unit | Riepilogo | Solo di lunedì (Europe/Rome); vuoto → nessuna email; contenuti per utente | AC51 | developer (T16) |
| Unit + Integration | Disattivazione | Token HMAC valido/manomesso; GET mostra conferma, POST disattiva solo quell'utente; header `List-Unsubscribe`; email di accesso e invito senza link di disattivazione | AC52 | developer (T6, T16) |
| Integration | Idempotenza e quota | Job eseguito due volte nello stesso giorno → un'email; errore di invio → nuovo tentativo con la stessa chiave; tetto superato → `skipped_quota` + segnalazione in `heartbeats.details` | AC53 | developer (T16) |
| E2E | Accessibilità | axe senza violazioni serie su ogni schermata in chiaro/scuro; percorso da tastiera completo (design.md §11); zoom 200%; `prefers-reduced-motion` | NFR | qa |

## Documentation plan
| Type | Destination | What changes |
|---|---|---|
| Functional | `docs/functional/` | Nuove pagine: `accesso-e-invito.md`, `onboarding.md`, `percorso.md` (riferimento provvisorio/definitivo, anteprima, ritardi, suggerimenti), `scelte.md`, `budget.md`, `promemoria-email.md`, `temi-e-aspetto.md`, `esportazione.md`, indice `README.md` |
| Technical | `docs/technical/` | `architettura.md` (moduli, pattern server action/RPC/RLS), `modello-dati.md` (tabelle, RLS, immutabilità, ruoli futuri), `sicurezza.md` (chiavi, inviti, header, cosa non va mai nel repo), `email-e-job.md` (interfaccia, cron, idempotenza, quote), `ambienti-e-rilascio.md` (runbook: creazione progetti, variabili, allowlist SQL, DNS Resend, migrazioni, rollback, ripristino progetto in pausa, dump locale, riattivazione workflow), `sviluppo-locale-e-test.md` |
| ADR | `docs/adr/0001-stack-auth-ambienti.md` | Necessario: stack, modello di sicurezza e ambienti fissano il precedente per R2–R6 (bozza scritta, stato "proposed" fino al Gate B) |
| README | `README.md` | Requisiti (Node 24, Docker), setup in 3 comandi, link alla documentazione, avviso repo pubblico |
| Project memory | `.adf/project.md` | Commands, `docker: true`, deploy, Tests, Conventions (proposta sopra; la scrive il coordinatore dopo l'approvazione) |

## Release plan
- **Percorso**: PR → CI verde → preview Vercel (staging Supabase, dati finti) → **Gate C** → merge su main = deploy di produzione + `migrate.yml` verso prod (environment `production` con approvazione). **Il merge deploya la produzione: sì.**
- **Prerequisiti una tantum** (richiedono approvazione esplicita al momento dell'esecuzione: creazione di servizi o account):
  1. Progetto Supabase **prod** e **staging** in `eu-central-1`. Su ciascuno: registrazione chiusa, OTP a 6 cifre, template (`supabase config push` o pannello), `site_url` e redirect consentiti.
  2. Progetto Vercel collegato al repo, regione funzioni `fra1`, variabili Preview → staging e Production → prod (§11), Deployment Protection sulle preview.
  3. Secret e variabili GitHub, environment `production` con revisore.
  4. Inserimento dell'email del primo partner in `private.founder_allowlist` (SQL editor prod).
  5. Dopo l'acquisto del dominio: account Resend, verifica del dominio (SPF, DKIM, DMARC), custom SMTP di Supabase prod verso Resend, `EMAIL_TRANSPORT=resend`, `EMAIL_FROM`.
- **Ordine delle migrazioni**: core → decisioni/Percorso → budget/notifiche, tutte additive. Sul primo rilascio il DB di produzione è vuoto: la migrazione parte al merge, e il codice gestisce comunque un DB senza matrimoni.
- **Rilascio in due tempi** (proposta P2):
  - **C1** infrastruttura e app in produzione per il solo Tony: email di accesso via SMTP integrato Supabase, consegnate solo ai membri dell'organizzazione, ed email dell'app spente;
  - **C2** dopo il dominio: Resend, invito a Jessica, cron dei promemoria attivo, verifica AC9.
- **Feature flag**: nessuno. L'esposizione è controllata da allowlist e invito; `EMAIL_TRANSPORT` fa da interruttore delle email dell'app.
- **Rollback**:
  - codice: Instant Rollback di Vercel al deploy precedente;
  - DB: le migrazioni sono additive, quindi il codice precedente resta compatibile; si corregge in avanti con una nuova migrazione, mai con drop in produzione senza approvazione;
  - dati: export JSON/CSV;
  - email: `EMAIL_TRANSPORT=none` sospende subito promemoria e inviti.
- **Controlli post-deploy**:
  1. login di Tony via link in un browser diverso e via codice;
  2. un'email non autorizzata non riceve nulla e non crea utenti (Supabase → Auth → Users);
  3. header `X-Robots-Tag` e `robots.txt`;
  4. esecuzione manuale del cron con `CRON_SECRET` → heartbeat registrato, visibile in Altro > Info;
  5. esecuzione manuale di `keepalive.yml` → verde su prod e staging;
  6. la preview usa lo staging (controllo dell'URL Supabase nelle impostazioni dell'ambiente Vercel);
  7. dopo C2: invito a Jessica ricevuto (indirizzo non membro), promemoria e riepilogo ricevuti una sola volta, link di disattivazione funzionante.

## Decisions
| # | Decision | By | Date |
|---|---|---|---|
| A1 | Stack Next.js App Router + TS su Vercel Hobby (`fra1`), Supabase in `eu-central-1`; RLS unico confine; chiave segreta solo in 3 percorsi server (ADR-0001) | architect (proposta) | 2026-11-23 |
| A2 | Primo account: allowlist in `private.founder_allowlist` (SQL nel pannello, mai nel repo) + creazione automatica dell'utente Auth solo per email autorizzate (allowlist o invito valido); registrazione Auth chiusa | architect | 2026-11-23 |
| A3 | Email: interfaccia `EmailSender` (smtp locale/CI, resend prod via `fetch`, none per preview); Supabase Auth usa Resend come custom SMTP in prod | architect | 2026-11-23 |
| A4 | Scenario di riferimento derivato nel DB (`sync_timeline` via trigger), aritmetica date duplicata TS/SQL con vettori di test condivisi | architect | 2026-11-23 |
| A5 | Migrazioni additive via GitHub Actions (`supabase db push`); deploy Vercel automatico al merge mantenuto | architect | 2026-11-23 |
| P1 | **Da approvare (sviluppatore)**, dipendenze e servizi nuovi. **Servizi** (tutti gratuiti): Vercel Hobby (1 progetto), Supabase free ×2 (prod, staging), Resend free (dopo il dominio, già deciso D12), GitHub Actions + Environment `production`. **npm runtime**: `next`, `react`, `react-dom`, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, primitive Radix via shadcn (`radix-ui`), `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, `vaul`, `react-day-picker` (porta `date-fns`), `tw-animate-css`, `nodemailer` (solo trasporto locale/CI). **npm dev**: `typescript`, `tailwindcss`, `@tailwindcss/postcss`, `eslint`, `eslint-config-next`, `prettier`, `prettier-plugin-tailwindcss`, `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@playwright/test`, `@axe-core/playwright`, `supabase` (CLI), `tsx`, `@types/node`, `@types/react`, `@types/nodemailer`. **CI**: immagine Docker di gitleaks. Nessuna migrazione distruttiva. **Modello di autenticazione/permessi nuovo** (A1, A2): richiede approvazione esplicita | developer | — |
| P2 | **question-for-developer**: rilascio in due tempi? Proposta: sì. C1 = produzione per il solo Tony con email di accesso via SMTP integrato Supabase (solo membri dell'organizzazione, deroga temporanea ad AC9 finché manca il dominio) ed email dell'app spente; C2 = dominio + Resend + invito a Jessica. Alternativa: nessun deploy in produzione fino al dominio | developer | — |
| P3 | **question-for-developer**: l'email di un partner che ha già accettato è la sua email di accesso e in R1 resta in sola lettura (cambiarla = cambiare il login, fuori scope); resta modificabile per B finché l'invito non è accettato (AC46). Proposta: sì | developer | — |
| P4 | **question-for-developer**: rito "Non lo so ancora" → solo tappe comuni a tutti i riti + tappa "Scegli il rito"; le specifiche arrivano come suggerimenti quando il rito è impostato. Proposta: sì | developer | — |
| P5 | **question-for-developer**: eliminare una categoria di budget che contiene voci richiede prima di spostarle in un'altra categoria (la UI offre "Sposta in…"); una categoria vuota si elimina con Annulla. Proposta: sì | developer | — |
| P6 | **question-for-developer** (minore): il partner B riceve promemoria e riepilogo solo dopo aver accettato l'invito (prima non ha account né preferenze). Proposta: sì | developer | — |
| P7 | Al designer: soglie delle fasi ("Adesso" = top 3 scaduti + entro 30 gg; "Prossimi 3 mesi" = 31–90 gg); testo della pagina "DB in pausa" (Risks R9); preferenze email solo promemoria/riepilogo (design.md §3.7 cita categorie "pagamenti", non previste dagli AC); rimuovere la data di nascita da design.md (D26) | designer | — |
| P8 | Temi approvati (`APPROVED_THEME_IDS`): da scegliere al Gate B (predefinito Giardino) | developer | — |

## Change log
| Date | Change | Why | Approved by |
|---|---|---|---|
| 2026-11-23 | Prima stesura del piano (F2) | — | — |

## Outcome
<!-- Filled at the end of F5: what shipped, where, when, deviations from the plan, follow-ups. -->
