# FEAT-2026-001 — R1 Fondamenta, onboarding guidato, Percorso e budget: piano di implementazione

<!-- Owner: architect. Approved at Gate B. Updated through the change log if the solution changes. -->

| Brief | Design | Size | Status |
|---|---|---|---|
| brief.md (approvato 2026-11-23, 52 AC attivi) | design.md (finale per il Gate B) | L | in discussion (F2 round 1 risposto) |

Identificatori di codice, tabelle e funzioni in inglese; testi, documentazione e interfaccia in italiano. ADR collegato: `docs/adr/0001-stack-auth-ambienti.md`. Le obiezioni F2 round 1 (PO-1..9, QA-1..17, DES-16..30) sono integrate qui; le risposte una per una sono in `log.md`.

## Current state
- **Repository greenfield**: contiene solo `README.md`, `.gitignore` e `.adf/`.
  - `.gitignore` esclude già `.env`, `.env*.local`, `.next/`, `coverage/`, `playwright-report/`, `test-results/`.
  - `git log`: 8 commit, tutti di documentazione ADF.
  - Non esistono `package.json` né `docs/`.
- **`.adf/project.md`**: `commands` tutti vuoti, `docker: false`. Deploy = preview Vercel per PR; merge su main = produzione (`merge_deploys_production: true`). Comandi di produzione protetti: `vercel --prod`, `vercel deploy --prod`, `vercel promote`.
- **Toolchain locale verificata**: Node v24.21.0 e npm presenti; Docker presente (`~/.docker/bin/docker`). Mancano pnpm e la CLI Supabase; la CLI entrerà come devDependency npm, senza installazioni globali.
- **Vincoli approvati**: brief D1–D28 e risposte in `log.md`:
  - solo Supabase per dati, auth e storage;
  - Resend come unico fornitore email, dal dominio della coppia (non ancora acquistato);
  - sviluppo interamente locale con Docker;
  - accesso solo su invito;
  - un progetto Vercel, con le preview collegate a Supabase di staging.

## Solution

### 1. Architettura in sintesi
- **Stack**: Next.js (App Router, ultima 16.x stabile) + React 19 + TypeScript strict, ospitato su Vercel Hobby.
  - È il progetto unico per UI, server action, route handler (accesso, invito, cron, disattivazione email, pagina servizio) e header di sicurezza.
- **Backend**: Supabase (Postgres + Auth) è l'unico backend. **RLS e permessi di colonna sono l'unico confine di autorizzazione.**
  - Ogni lettura e scrittura dell'utente passa con il suo JWT tramite `@supabase/ssr`, da server component, server action o client.
  - API esposta solo sullo schema `public`: `graphql_public` e `private` non sono esposti.
- **Chiave segreta Supabase** (`sb_secret_…`, ex service role): esiste solo in `src/lib/supabase/admin.ts`, marcato `server-only`. Serve esattamente a 3 percorsi:
  1. `requestSignIn`: limitatore e creazione dell'utente Auth per un'email autorizzata;
  2. il job giornaliero;
  3. la disattivazione email da link firmato.
- **Pattern applicativo**:
  - **letture**: server component con rendering dinamico. Nessuna `'use cache'`, `unstable_cache` o cache condivisa sui dati utente; una regola di lint la vieta nelle aree autenticate e ha un test con fixture che deve fallire;
  - **scritture**: server action con zod al confine;
  - **client**: `useOptimistic` + `revalidatePath`;
  - **transizioni con invarianti**: funzioni Postgres (RPC) atomiche. Il resto è CRUD diretto, limitato dalla **matrice delle scritture** (§3.1) imposta nel DB.
- **Logica di dominio**: funzioni TypeScript pure in `src/domain/*`, senza I/O. **Ogni funzione che dipende dal tempo riceve `today`/`now` come parametro** (§1.1).
- **Regione**: Supabase `eu-central-1`, funzioni Vercel `fra1`.

### 1.1 Orologio iniettabile (QA-2)
- **Regola**: le funzioni pure non chiamano mai `Date.now()`. Esempi: `groupTasks(tasks, today)`, `countdown(ref, today)`, `nextSteps(…, today)`, `exportReminder(lastExport, today)`, `newsSince(…)`, `planReminders(…, today)`, `planDigest(…, today)`.
- **`src/lib/clock.ts`** espone `getNow()` lato server:
  - di norma restituisce l'ora reale;
  - legge il cookie `r2y-test-now` (ISO) **solo** se `process.env.E2E_CLOCK === '1'` e `process.env.VERCEL` non è definita.
  - `next start` imposta comunque `NODE_ENV=production`, quindi la guardia non si basa su `NODE_ENV`.
  - Un test unitario verifica che con `VERCEL=1` il cookie venga ignorato.
  - `E2E_CLOCK` non è mai definita nelle variabili Vercel (voce della checklist di rilascio).
- **Job**: `runDailyJob({ clock, sender, db, caps })`; la route `/api/cron/daily` è un involucro sottile. I test d'integrazione chiamano `runDailyJob` direttamente, a qualunque data.
- **E2E**:
  - le spec dipendenti dal tempo impostano il cookie per il server e `page.clock` per il browser sullo stesso istante;
  - girano in un progetto Playwright **seriale** dedicato (`time`).
- **Tempo del DB** (scadenza inviti, età dei token, claim scaduti): si testa spostando i timestamp con `update … set expires_at = …` come superuser nei test, mai aspettando.

### 2. Struttura del repository
```
src/
  app/
    layout.tsx                    # html lang="it", data-theme (DB → cookie r2y-theme → giardino), script modo, noindex
    robots.ts, manifest.ts, globals.css, themes.css (generato), global-error.tsx (autosufficiente)
    (public)/accesso/… (public)/auth/conferma/… (public)/invito/[token]/… (public)/su-invito/…
    (public)/email/disattiva/…  (public)/servizio/…  # pagina "in pausa" / "non raggiungibile"
    onboarding/…
    (app)/layout.tsx (AppNav), (app)/page.tsx (Home), (app)/{percorso,scelte,budget,altro}/…
    api/cron/daily/route.ts
  proxy.ts                        # sessione (getClaims) + redirect non autenticati + servizio non disponibile
  lib/supabase/{server,client,admin,errors,versioned-update}.ts, database.types.ts (generato)
  lib/email/{types,index,smtp,resend,unsubscribe-token,escape}.ts, lib/email/templates/*.ts
  lib/dates/plain-date.ts, lib/money.ts, lib/clock.ts, lib/display-name.ts, lib/app-config.ts (APP_NAME)
  domain/{timeline,budget,home,reminders,export,news}/*
  content/milestones/{schema,it}.ts, content/budget-categories.ts, content/style-tips.ts
  themes/{catalogue,approved,contrast}.ts
  components/ui/* (shadcn), components/* (condivisi, T3)
  features/{auth,invitations,onboarding,settings,timeline,decisions,budget,home,appearance,notifications,export,jobs}/*
supabase/ config.toml, migrations/*.sql, seeds/NN_*.sql, templates/*.html, tests/*.test.sql
tests/integration/** (developer), tests/acceptance/** (qa), tests/fixtures/*
e2e/** (qa), e2e/support/mailbox.ts (T6)
scripts/{gen-themes-css,check-font-budget,keepalive-check}.ts
.github/workflows/{ci,migrate,keepalive}.yml, vercel.json, docs/**
```

### 3. Modello dati
Migrazioni additive. Schema `public` esposto con RLS su tutto; schema `private` non esposto.

**Convenzioni comuni**
- **Appartenenza**: ogni tabella di dominio ha `wedding_id uuid not null`.
- **Composite FK** (QA-7g): ogni tabella padre ha `unique (id, wedding_id)`. I figli referenziano `(parent_id, wedding_id)`: per esempio `decision_options(decision_id, wedding_id) → decisions(id, wedding_id)`. Così un figlio non può mai puntare a un padre di un altro matrimonio.
- **Tabelle modificabili**: hanno `version`, `created_at`, `created_by`, `updated_at`, `updated_by`.
  - Il trigger `private.bump_version()` fa `version+1`, `updated_at`, `updated_by = auth.uid()`.
  - Il trigger `private.guard_row()` rende immutabili `id`, `wedding_id`, `created_at`, `created_by` (eccezione se cambiano).
  - `created_by` è forzato a `auth.uid()` all'insert.
- **Tipi**: importi `bigint` in centesimi con `check (>= 0)` e un tetto di 100.000.000.000 centesimi (1 miliardo di euro); date di calendario come `date`; enum come `text` + `check`.

**Identità, spazio, ruoli** (migrazione core, T2)

| Tabella | Colonne chiave | Note |
|---|---|---|
| `weddings` | `id`, `rite` (`civile`/`cattolico_civile`/`simbolico`/null), `guest_band`, `style_label`, `style_note`, `region`, `comune`, `theme_id text default 'giardino'`, `onboarding_answers jsonb`, `onboarding_unknown text[]`, `onboarding_completed_at`, `manual_reference_option_id uuid null`, `applied_reference_date date null`, versione | Un matrimonio = uno spazio |
| `wedding_partners` | `wedding_id`, `slot` (`A`/`B`), `label`, `first_name`, `last_name`, `email citext`, `user_id uuid null` | Partner generici (AC46), **nessuna data di nascita**. La riga B è **facoltativa**: l'onboarding può saltarla (PO-8d). `unique(wedding_id, slot)`. Un trigger rifiuta il cambio di `email` se `user_id` non è nullo (P3) e revoca l'eventuale invito pendente se cambia l'email di B |
| `memberships` | `wedding_id`, `user_id`, `role` (`partner`/`family`/`planner`), `partner_slot` | PK `(wedding_id, user_id)`. `check ((role='partner') = (partner_slot is not null))` + `unique(wedding_id, partner_slot)` = **max 2 partner garantito da un vincolo** |
| `private.role_permissions` | `role`, `area`, `action` | Aree: `wedding`, `invitations`, `decisions`, `tasks`, `budget`, `history`, `export`. In R1 solo `partner` (read+write) |
| `private.founder_allowlist` | `email citext pk`, `consumed_at`, `wedding_id` | Riga SQL inserita dallo sviluppatore nel pannello, mai nel repo |
| `private.signin_attempts` | `email_hash bytea`, `at` | Limitatore applicativo per email (QA-4) |
| `invitations` | `wedding_id`, `slot='B'`, `email`, `token_hash bytea unique`, `expires_at`, `revoked_at`, `accepted_at`, `accepted_by`, `last_sent_at`, `send_count` | Un solo invito pendente per matrimonio (indice parziale). `token_hash` non leggibile (privilegi di colonna) ed **escluso dall'audit** |
| `user_wedding_state` | `user_id`, `wedding_id`, `last_seen_at`, `previous_seen_at`, `last_export_at`, `welcome_dismissed_at` | Novità, export, carta di benvenuto (DES-20) |
| `audit_log` | `id bigserial`, `wedding_id`, `table_name`, `record_id`, `action`, `actor_id`, `at`, `old`, `new` | Scritto solo da `private.audit_capture(excluded_columns…)`, che riceve via `TG_ARGV` le colonne da escludere: `token_hash` e simili (QA-7d) |
| `heartbeats` | `id`, `source`, `ran_at`, `details jsonb` (solo conteggi e flag `quota_exceeded`) | Nessuna policy client |

**Funzione di autorizzazione**
- `private.has_permission(wedding_id, area, action)`: SECURITY DEFINER, STABLE, `set search_path = ''`, usa `(select auth.uid())`.
- Ogni policy ha la forma `using (has_permission(wedding_id,'<area>','read'))` / `with check (… 'write')`.
- Un'appartenenza con ruolo `family` o `planner` senza righe in `role_permissions` non legge nulla (test).

**Immutabilità**
- `decision_events`, `budget_versions`, `audit_log`: trigger `private.forbid_mutation()` BEFORE UPDATE/DELETE per qualunque ruolo, chiave segreta inclusa.
- Nessuna eliminazione fisica di matrimoni in R1 (BR11). I trigger bloccherebbero anche i delete a cascata, ed è voluto: i test non cancellano dati, usano dati unici per test.

**Decisioni, scenari, Percorso** (migrazione T8)

| Tabella | Colonne chiave | Note |
|---|---|---|
| `decisions` | `wedding_id`, `type text`, `question`, `status` (`open`/`decided`), `chosen_option_id`, `decided_by`, `decided_at`, versione | Indice unico parziale `(wedding_id, type)` per `date`/`location`. Create da `create_wedding`. Generica (AC23) |
| `decision_options` | `decision_id`, `wedding_id`, `label`, `notes`, `url`, `pros`, `cons`, `indicative_cost_cents`, `attributes jsonb`, `status` (`candidate`/`chosen`/`discarded`), `deleted_at`, versione | `status` forzato a `candidate` all'insert e modificabile solo da RPC. L'opzione scelta non si può cancellare |
| `date_scenarios` | `option_id`, `wedding_id`, `kind` (`fixed`/`period`), `date_from`, `date_to` | Sottotipo delle opzioni della decisione `date`. Un trigger verifica che l'opzione appartenga alla decisione `date` dello stesso matrimonio |
| `decision_events` | `decision_id`, `wedding_id`, `kind` (`option_added`/`option_updated`/`option_removed`/`chosen`/`reopened`/`note`/`reference_set`/`reference_auto`), `option_id`, `reason`, `payload`, `actor_id`, `at` | Append-only. Scritto solo da trigger e RPC |
| `option_reactions` | `option_id`, `user_id`, `wedding_id`, `reaction` | `with check (user_id = auth.uid())` |
| `tasks` | `wedding_id`, `title`, `advice`, `notes`, `category`, `due_date`, `assignee` (`both`/`A`/`B`), `reminders_enabled` (vedi Q9), `status`, `completed_at`, `completed_by`, `source`, `template_key`, `template_version`, `offset_months`/`offset_weeks`/`offset_days`, `priority`, `highlight_first`, `bureaucratic`, `due_overridden`, `needs_review`, `deleted_at`, `deleted_by`, versione | `unique(wedding_id, template_key)`. L'eliminazione è sempre logica, quindi la tappa resta marcata e non viene rigenerata |
| `task_suggestion_dismissals` | `wedding_id`, `template_key`, `kind`, `dismissed_at` | "Ignora" (AC16) |

**Budget e notifiche** (migrazione T9)

| Tabella | Colonne chiave | Note |
|---|---|---|
| `budget_versions` | `wedding_id`, `total_cents`, `reason`, `created_by`, `created_at` | Append-only |
| `budget_categories` | `wedding_id`, `name`, `allocated_cents`, `sort_order`, `deleted_at`, versione | Cancellazione logica rifiutata se ha voci non cancellate (P5, vedi Q4) |
| `budget_items` | `(category_id, wedding_id)` FK, `description`, `estimated_cents`, `status`, `agreed_cents`, `notes`, `deleted_at`, versione | |
| `payments` | `(item_id, wedding_id)` FK, `kind`, `amount_cents`, `due_date`, `paid`, `paid_on`, `deleted_at`, versione | |
| `notification_preferences` | `user_id pk`, `reminders_enabled`, `digest_enabled` | Solo il proprio utente |
| `notification_log` | `user_id`, `wedding_id`, `kind` (`task_7d`/`task_due`/`digest`), `task_id`, `due_date`, `period_key`, `batch_key`, `status` (`claimed`/`sent`/`failed`/`skipped_quota`), `claimed_at`, `attempts`, `provider_message_id`, `error_code`, `sent_at` | `unique(user_id, kind, task_id, due_date)`, `unique(user_id, kind, period_key)`. Nessuna policy client |

### 3.1 Matrice delle scritture (QA-1)
Ciò che il ruolo `authenticated` può scrivere direttamente via PostgREST. Tutto il resto passa da RPC o trigger. I privilegi di colonna (`grant update (col, …)`) sono la prima difesa, i trigger la seconda.

| Tabella | Scrittura diretta consentita | Solo via RPC/trigger | Protezioni nel DB |
|---|---|---|---|
| `weddings` | UPDATE `rite`, `guest_band`, `style_label`, `style_note`, `region`, `comune`, `theme_id`, `onboarding_answers`, `onboarding_unknown` | INSERT (`create_wedding`), `onboarding_completed_at` (`complete_onboarding`), `manual_reference_option_id` (`set_reference_scenario`), `applied_reference_date` (`sync_timeline`); nessun DELETE | grant di colonna, `guard_row`, `check theme_id ~ '^[a-z-]+$'` |
| `wedding_partners` | UPDATE `label`, `first_name`, `last_name`, `email` | INSERT (`create_wedding`, `complete_onboarding`, `upsert_partner_b`), `user_id` (`accept_pending_invitation`) | trigger: email immutabile se `user_id` non nullo; revoca dell'invito al cambio email di B |
| `memberships` | nessuna | `create_wedding`, `accept_pending_invitation` | nessun grant |
| `invitations` | nessuna (SELECT senza `token_hash`) | `create_invitation`, `rotate_invitation`, `revoke_invitation` | grant di colonna su SELECT |
| `decisions` | UPDATE `question` | `status`, `chosen_*`, `decided_*` via `choose_option`/`reopen_decision` | grant di colonna |
| `decision_options` | INSERT/UPDATE `label`, `notes`, `url`, `pros`, `cons`, `indicative_cost_cents`, `attributes`, `deleted_at` | `status` (RPC) | trigger: `status='candidate'` all'insert, scelta non cancellabile, evento automatico |
| `date_scenarios` | INSERT/UPDATE `kind`, `date_from`, `date_to` | — | trigger: solo opzioni della decisione `date`; `check` sul periodo |
| `decision_events` | nessuna | trigger e RPC (`add_decision_note`) | `forbid_mutation`, nessun grant |
| `option_reactions` | INSERT/UPDATE/DELETE la propria | — | `with check (user_id = auth.uid())` |
| `tasks` | INSERT con `source='user'`; UPDATE `title`, `notes`, `category`, `due_date`, `assignee`, `reminders_enabled`, `status`, `deleted_at` | INSERT template (`insert_template_tasks`, `complete_onboarding`), `needs_review` (`acknowledge_task_review`, `reopen_decision`, `choose_option`) | trigger: `due_date` cambiata su un compito template fuori da `sync_timeline` → `due_overridden = true`; `status` → `completed_at/by`; `deleted_at` → `deleted_by`; `source`, `template_*`, offset, `priority`, `highlight_first` immutabili |
| `task_suggestion_dismissals` | INSERT | — | — |
| `budget_versions` | INSERT `total_cents`, `reason` | — | `created_by` forzato, `forbid_mutation` |
| `budget_categories` / `budget_items` / `payments` | INSERT/UPDATE delle colonne di business + `deleted_at` | — | composite FK, `check >= 0`, trigger P5 |
| `notification_preferences` | INSERT/UPDATE la propria riga | (job: lettura con chiave segreta) | `with check (user_id = auth.uid())` |
| `user_wedding_state` | nessuna | `record_seen`, `record_export`, `dismiss_welcome` | nessun grant |
| `audit_log`, `heartbeats`, `notification_log`, `private.*` | nessuna | trigger e job | nessun grant |

- **Contesto del ricalcolo**: `sync_timeline` esegue `set_config('app.timeline_sync','on', true)` (locale alla transazione). Il trigger dei compiti lo usa per distinguere il ricalcolo dalla modifica manuale. `set_config` non è esposto via API.
- **Funzioni `public` con EXECUTE per `authenticated`**: allowlist esplicita, verificata da un test: `create_wedding`, `complete_onboarding`, `accept_pending_invitation`, `create_invitation`, `rotate_invitation`, `revoke_invitation`, `upsert_partner_b`, `choose_option`, `reopen_decision`, `add_decision_note`, `set_reference_scenario`, `acknowledge_task_review`, `insert_template_tasks`, `record_seen`, `record_export`, `dismiss_welcome`, `last_heartbeat`.
- **Funzioni per `anon`**: nessuna.
- **Solo ruolo con chiave segreta**: `public.record_heartbeat(source)` (involucro di `private`, QA-7c), `public.signin_gate(email)` (limitatore + diritto, §4), `public.job_*` (letture e claim del job).

**Funzioni RPC principali** (tutte `set search_path = ''`)
- **`create_wedding()`**: allowlist non consumata, nessuna appartenenza, nessun invito pendente per l'email (BR13). Crea il matrimonio, il partner A, l'appartenenza, le decisioni `date`/`location` e lo stato utente. La consumazione dell'allowlist con `for update` rende un doppio invio innocuo (QA-6).
- **`complete_onboarding(payload)`**: SECURITY INVOKER, transazione unica, partner B facoltativo; rifiuta se l'onboarding è già completo.
- **`accept_pending_invitation()`**: restituisce i codici `ok`/`expired`/`revoked`/`used`/`email_mismatch`/`full`/`already_member`.
- **`choose_option(option_id, expected_version, exact_date date default null)`**: con `exact_date` un periodo diventa data fissa prima della scelta, se Q7 è approvata.
- **`reopen_decision(decision_id, reason, expected_version)`**: motivo obbligatorio. **Le opzioni `discarded` tornano `candidate`** (PO-1). Lo scenario scelto diventa riferimento manuale "provvisorio". `needs_review` sui compiti dipendenti dalla data.
- **`set_reference_scenario(option_id | null)`**: `null` significa "torna automatico" (DES-18). Scrive gli eventi `reference_set`/`reference_auto`. È rifiutata con decisione presa.
- **`private.sync_timeline(wedding_id)`**: invocata da trigger (`UPDATE OF` colonne specifiche, guardia `pg_trigger_depth()`).
- **`private.add_date_offset(...)`**.

### 4. Accesso e invito (AC1–AC9)
1. **Registrazione chiusa** (`enable_signup = false`).
   - **`supabase/config.toml` vale solo per il locale e la CI** (QA-3): contiene limiti di invio email e OTP alti per i test.
   - Staging e produzione si configurano **dal pannello**, seguendo una checklist versionata nel runbook: registrazione chiusa, OTP 6, `max_frequency` 30 s, template, redirect, SMTP.
   - **Non si usa `supabase config push`**, così i valori di test non arrivano mai in remoto.
2. **Richiesta di accesso** (`requestSignIn(email)`):
   - (a) zod;
   - (b) `signin_gate(email)` con la chiave segreta: registra il tentativo per `sha256(email)` e applica un limite **uguale per qualunque email** (1 ogni 30 s, 5 all'ora); dice anche se l'email è autorizzata (allowlist non consumata o invito valido);
   - (c) se l'email è autorizzata e non esiste un utente, `auth.admin.createUser({ email, email_confirm: true })`;
   - (d) `signInWithOtp({ shouldCreateUser: false })`;
   - (e) **risposta**: sempre il messaggio neutro, oppure, per qualunque email oltre il limite applicativo, lo stesso testo "Hai chiesto troppe email. Riprova tra qualche minuto."
   - Un 429 del provider viene mappato sullo stesso testo generico.
   - **Rischio residuo documentato**: il limite di invio di Supabase Auth è per progetto. Se fosse raggiunto, solo le email esistenti riceverebbero il messaggio di limite. È improbabile con il limitatore applicativo più stretto (R17).
   - Il parametro `next=` accetta solo percorsi relativi che iniziano con `/` e non con `//` (QA-4).
3. **Email di accesso**:
   - template Supabase con codice a 6 cifre e link `/auth/conferma?token_hash=…&type=email`;
   - la pagina di conferma verifica **in POST** (pulsante "Entra"), così gli scanner dei link non bruciano il token;
   - il codice si verifica in `/accesso` (`autocomplete="one-time-code"`, `inputmode="numeric"`).
4. **Dopo l'accesso**, in quest'ordine:
   1. appartenenza → home o ripresa dell'onboarding;
   2. `accept_pending_invitation()` = `ok` → spazio invitante;
   3. email in allowlist → `create_wedding()` + onboarding;
   4. altrimenti `/su-invito`.
5. **Invito**:
   - il token è di 32 byte casuali; nel DB c'è solo lo `sha256`;
   - creazione, rotazione ("Invia di nuovo") e revoca passano da RPC;
   - l'email parte via `EmailSender` (§7), con "Copia link" sempre disponibile;
   - `/invito/[token]` mostra lo stato (design §7.2) e porta al login con l'email precompilata. L'accettazione la fa sempre il DB.
6. **Primo account**: lo sviluppatore esegue una volta `insert into private.founder_allowlist(email) values ('…')` nel SQL editor di produzione (runbook). In locale la seed usa solo `@example.test`.
7. **Uscita**: azione `signOut` (server action T7) con pulsante "Esci" in Altro (T15), se Q12 è approvata. Dopo l'uscita il tasto Indietro non mostra dati: pagine dinamiche, `Cache-Control: no-store`.
8. **Proxy e header**:
   - `src/proxy.ts` usa `getClaims()` (verifica locale del JWT, nessuna chiamata di rete nel caso normale) e reindirizza le route non pubbliche a `/accesso` (AC1);
   - in caso di **errore di rete o 540 non reindirizza**: riscrive su `/servizio?motivo=paused|unreachable` (DES-16, §9);
   - header globali: `X-Robots-Tag: noindex, nofollow`, `robots.txt`, `frame-ancestors 'none'`, CSP di base, `Referrer-Policy: strict-origin-when-cross-origin` e `no-referrer` su `/invito/*`, `/auth/*`, `/email/*`.

### 5. Motore del Percorso (AC15, AC16, AC20, AC24–AC32, AC48)
- **Contenuti**: il modello di tappe viene da una **specifica del product-owner** (task T0, PO-9) e si traduce in `src/content/milestones/it.ts`, validato da zod.
  - Campi: `key`, `version`, `title`, `advice`, `category`, `offset|null`, `rites`, `priority`, `highlightFirst`, `bureaucratic`.
  - La tappa "Scegli il rito" (se Q3 è approvata) ha `highlightFirst` e nessun offset.
- **Aritmetica di sole date**:
  - prima i mesi, con adeguamento a fine mese; poi settimane e giorni;
  - stessa regola in SQL (`private.add_date_offset`);
  - **vettori condivisi** `tests/fixtures/date-offset-vectors.json` per Vitest e pgTAP: fine mese, 29/02/2028, offset negativi, 28/03/2027 e 31/10/2027 (cambi d'ora);
  - le suite di date girano anche con `TZ=UTC` e `TZ=America/Los_Angeles` (QA-17).
- **Riferimento** (AC24, D28): con la decisione presa vale lo scenario scelto ("definitivo"). Altrimenti vale lo scenario manuale aperto, se esiste ("provvisorio · scelto da {nome}"). Altrimenti il più vicino aperto per `date_from` ("provvisorio"). Senza scenari non c'è riferimento.
  - La riapertura conserva lo scenario come manuale provvisorio.
  - "Torna automatico" = `set_reference_scenario(null)`.
- **Ricalcolo** (AC28): si aggiornano solo i compiti template con offset, `todo`, non `due_overridden`, non eliminati. Con riferimento nullo, i compiti dipendenti dalla data hanno `due_date` null e non sono mostrati (AC15).
- **Riapertura della data** (AC20): `needs_review` sui compiti dipendenti; viene azzerato da scelta o "Va bene così".
- **Anteprima** (AC32, DES-28): stato nell'URL `?anteprima=<id>`, calcolo puro `previewDueDates`, nessuna scrittura.
  - Calcola anche il numero di scadenze che cambiano.
  - Si chiude da sola se lo scenario sparisce.
  - Nessun banner se lo scenario è già il riferimento.
- **Suggerimenti** (AC16, AC48): `diffSuggestions(template, wedding, tasks incl. eliminati, dismissals)`. "Accetta nuova" → `insert_template_tasks`; "accetta non pertinente" → cancellazione logica; "Ignora" → dismissal.
- **Fasi** (AC29, AC30; design §3.4, DES-27, PO-3), `groupTasks(tasks, today)`:
  - **Adesso** = (a) fino a 3 tappe `highlightFirst` scadute, (b) scadenza tra oggi e +30 giorni, (c) tappe `highlightFirst` senza scadenza; prime 5 righe + "Mostra tutte (N)";
  - **Da recuperare** = le altre scadute, per priorità;
  - **Prossimi 3 mesi** = da +31 a +90 giorni;
  - **Più avanti** = oltre o senza data;
  - **Fatti**.
- **Novità sul riferimento** (DES-19): i cambi di `weddings.applied_reference_date` sono nella whitelist di `domain/news`, con l'autore dell'azione che li ha causati (audit). Sul Percorso compare la striscia "Scadenze ricalcolate".
- **Prossimo passo** (AC27): `nextSteps(…, today)`.

### 6. Budget (AC33–AC38)
- **Totale** = ultima versione.
- **Calcoli**: `src/domain/budget/totals.ts` (funzioni pure).
- **Avvisi** (`warnings.ts`):
  - Concordato > Assegnato (categoria);
  - Concordato > totale;
  - Pagato > Concordato (conferma);
  - totale ridotto sotto il Concordato;
  - **Assegnato > totale**, mostrato come "Hai assegnato € X oltre il totale" con lo stesso tono caldo, mai come numero negativo (PO-7).
- **Importi** (`src/lib/money.ts`): parsing **dalla stringa in centesimi interi**, mai `parseFloat * 100`. Regole proposte in Q10; tetto massimo; `inputmode="decimal"` verificato da un test di componente.
- **Categorie con voci**: per eliminarle prima si spostano le voci ("Sposta in…"); l'importo assegnato torna "non assegnato" (Q4).

### 7. Email: interfaccia unica, job, promemoria (AC9, AC44, AC50–AC53)
- **Interfaccia** `EmailSender.send({ to, subject, html, text, headers, idempotencyKey })`, con il trasporto scelto da `EMAIL_TRANSPORT`:
  - `smtp`: mail catcher locale;
  - `resend`: `fetch` + `Idempotency-Key`;
  - `none`.
- **Template** (DES-25):
  - funzioni TS con firme esplicite (es. `inviteEmail({ inviterName, inviteeName, expiresOn, link })`);
  - **escape HTML obbligatorio** (`lib/email/escape.ts`) e rimozione di `\r\n` da oggetto e intestazioni;
  - stili inline, preheader, versione testo; nome dell'app da `APP_NAME` (Q15);
  - promemoria calcolati su riferimento provvisorio: la riga "scadenza calcolata sulla data provvisoria" (PO-6);
  - email Supabase Auth: palette Giardino statica.
- **Job giornaliero**: Vercel Cron `0 5 * * *` UTC → `runDailyJob({ clock, sender, db, caps })`.
  1. `record_heartbeat('vercel_cron')`.
  2. `planReminders(today)`: elementi per (utente, compito, tipo).
     - `task_7d` quando `due-7 ≤ oggi < due`, con recupero **solo** per esecuzioni del cron saltate (finestra da `due-7` all'ultimo heartbeat riuscito);
     - `task_due` solo `oggi == due`;
     - destinatari per assegnatario; solo partner con account (Q5) e promemoria attivi;
     - se Q8 è approvata, nessun `task_7d` per compiti la cui scadenza è stata impostata o cambiata dentro la finestra.
  3. **Raggruppamento** (se Q8 è approvata, default del piano): **una sola email al giorno per utente**, con i blocchi "tra 7 giorni" e "oggi", max 5 righe + "e altri N" (design §7.2). Il log resta per elemento, con `batch_key = hash(user, data, 'reminders')` come chiave di idempotenza dell'email.
  4. **Riepilogo** (AC51): il lunedì (Europe/Rome); se il lunedì è saltato, alla prima esecuzione utile **da lunedì a mercoledì** (Q11); una volta per settimana ISO (`period_key`, vettori 2026-W53/2027-W01); vuoto = nessuna email.
  5. **Claim e invio** (QA-5):
     - `insert … on conflict do nothing returning`; solo chi ottiene il claim invia;
     - poi `sent`; in caso di errore `failed`;
     - un claim `claimed` più vecchio di 15 minuti (crash tra claim e invio) è ripreso **con la stessa `batch_key`**, e l'idempotenza di Resend (24 h) evita il doppio invio;
     - `failed` viene ritentato solo dentro la finestra.
  6. **Tetti**: `EMAIL_DAILY_CAP` 50, `EMAIL_MONTHLY_CAP` 1.500, contano **solo** le email dell'app.
     - Le email di Supabase Auth sono limitate a parte dal limite di invio orario del progetto, impostato nel pannello a 10/h.
     - Calcolo documentato: 50/giorno app + max ~10/giorno auth realistici < 100/giorno Resend.
     - Oltre il tetto: `skipped_quota`, flag in `heartbeats.details`, segnalato dal controllo settimanale.
- **Disattivazione**:
  - token HMAC-SHA256 (`EMAIL_LINK_SECRET`) su `user_id` + tipo, confronto a tempo costante;
  - GET non cambia nulla; POST, anche one-click senza sessione, aggiorna solo quell'utente;
  - header `List-Unsubscribe` e `List-Unsubscribe-Post`.
- **Controllo settimanale** (`keepalive.yml`, lunedì 07:00 UTC + manuale):
  - esegue `scripts/keepalive-check.ts`, con logica e soglie testate da unit test (QA-14);
  - chiama `rpc/record_heartbeat` su staging e prod;
  - fallisce, con email di GitHub, se l'heartbeat del cron di prod ha più di 36 h o se c'è `quota_exceeded`;
  - nei log stampa solo gli stati HTTP.

### 8. Temi (AC49, design §5.4)
- **Catalogo**: `catalogue.ts` (12 temi) e `approved.ts` (`APPROVED_THEME_IDS`, Q6, default `giardino`).
- **`themes.css` generato** con selettori **`[data-theme="id"]` e `[data-theme="id"][data-mode="dark"]`, senza `:root`** (DES-21), più `--font-heading`/`--font-body`.
- **Applicazione** (DES-16a): il root layout legge `theme_id` in `try/catch`, con ripiego sul cookie `r2y-theme` e poi su `giardino`. Il cookie viene aggiornato al salvataggio del tema (T15).
- **Script inline** che imposta `data-mode` e `<meta name="theme-color">`.
- **Font** (DES-22):
  - solo i temi approvati sono dichiarati; `latin`, `swap`, `preload: false`;
  - titoli 1 peso, corpo 400+600;
  - `scripts/check-font-budget.ts` in CI: ≤ 4 file woff2 e ~120 KB per tema;
  - nella galleria si carica solo il font dei titoli delle carte; `document.fonts.load()` (max 1,5 s) prima dell'anteprima;
  - piano B: `next/font/local` con preload dei 2 file, se l'LCP misurato supera 2,5 s.
- **Test di contrasto** (QA-13, DES-24):
  - `contrast.ts` è testato contro vettori WCAG noti (21:1, soglie 4,5 e 3,0, parsing hex, alfa rifiutato);
  - il test di gate legge **`themes.css` generato** per i temi approvati, chiaro e scuro. Coppie: tutte quelle di design §5.2 più foreground/muted, mutedForeground/card, primary/muted, input/muted, ring/background, semantici su background/card/muted;
  - **regola "accent solo su background e card"**: `accent` su `muted` scende a 2,7:1;
  - lint: niente classi `text-accent`;
  - report non bloccante sui 12 candidati;
  - axe `color-contrast` nel job notturno per temi approvati × chiaro/scuro × 3 schermate.

### 9. Concorrenza, novità, stati (AC39–AC41)
- **Conflitti**: `versioned-update.ts` restituisce `{ conflict, current, changedBy, changedAt }`. Il `ConflictDialog` (T3) riceve una **mappa campo→etichetta** per entità (`features/*/field-labels.ts`, DES-29), con focus trap annidato sopra gli sheet.
- **Novità** (AC41): `record_seen()` sposta `last_seen_at` in `previous_seen_at`. Se `previous_seen_at` è nullo (prima visita), al posto delle Novità compare la **carta di benvenuto** (`WelcomeCard`, chiusa con `dismiss_welcome`, DES-20).
- **Servizio non disponibile** (DES-16, Q13):
  - `src/lib/supabase/errors.ts` → `classifyDbError()` con due esiti: `paused` (HTTP 540 / risposta "project paused") e `unreachable` (rete, timeout, altri 5xx);
  - proxy e root layout non reindirizzano al login in questi casi: riscrivono su `/servizio?motivo=…`, pagina **senza accesso al DB** (`PublicShell` + `ServiceDownPage`, tema da cookie) con testi di design §7.3;
  - `global-error.tsx` è autosufficiente (stili inline minimi, nessun import di dati);
  - offline: banner + `useFormDraft`.

### 10. Esportazione (AC42)
- **Generazione**: lato client con query RLS; JSON con `schemaVersion: 1` (senza data di nascita, senza `token_hash`).
- **CSV**: `compiti.csv` e `budget.csv` con `;`, BOM, escaping RFC 4180.
- **File**: 3 download separati con data nel nome.
- **Promemoria**: `record_export()` aggiorna la data dell'ultimo export, usata per il promemoria a 30 giorni.

### 11. Ambienti e configurazione
| Variabile | Locale | Preview (Vercel) | Production (Vercel) |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | stack locale | staging | prod |
| `SUPABASE_SECRET_KEY` (server-only) | locale | staging | prod |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | da `VERCEL_BRANCH_URL` | URL prod |
| `EMAIL_TRANSPORT` | `smtp` | `none` | `none` → `resend` dopo il dominio |
| `SMTP_HOST`/`SMTP_PORT` | mail catcher | — | — |
| `RESEND_API_KEY`, `EMAIL_FROM` | — | — | dopo il dominio |
| `EMAIL_DAILY_CAP`, `EMAIL_MONTHLY_CAP` | 50/1500 | — | 50/1500 |
| `CRON_SECRET`, `EMAIL_LINK_SECRET` | finti | casuali | casuali |
| `E2E_CLOCK` | solo e2e/CI | **mai** | **mai** |

- **Supabase remoto** (pannello, checklist): `site_url`, redirect consentiti (staging: `https://*-<slug>.vercel.app/**`), registrazione chiusa, OTP 6, `max_frequency` 30 s, limite di invio email 10/h, template, SMTP Resend (prod dopo il dominio).
- **Staging fino al dominio**: SMTP integrato (solo membri dell'organizzazione). **Account di smoke dello staging** = un indirizzo membro dell'organizzazione dello sviluppatore, con allowlist solo sullo staging e dati finti (Q13).
- **Vercel**: Deployment Protection sulle preview, regione `fra1`.
- **GitHub**: secret e variabili per i due progetti; environment `production` con revisore.

### 12. CI e migrazioni (QA-9)
- **`ci.yml`, job su ogni PR**:
  - **`checks`**: lint (incluse guardie `use cache`, `text-accent` ed email solo `@example.test` in tutto il repo), typecheck, unit (anche con `TZ` alternativi), allineamento di `themes.css` e `database.types.ts`, budget dei font;
  - **`db`**: `supabase start` (servizi esclusi; i nomi `-x` vanno verificati sulla versione CLI bloccata, `analytics` disattivato in config), `db reset` una volta, pgTAP (developer + QA), integration e acceptance Vitest (`fileParallelism: false` dove si leggono stati globali);
  - **`e2e-mobile`**: Chromium 360 px, spec complete;
  - **`secrets`**: gitleaks su tutta la cronologia.
- **`e2e-full`** (su push a main, ogni notte e con etichetta `e2e-full` sulla PR): desktop Chromium, smoke WebKit (login, onboarding, Percorso a 390 px; etichettato "Playwright WebKit", non Safari), progetto `time` seriale, progetto `degraded` (§9), axe sulla matrice dei temi.
- **Cache**: browser Playwright e immagini Docker di Supabase.
- **Retry**: `retries: 1` solo in CI. Un test passato al secondo tentativo viene **riportato come flaky** (bug da correggere, non verde silenzioso).
- **Dati**: utenti e matrimoni unici per test (`@example.test` casuali); nessuna pulizia, perché le tabelle append-only lo impediscono.
- **`migrate.yml`**: staging sulle PR con migrazioni; prod al push su main nell'environment `production`. Solo migrazioni additive.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Vite + React SPA + Supabase Edge Functions | Nessun server Next | Secondo runtime per cron, invito e disattivazione; niente SSR per LCP e tema senza lampo | Più parti in movimento |
| Backend con chiave segreta e autorizzazione nel codice | Un solo linguaggio | Chiave pubblicabile pubblica + RLS debole = API aperta | Contrario a NFR, AC10, AC11 |
| Invarianti solo nelle server action | Meno SQL | Un partner con JWT valido le aggira via PostgREST (QA-1) | Matrice delle scritture nel DB |
| Event sourcing completo | Storico perfetto | Costo sproporzionato | Audit trigger + eventi + versioni |
| Riferimento salvato dalle server action | Nessun trigger | Invariante dipendente da ogni punto di scrittura | `sync_timeline` via trigger |
| `inviteUserByEmail` di Supabase | Meno codice | Nessun controllo su revoca, scadenza e limite; utente creato per qualunque email | Tabella `invitations` + RPC |
| Primo account da variabile d'ambiente o creato a mano | Zero tabelle o zero codice | Non verificabile nel DB / manuale | Allowlist nel DB |
| `supabase config push` per l'auth remota | Configurazione come codice | Porterebbe in remoto i limiti di test del `config.toml` locale (QA-3) | Checklist nel pannello versionata nel runbook |
| Orologio finto per variabile d'ambiente di processo | Semplice | Rompe gli e2e paralleli, rischio in produzione (QA-2) | Parametri `today/now` + cookie di test con doppia guardia |
| Un'email per compito | Semplice | Raffiche di email, tetto consumato (PO-4, DES-26) | Una email al giorno per utente (se Q8 è approvata) |
| Solo GitHub Actions schedulato | Un solo scheduler | Si disattiva dopo 60 giorni di inattività; ritardi | Vercel Cron + controllo settimanale |
| Deploy prod dal workflow dopo la migrazione | Ordine garantito | Token Vercel nei secret; diverge da project.md | Migrazioni additive |
| Resend SDK + React Email | Componenti | Dipendenze per 3 template | `fetch` + template TS con escape |
| Libreria di date | Meno codice | Dipendenza; Temporal non ovunque | `plain-date.ts` + vettori condivisi |
| Client `pg` grezzo per i test di concorrenza (QA-6) | Due connessioni esplicite | Nuova dipendenza | Chiamate PostgREST parallele: connessioni distinte del pool, e il vincolo è già verificato in pgTAP |
| Supabase Branching | Staging integrato | A pagamento | Secondo progetto free |

## Impacts
- **Dati e migrazioni**: 3 migrazioni nuove (core, decisioni/Percorso, budget/notifiche), non distruttive. Rollback locale con `db reset`; in produzione solo migrazioni correttive in avanti. Seed finte per task. Nessuna data di nascita.
- **Contratti**: RPC elencate in §3/§3.1; route `/api/cron/daily`, `/auth/conferma`, `/invito/[token]`, `/email/disattiva`, `/servizio`; export `schemaVersion: 1`.
- **Prestazioni**: SSR in `fra1` vicino al DB; budget di font verificato; volumi minimi (DB < 10 MB).
- **Sicurezza**:
  - registrazione chiusa e limitatore applicativo identico per tutte le email;
  - RLS con matrice delle scritture, composite FK, allowlist delle funzioni eseguibili;
  - token hashati ed esclusi dall'audit;
  - chiave segreta in 3 percorsi server-only;
  - conferma OTP in POST, `next=` solo relativo, noindex/CSP/Referrer-Policy;
  - nessuna cache condivisa; escape nelle email; orologio di test con doppia guardia.
  - **È il modello di sicurezza iniziale: richiede approvazione al Gate B** e un round di revisione sicurezza in F3.
- **Dipendenze e servizi**: elenco in Decisions → P1. Nessuna nuova dipendenza introdotta da questo round.
- **Configurazione**: §11; proposta per `.adf/project.md` qui sotto.

### Proposta per `.adf/project.md` (da approvare al Gate B; la scrive il coordinatore)
```yaml
docker: true   # Docker Desktop serve allo stack Supabase locale; l'app gira su Node 24 dell'host
commands:
  setup: "npm ci && npm run db:start && npm run db:reset"
  start: "npm run dev"
  lint: "npm run lint"
  typecheck: "npm run typecheck"
  test: "npm run test"      # db:start idempotente + vitest unit (anche TZ alternativi) + integration + acceptance + supabase test db
  build: "npm run build"
  e2e: "npm run e2e"        # e2e-mobile (Chromium 360); `npm run e2e:full` = matrice completa
```
Deploy e Tests come nella versione precedente: Preview → staging Supabase; merge → prod + `migrate.yml` con approvazione; Vitest/pgTAP/Playwright, solo dati finti.

## Risks
Limiti dei piani gratuiti: valori noti a fine 2026, **non riverificati online in questa sessione**. Il release-manager li ricontrolla alla creazione dei servizi.

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Pausa di Supabase free dopo ~7 giorni; ripristino manuale; oltre ~90 giorni non garantito | Media | Alta | Cron giornaliero + controllo settimanale; pagina "in pausa" senza DB (DES-16); runbook; export |
| R2 | Workflow schedulati disattivati dopo 60 giorni senza attività | Media | Media | Il primario è Vercel; GitHub avvisa; runbook |
| R3 | Cron Hobby impreciso o saltato | Media | Bassa | Recupero `task_7d` dall'ultimo heartbeat; riepilogo lun–mer; idempotenza |
| R4 | Dominio non acquistato | Certa ora | Alta per Jessica | Rilascio in due tempi (Q1); checklist DNS |
| R5 | Quote Resend free (indicative: 100/giorno, 3.000/mese) condivise con Auth | Bassa | Media | Email raggruppate; tetti app; limite auth 10/h; segnalazione |
| R6 | Scanner dei link | Media | Media | Conferma in POST + codice |
| R7 | Errori RLS, aggiramento delle invarianti via API, cache | Bassa | Alta | Matrice delle scritture; test generati dal catalogo ed eseguiti via PostgREST (QA); lint; revisione sicurezza |
| R8 | Divergenza TS/SQL sulle date | Media | Media | Vettori condivisi |
| R9 | Testo di AC39 ("si sta svegliando") falso | Certa | Bassa | Q14 (riformulazione) e design §7.3 |
| R10 | Gara deploy/migrazione | Media | Bassa | Migrazioni additive |
| R11 | Fuga di dati via repo pubblico | Bassa | Alta | Guardia email `@example.test` su tutto il repo; nomi finti neutri; gitleaks; nessun dump |
| R12 | Peso dei font | Media | Media | Solo temi approvati; budget di file verificato; piano B `next/font/local` |
| R13 | Nessun backup scaricabile sul free (da verificare) | Media | Alta | Export + promemoria; runbook dump locale |
| R14 | Cambi di versione (Next 16 `proxy.ts`, chiavi Supabase, Inbucket→Mailpit, nomi dei servizi CLI) | Media | Bassa | Lockfile; `mailbox.ts` con contratto; controllo dei nomi `-x` in T1 |
| R15 | Più PR sullo staging condiviso | Bassa | Bassa | Un solo sviluppatore; reset solo con conferma |
| R16 | Trigger di sincronizzazione: ricorsione | Bassa | Media | `UPDATE OF`, `pg_trigger_depth()`, pgTAP |
| R17 | Enumerazione residua se si raggiunge il limite di invio di Supabase Auth (per progetto) | Bassa | Bassa | Limitatore applicativo più stretto; messaggi identici; documentato |
| R18 | Orologio di test attivo in produzione | Bassa | Alta | Doppia guardia (`E2E_CLOCK` + assenza di `VERCEL`), unit test, checklist delle variabili |
| R19 | Tempo di CI (25–35 min se monolitico) | Alta | Bassa | Job separati, cache, matrice completa solo su main/notte/etichetta |

## Tasks
**Regole di parallelismo**
- `package.json` e il lockfile sono di T1.
- Ogni migrazione ha un prefisso riservato e ogni task il suo file seed.
- `database.types.ts` si rigenera, non si unisce a mano.
- Cartelle di route e file disgiunti tra task paralleli.
- I componenti usati da più aree sono di T3 (DES-23).
- QA possiede i propri test di accettazione (QA-8). Gli sviluppatori tengono i propri test unitari e pgTAP per funzionalità; QA non li duplica.

| # | Task | Owner | Files (owned) | Depends on | AC |
|---|---|---|---|---|---|
| T0 | **Specifica delle tappe** (key, titolo, consiglio, offset, riti, priorità, in evidenza, burocratica; "indicativo") e frasi di stile | product-owner | `.adf/features/FEAT-2026-001/milestones-spec.md` | — | AC25, BR7 |
| T1 | **Scaffolding + CI**: Next 16/TS/Tailwind v4/shadcn, ESLint (guardie `use cache`, `text-accent`, import di `admin.ts`, con fixture che falliscono), Prettier, Vitest (unit/integration/acceptance), Playwright (`mobile`, `desktop`, `webkit-smoke`, `time` seriale, `degraded`), Supabase CLI + `config.toml` (solo locale/CI: registrazione chiusa, OTP 6, limiti di test alti, SMTP del mail catcher, solo `public` esposto, `analytics` off), script npm, `.env.example`, `.nvmrc`, header + noindex, client Supabase, `errors.ts` (`classifyDbError`), `proxy.ts` (redirect + riscrittura su `/servizio`), `clock.ts` + test di guardia, `app-config.ts`, CI (`checks`/`db`/`e2e-mobile`/`secrets`/`e2e-full`), guardia `@example.test` su tutto il repo, README setup | developer | `package.json`, lockfile, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` (+ `tests/lint-fixtures/**`), `.prettierrc`, `postcss.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `supabase/config.toml`, `.env.example`, `.nvmrc`, `src/app/robots.ts`, `src/lib/supabase/{server,client,admin,errors}.ts`, `src/proxy.ts`, `src/lib/clock.ts`, `src/lib/app-config.ts`, `src/components/ui/*`, `src/lib/utils.ts`, `.github/workflows/ci.yml`, `.gitleaks.toml`, `scripts/check-test-emails.ts`, `README.md` | — | AC1, AC43, AC45 |
| T2 | **DB core e RLS**: tabelle core, `has_permission`, `guard_row`, `bump_version`, `forbid_mutation`, `audit_capture` con colonne escluse, composite unique, allowlist delle funzioni, `create_wedding`, `accept_pending_invitation`, `create/rotate/revoke_invitation`, `upsert_partner_b`, `signin_gate`, `record_heartbeat` (pubblica, solo chiave segreta), `last_heartbeat`, `record_seen/record_export/dismiss_welcome`, seed finte, pgTAP per funzionalità, `versioned-update.ts` + integrazione | developer | `supabase/migrations/20261201100000_core.sql`, `supabase/seeds/01_core.sql`, `supabase/tests/00_helpers.sql`, `supabase/tests/core_*.test.sql`, `src/lib/supabase/versioned-update.ts`, `src/lib/supabase/database.types.ts`, `tests/integration/core.*.test.ts` | T1 | AC3, AC4, AC6, AC10, AC11, AC40, AC46 |
| T3 | **Design system, temi, shell e componenti condivisi**: temi (catalogo, `approved.ts`, generatore senza `:root`, contrasto con vettori WCAG e coppie estese), root layout (tema da DB/cookie/default, script modo + `theme-color`, font), `global-error.tsx`, `(app)/layout.tsx` + AppNav, `/servizio` + `ServiceDownPage` + `PublicShell`, EmptyState, ErrorState, OfflineBanner, `useFormDraft`, ConflictDialog (mappa etichette), Countdown, MoneyInput, BudgetBar, DateField, **MonthYearField, DateScenarioList, ReferenceBadge**, ThemeGallery/ThemeProvider, `manifest.ts`, controllo del budget dei font | developer (+ designer review) | `src/themes/*`, `scripts/{gen-themes-css,check-font-budget}.ts`, `src/app/{layout.tsx,globals.css,themes.css,manifest.ts,error.tsx,global-error.tsx}`, `src/app/(public)/servizio/**`, `src/app/(app)/layout.tsx`, `src/components/*` (non `ui/`), `src/lib/hooks/*` | T1 | AC39, AC40 (UI), AC49 |
| T4 | **Motore del Percorso**: `plain-date.ts`, vettori condivisi, `content/milestones` (da T0), `domain/timeline/*` (riferimento, offset, generazione per rito, `groupTasks` di design §3.4, anteprima con conteggio, suggerimenti), `domain/home/next-step.ts`, countdown; test unitari, anche con `TZ` alternativi | developer | `src/lib/dates/*`, `tests/fixtures/date-offset-vectors.json`, `src/content/milestones/*`, `src/domain/timeline/*`, `src/domain/home/*` | T1, T0 | AC15, AC16, AC24–AC30, AC32, AC48 |
| T5 | **Budget, importi, export, novità, nomi (puri)**: `money.ts` (regole Q10, tetto), `domain/budget/*` (avviso Assegnato > totale), `content/budget-categories.ts`, `domain/export/*`, `domain/news/*` (incluso il riferimento ricalcolato), `lib/display-name.ts` (nome → etichetta → "il tuo partner") | developer | `src/lib/money.ts`, `src/lib/display-name.ts`, `src/domain/budget/*`, `src/content/budget-categories.ts`, `src/domain/export/*`, `src/domain/news/*` | T1 | AC34–AC38, AC41, AC42, AC46 |
| T6 | **Livello email**: `EmailSender` (smtp/resend/none), `escape.ts` (HTML + intestazioni), token HMAC, template app con firme esplicite e nota "data provvisoria", template Supabase Auth (palette Giardino), `e2e/support/mailbox.ts` con il contratto di QA-12 (`waitForMessage({to, subject, timeout})` con polling, intestazioni grezze, parti text/html, estrazione di link e codice) | developer | `src/lib/email/*`, `supabase/templates/*`, `e2e/support/mailbox.ts` | T1 | AC8, AC9, AC52 |
| T7 | **Accesso, invito, uscita**: `/accesso`, `/auth/conferma` (POST), `/su-invito`, `/invito/[token]`, `requestSignIn` (`signin_gate`, creazione dell'utente autorizzato, messaggi identici, `next=` sicuro), instradamento dopo l'accesso, azioni d'invito, Altro > Invito, azione `signOut` | developer | `src/app/(public)/{accesso,auth,su-invito,invito}/**`, `src/features/{auth,invitations}/**`, `src/app/(app)/altro/invito/**`, `tests/integration/auth.*.test.ts` | T2, T3, T6 | AC1–AC8 |
| T8 | **DB decisioni + Percorso**: tabelle, matrice delle scritture (grant, trigger `due_overridden`/`completed_*`/`deleted_by`, stato delle opzioni, eventi), composite FK, RPC (`choose_option` con `exact_date`, `reopen_decision` con ripristino dei candidati, `set_reference_scenario(null)`, `add_decision_note`, `acknowledge_task_review`, `insert_template_tasks`, `complete_onboarding`), `add_date_offset`, `sync_timeline`; seed; pgTAP | developer | `supabase/migrations/20261201200000_decisions_timeline.sql`, `supabase/seeds/02_decisions_timeline.sql`, `supabase/tests/{decisions,timeline}_*.test.sql` | T2, T4 (vettori) | AC14, AC18–AC24, AC28, AC31 |
| T9 | **DB budget + notifiche**: tabelle, matrice delle scritture, trigger P5, `notification_log` con `batch_key`/`claimed_at`, funzioni `job_*` (solo chiave segreta), seed, pgTAP | developer | `supabase/migrations/20261201300000_budget_notifications.sql`, `supabase/seeds/03_budget.sql`, `supabase/tests/{budget,notifications}_*.test.sql` | T2 | AC33, AC38, AC52, AC53 |
| T10 | **Onboarding + Impostazioni + Profili**: passi 1–8 (B facoltativo, bozza, ripresa, "Passo n di 8"), conferma → `complete_onboarding` + invito, riepilogo con frase di stile (`content/style-tips.ts`), Altro > Impostazioni nozze (scenari tramite `DateScenarioList`), Altro > Profili (`PersonForm`) | developer | `src/app/onboarding/**`, `src/features/{onboarding,settings}/**`, `src/app/(app)/altro/{impostazioni,profili}/**`, `src/content/style-tips.ts` | T3, T4, T5, T7, T8, T9 | AC12–AC15, AC46, AC48 |
| T11 | **Percorso UI**: testata con riferimento, `ScenarioPicker`, `ScenarioPreviewBanner` (`?anteprima`), fasi, filtri, compito CRUD (`AssigneeField`, `ReminderToggle` se Q9, `field-labels.ts`), Annulla ≥ 8 s, "Eliminati di recente", banner "data riaperta", "Da rivedere", suggerimenti, striscia "Scadenze ricalcolate" | developer | `src/app/(app)/percorso/**`, `src/features/timeline/**` | T3, T4, T8 | AC15, AC16, AC20, AC24, AC25, AC29–AC32, AC40 |
| T12 | **Scelte UI**: elenco/dettaglio, OptionCard, Confronta 2, opzioni (data fissa/periodo, location), scelta (con giorno esatto per un periodo se Q7), riapertura, **azioni di riferimento sulle carte scenario (imposta, torna automatico, Annulla, anteprima)**, `HistoryList` con eventi di riferimento, reazioni, `field-labels.ts` | developer | `src/app/(app)/scelte/**`, `src/features/decisions/**` | T3, T8 | AC17–AC24 |
| T13 | **Budget UI** | developer | `src/app/(app)/budget/**`, `src/features/budget/**` | T3, T5, T9 | AC33–AC38, AC40 |
| T14 | **Home**: saluto, Countdown + ReferenceBadge, Prossimo passo, pagamenti, Novità, `WelcomeCard`, ultimo export | developer | `src/app/(app)/page.tsx`, `src/features/home/**` | T3, T4, T5, T8, T9 | AC26, AC27, AC41, AC42 |
| T15 | **Altro**: pagina indice con "Esci", Aspetto (salvataggio + cookie `r2y-theme`), Promemoria (2 interruttori), Esportazione, Info (heartbeat) | developer | `src/app/(app)/altro/{page.tsx,aspetto,promemoria,esporta,info}/**`, `src/features/{appearance,notifications,export}/**` | T3, T5, T7, T9 | AC42, AC44, AC49, AC52 |
| T16 | **Job e pipeline**: `runDailyJob`, `domain/reminders/{plan,digest,batch}.ts`, claim/ripresa/tetti, route cron, `/email/disattiva`, `vercel.json`, `migrate.yml`, `keepalive.yml` + `scripts/keepalive-check.ts` con test | developer | `src/app/api/cron/**`, `src/app/(public)/email/**`, `src/domain/reminders/**`, `src/features/jobs/**`, `vercel.json`, `.github/workflows/{migrate,keepalive}.yml`, `scripts/keepalive-check.ts`, `tests/integration/cron.*.test.ts` | T6, T8, T9 | AC43, AC44, AC50–AC53 |
| T17a | **QA: fondamenta di test + accesso/invito/onboarding**: helper `e2e/support/{auth (loginAs via generateLink+verifyOtp),fixtures,clock,stub-supabase}.ts`, matrice RLS/grant/scritture vietate generata dal catalogo (pgTAP + PostgREST con JWT reali), concorrenza (QA-6), enumerazione (QA-4), header (QA-14), e2e login/invito/onboarding | qa | `supabase/tests/qa_*.test.sql`, `tests/acceptance/{rls-api,grants,concurrency,signin-enumeration,headers}.test.ts`, `e2e/support/{auth,fixtures,clock,stub-supabase}.ts`, `e2e/{login,invito,onboarding}.spec.ts` | T2, T7 (scrittura da G1/G2) | AC1–AC8, AC10–AC14, AC45, AC46 |
| T17b | **QA: Percorso e Scelte** | qa | `tests/acceptance/timeline.test.ts`, `e2e/{percorso,anteprima,scelte}.spec.ts` | T11, T12 | AC15–AC32, AC40, AC48 |
| T17c | **QA: Budget, Home, Altro, job** (idempotenza, raffiche, ripresa dei claim, settimane ISO, disattivazione) | qa | `tests/acceptance/{jobs,unsubscribe}.test.ts`, `e2e/{budget,home,altro,export}.spec.ts` | T13–T16 | AC33–AC44, AC49–AC53 |
| T17d | **QA: accessibilità, cross-browser, degradato, cache** (axe con `target-size`, reflow a 320 px/200%, matrice temi notturna, WebKit smoke, `degraded` paused/unreachable, cache tra due sessioni, Indietro dopo l'uscita, budget JS/font; checklist manuale F3) | qa | `e2e/{a11y,themes,degraded,cache,cross-browser}.spec.ts`, `.adf/features/FEAT-2026-001/reviews/qa-a11y-checklist.md` | T10–T16 | AC39, AC49, NFR |
| T18 | **Documentazione** | technical-writer | `docs/functional/**`, `docs/technical/**`, `README.md` (oltre il setup) | T1–T16 | — |

**Gruppi paralleli** (max 3 sviluppatori; QA, PO e technical-writer sono in aggiunta):
- **G0**: T1 ‖ T0 (PO).
- **G1**: T2 ‖ T3 ‖ T4 (T4 parte quando T0 è pronto); poi T5 e T6. QA avvia T17a (helper e matrice) appena T2 è sul branch.
- **G2**: T7 ‖ T8 ‖ T9.
- **G3**: T10 ‖ T11 ‖ T12; QA prosegue T17a e avvia T17b.
- **G4**: T13 ‖ T14 ‖ T15.
- **G5**: T16 (anticipabile se c'è uno sviluppatore libero); QA T17c, T17d; T18 in F5.

## Test plan
- **Strumenti**: Vitest (unit; integration del developer; **acceptance di QA**), pgTAP (`supabase test db`), Playwright. I progetti Playwright sono definiti in §12.
- **Orologio**: §1.1. **Login negli e2e**: `loginAs` (link generato dall'admin + `verifyOtp`), tranne nelle spec di login, che usano il mail catcher.
- **Mailbox**: destinatario unico per test; le asserzioni di assenza valgono solo dopo un messaggio di controllo positivo arrivato a un secondo indirizzo (QA-12). CI verifica che `site_url` e l'host del link nel template corrispondano al `baseURL`.
- **Dati**: solo persone finte neutre ("Anna Test", "Bruno Test"), `@example.test`.
- **Non automatizzabili** (verifica manuale con motivo):
  - AC9: Resend reale, dopo il dominio;
  - AC43: "merge deploya prod" e "preview usa lo staging" (impostazioni Vercel/GitHub);
  - AC44: notifica dello scheduler, verificata una volta con un fallimento forzato via `workflow_dispatch`;
  - AC45: niente dati reali in log e artefatti (checklist di revisione);
  - tono "tu" e copy (revisione manuale);
  - VoiceOver iOS (checklist F3).

| Level | What | Cases (incl. edge cases) | AC covered | Owner |
|---|---|---|---|---|
| Acceptance (pgTAP + PostgREST) | **Matrice RLS/grant/scritture vietate, generata dal catalogo** | Ogni tabella/funzione `public` deve avere una voce nella matrice (una nuova senza voce fa fallire la CI). SELECT/INSERT/UPDATE/DELETE incrociati tra due matrimoni, compreso il cambio di `wedding_id` e i figli verso un padre di un altro matrimonio. Scritture dirette vietate: `decision_options.status`, `decision_events`, `memberships`, `tasks.source/template_*/needs_review/completed_*`, `due_date` senza `due_overridden`, `version`, `created_by`, `reactions.user_id` altrui. EXECUTE di `anon`/`authenticated` contro l'allowlist; `private` non esposto; `record_heartbeat` e `signin_gate` solo con la chiave segreta; `family` senza permessi non legge nulla; `token_hash` assente da `audit_log` ed export | AC1, AC10, AC11, AC21 | qa (T17a) |
| Integration | Accesso anonimo | Chiave pubblicabile senza sessione: 0 righe o rifiuto su tutto; server action e route chiamate senza sessione → rifiuto | AC1 | developer (T2, T7) |
| E2E | Redirect | Route private → `/accesso`, nessun dato nell'HTML | AC1 | qa |
| Acceptance | Enumerazione | Per {sconosciuta, autorizzata nuova, utente esistente} due richieste entro 1 s: stato, corpo e intestazioni identici; limite applicativo identico; nessun utente creato per le sconosciute; tempi riportati come nota; `next=` assoluto o `//` rifiutato | AC2, AC3 | qa (T17a) |
| pgTAP | `create_wedding` | Non in allowlist, già consumata, invito pendente (BR13) → errore; successo | AC3, AC4 | developer (T2) |
| Acceptance | Concorrenza | Due `accept_pending_invitation` in parallelo (stesso utente) → una membership; `create_wedding` doppio → un matrimonio; accettazione vs revoca e vs "Invia di nuovo" → esiti deterministici, nessun 500; INSERT diretto in `memberships` negato | AC6, AC3 | qa (T17a) |
| pgTAP + Acceptance | Inviti avversari | Token di un altro matrimonio, vecchio token dopo il nuovo invio, scaduto (con timestamp spostato), utente già membro di un altro matrimonio, email già membro → codici previsti | AC5–AC7 | developer (T2), qa |
| E2E | Ingressi, invito, login | Estraneo → "su invito"; primo partner → onboarding; invitato → spazio. Email d'invito nel mail catcher; Revoca e Invia di nuovo; stati del link. Link aperto in un secondo contesto → accesso; codice; "Invia di nuovo" 30 s (una volta, `@slow`); codice errato → messaggio. 429: unit sul mapping + un test d'integrazione con raffica scriptata | AC3–AC8 | qa, developer (T7) |
| Unit + manuale | Email di produzione | Trasporto da env; payload Resend con `Idempotency-Key`; verifica manuale post-dominio | AC9 | developer (T6), release-manager |
| Unit + E2E | Onboarding | Macchina a passi (ordine, ripresa, "Non lo so ancora", B facoltativo, email uguale); e2e con ricarica a metà | AC12, AC13 | developer (T10), qa |
| Integration | `complete_onboarding` | Tutto creato in una transazione; seconda chiamata rifiutata; risposte parziali | AC14, AC15 | developer (T8, T10) |
| Unit | Motore | Nessun riferimento; riti (pubblicazioni, corso solo cattolico, simbolico); rito sconosciuto → comuni + "Scegli il rito" | AC15, AC25 | developer (T4) |
| Unit + E2E | Suggerimenti | Nuove e non pertinenti; nulla di automatico; eliminati e ignorati mai ri-suggeriti | AC16, AC48 | developer (T4), qa |
| E2E | Confronto | 360 px carte + Confronta 2; 768 px colonne; pro/contro con icona (assert su icona + testo) | AC17 | qa |
| pgTAP + E2E | Scelta e riapertura | Scelta atomica con conflitto di versione; riapertura senza motivo → errore; con motivo: aperta, **scartate tornano candidate**, riferimento provvisorio uguale, `needs_review`; "Va bene così"; periodo con giorno esatto (se Q7) | AC18–AC20 | developer (T8), qa |
| pgTAP | Immutabilità | UPDATE/DELETE su `decision_events`, `budget_versions`, `audit_log` falliscono anche con la chiave segreta; nota accodata | AC21, AC33 | developer (T8, T9) |
| pgTAP + E2E | Reazioni, genericità | Una reazione non cambia lo stato; nuovo `type` senza DDL | AC22, AC23 | developer (T8), qa |
| Unit + pgTAP + E2E | Riferimento | Predefinito più vicino; periodo = primo giorno; manuale; "torna automatico"; decisa = definitivo; riaperta = stesso provvisorio; scenario manuale cancellato → automatico; Annulla del cambio; nuova data più vicina aggiunta da B → Novità per A | AC24, AC41 | developer (T4, T8), qa |
| Unit | Conto alla rovescia, Prossimo passo | Mezzanotte Rome vs 23:30 UTC, cambi d'ora, `TZ` alternativi; ordine di AC27 e max 1+2; e2e "1+2 max" | AC26, AC27 | developer (T4), qa |
| Unit + pgTAP | Ricalcolo | Vettori condivisi; solo compiti non toccati; trigger `due_overridden` alla modifica diretta via API | AC28 | developer (T4, T8) |
| Unit + E2E | Fasi e filtri | Adesso (3 in evidenza scadute + 30 giorni + in evidenza senza data, 5 righe + "Mostra tutte"), Da recuperare, soglie 30/31/90/91; filtri **stato, categoria, assegnatario, scadenza** uno per uno + contatore; Miei / dell'altro / Tutti; 360 px | AC29, AC30 | developer (T4), qa |
| E2E | Compiti | CRUD, Annulla ≥ 8 s, Eliminati di recente, nessuno swipe | AC31 | qa |
| Unit + E2E | Anteprima | `previewDueDates` puro con conteggio; `?anteprima` sopravvive alla ricarica; nessuna richiesta di scrittura (intercettazione); scenario sparito → chiusura | AC32 | developer (T4), qa |
| Unit + E2E | Budget | Versioni, avvisi (incluso Assegnato > totale), categorie (eliminazione con voci → "Sposta in…"), totali, pagamenti, barre con testo equivalente | AC33–AC37 | developer (T5, T13), qa |
| Unit + pgTAP + componente | Importi | Tabella attesi da Q10 (`1.500` → 150000, `1.234,56`, `1,234.56`, `1234,5`, `0`, `-1`, `12,345` errore, `abc`, vuoto, oltre il tetto); da stringa a centesimi senza float; `inputmode="decimal"` e testo d'errore esatto; DB rifiuta i negativi | AC38 | developer (T5, T9) |
| E2E | Stati e degradato | Vuoti, skeleton, errore client con "Riprova" (`page.route` abort); **offline**: offline → scrivi → online → ricarica → bozza ripristinata; progetto `degraded`: secondo `next start` su porta chiusa → "non raggiungibile"; stub che risponde 540 → "in pausa"; nessun redirect al login; unit `classifyDbError` con forme reali | AC39 | qa (T17d), developer (T1, T3) |
| Integration + E2E | Conflitto | `versioned-update` → conflitto + autore/ora; due contesti sullo stesso compito → dialog con etichette dei campi | AC40 | developer (T2), qa |
| Unit + E2E | Novità e benvenuto | Mapping audit → frasi; prima visita → `WelcomeCard`, chiusa e persistente | AC41 | developer (T5), qa |
| Unit + E2E | Export | JSON (senza data di nascita né `token_hash`), CSV; download, avanzamento, ultimo export a 30 giorni (orologio) | AC42 | developer (T5, T15), qa |
| CI + manuale | Pipeline | Job verdi; migrazioni sullo staging; preview → staging | AC43 | release-manager |
| Integration + Unit | Job e heartbeat | `runDailyJob` 401/heartbeat; `keepalive-check.ts` (36 h, quota) | AC44 | developer (T16) |
| CI + review | Repo pubblico | gitleaks su tutta la cronologia; guardia `@example.test` su tutto il repo; checklist su log e artefatti | AC45 | developer (T1), reviewer |
| pgTAP + E2E | Partner | Nessuna data di nascita; email di chi ha accettato non modificabile (se Q2); email di B → nuovo invito; `displayName` | AC46 | developer (T2, T5, T10), qa |
| Unit + E2E | Temi | Vettori WCAG del calcolatore; gate su `themes.css` generato per i temi approvati (coppie estese, semantici); report sui 12; nessun `text-accent`; tema salvato visibile al secondo partner; `data-theme` nell'HTML SSR; ripiego cookie; axe notturno sulla matrice | AC49 | developer (T3, T15), qa |
| Unit + Acceptance | Promemoria | `planReminders` (7 gg/oggi, entrambi/A/B, esclusioni, B non accettato, recupero dei cron saltati, nessun 7 gg per date cambiate nella finestra se Q8); raggruppamento 1 email/giorno, max 5 righe; nota "data provvisoria" | AC50 | developer (T16), qa (T17c) |
| Unit | Riepilogo | Lunedì; recupero lun–mer (se Q11); settimane ISO 2026-W53/2027-W01; vuoto → niente | AC51 | developer (T16) |
| Acceptance | Disattivazione | GET non cambia nulla; token manomesso, di altro tipo o di altro utente; POST one-click senza sessione; header; accesso e invito senza link | AC52 | qa (T17c), developer (T6, T16) |
| Acceptance | Idempotenza e quota | Due esecuzioni → un invio; due esecuzioni sovrapposte (`Promise.all`) → un invio; errore prima dell'invio / l'invio fallisce / errore dopo l'invio prima di `sent` → nessun duplicato, ripresa con la stessa chiave; 40 compiti spostati nella finestra → tetto + `skipped_quota` + flag | AC53 | qa (T17c) |
| E2E | Sicurezza e cache | Intestazioni sul server buildato (`X-Robots-Tag`, robots, `frame-ancestors`, `Referrer-Policy` no-referrer su invito/auth/email, CSP che non rompe l'app); due sessioni alternate sulle stesse URL → nessuna fuga; Indietro dopo l'uscita senza dati; budget di JS e font deterministici; LCP solo come report (+ misura manuale sulla preview) | NFR, AC1 | qa (T17a, T17d) |
| E2E + manuale | Accessibilità | axe (`target-size`, `color-contrast`), reflow 320 px / zoom 200 %, tastiera, `prefers-reduced-motion`; checklist manuale F3 (VoiceOver) | NFR | qa (T17d) |

## Documentation plan
| Type | Destination | What changes |
|---|---|---|
| Functional | `docs/functional/` | `accesso-e-invito.md`, `onboarding.md`, `percorso.md`, `scelte.md`, `budget.md`, `promemoria-email.md`, `temi-e-aspetto.md`, `esportazione.md`, `servizio-in-pausa.md`, indice |
| Technical | `docs/technical/` | `architettura.md`, `modello-dati.md` (con la matrice delle scritture), `sicurezza.md`, `email-e-job.md`, `ambienti-e-rilascio.md` (runbook e **checklist della configurazione Auth remota**, allowlist SQL, DNS, ripristino del progetto in pausa, dump locale, riattivazione dei workflow, variabili proibite in produzione come `E2E_CLOCK`), `sviluppo-locale-e-test.md` (orologio, `loginAs`, mailbox, progetti Playwright) |
| ADR | `docs/adr/0001-stack-auth-ambienti.md` | Aggiornato in questo round (config remota da pannello, matrice delle scritture, limitatore) |
| README | `README.md` | Requisiti, setup in 3 comandi, link |
| Project memory | `.adf/project.md` | Proposta sopra |

## Release plan
- **Percorso**: PR → CI verde → preview (staging) → **Gate C** → merge = deploy prod + `migrate.yml` prod con approvazione. **Il merge deploya la produzione: sì.**
- **Prerequisiti** (ognuno approvato al momento dell'esecuzione):
  1. due progetti Supabase in `eu-central-1` configurati con la checklist del pannello;
  2. progetto Vercel (`fra1`, variabili per ambiente, nessuna `E2E_CLOCK`, Deployment Protection);
  3. secret, variabili ed environment GitHub;
  4. allowlist del primo partner in prod (e dell'account di smoke sullo staging, Q13);
  5. dopo il dominio: Resend, DNS (SPF, DKIM, DMARC), SMTP di Supabase prod, `EMAIL_TRANSPORT=resend`.
- **Ordine delle migrazioni**: core → decisioni/Percorso → budget/notifiche, tutte additive.
- **Due tempi** (Q1):
  - **C1**: solo Tony, email di accesso con l'SMTP integrato, email dell'app spente. L'invito a B viene creato ma non spedito: la UI offre "Copia link". Se l'invito scade prima di C2, a C2 si usa "Invia di nuovo". AC9 e AC50–AC53 sono verificati solo a C2;
  - **C2**: dominio, Resend, invito a Jessica, promemoria attivi.
- **Feature flag**: nessuno; `EMAIL_TRANSPORT` fa da interruttore.
- **Rollback**: Instant Rollback di Vercel; migrazioni additive (il codice precedente resta compatibile) e correzioni in avanti; export; `EMAIL_TRANSPORT=none`.
- **Controlli post-deploy**:
  1. login via link in un altro browser e via codice;
  2. un'email non autorizzata → nessun utente;
  3. intestazioni e robots;
  4. cron manuale → heartbeat in Altro > Info;
  5. `keepalive.yml` manuale verde su entrambi i progetti;
  6. preview → staging;
  7. pagina `/servizio` raggiungibile;
  8. a C2: invito ricevuto da un indirizzo non membro, una sola email di promemoria al giorno, disattivazione funzionante.

## Decisions
| # | Decision | By | Date |
|---|---|---|---|
| A1 | Stack Next.js + TS su Vercel (`fra1`), Supabase `eu-central-1`; RLS + privilegi di colonna come unico confine; chiave segreta in 3 percorsi (ADR-0001) | architect | 2026-11-23 |
| A2 | Primo account: allowlist nel DB + creazione dell'utente solo per email autorizzate; registrazione Auth chiusa; limitatore applicativo identico per tutte le email | architect | 2026-11-23 |
| A3 | `EmailSender` (smtp/resend/none); Resend come custom SMTP di Supabase in prod; escape obbligatorio | architect | 2026-11-23 |
| A4 | Riferimento derivato nel DB (`sync_timeline`); date TS/SQL con vettori condivisi | architect | 2026-11-23 |
| A5 | Migrazioni additive via Actions; deploy automatico al merge mantenuto | architect | 2026-11-23 |
| A6 | Matrice delle scritture nel DB (grant di colonna, `guard_row`, trigger, composite FK, allowlist delle funzioni) (QA-1) | architect | 2026-11-23 |
| A7 | Orologio: parametri `today/now`, `runDailyJob` iniettabile, cookie di test con doppia guardia, progetto e2e seriale (QA-2) | architect | 2026-11-23 |
| A8 | `config.toml` solo locale/CI; Auth remota dal pannello con checklist; niente `config push` (QA-3) | architect | 2026-11-23 |
| A9 | Pagina servizio non disponibile senza DB; proxy e layout non reindirizzano al login su rete/540 (DES-16) | architect | 2026-11-23 |
| A10 | Promemoria raggruppati per utente e giorno come implementazione predefinita, subordinata a Q8; log per elemento, `batch_key` come chiave di idempotenza; ripresa dei claim scaduti | architect | 2026-11-23 |
| P1 | **Da approvare (sviluppatore)**. **Servizi** gratuiti: Vercel Hobby (1 progetto), Supabase free ×2, Resend free (dopo il dominio, D12), GitHub Actions + Environment `production`. **npm runtime**: `next`, `react`, `react-dom`, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, `radix-ui` (via shadcn), `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, `vaul`, `react-day-picker` (porta `date-fns`), `tw-animate-css`, `nodemailer` (solo locale/CI). **npm dev**: `typescript`, `tailwindcss`, `@tailwindcss/postcss`, `eslint`, `eslint-config-next`, `prettier`, `prettier-plugin-tailwindcss`, `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@playwright/test`, `@axe-core/playwright`, `supabase` (CLI), `tsx`, `@types/node`, `@types/react`, `@types/nodemailer`. **CI**: immagine Docker di gitleaks. Nessuna migrazione distruttiva. **Modello di autenticazione/permessi nuovo** (A1, A2, A6): richiede approvazione esplicita | developer | — |

### Open questions (question-for-developer, con risposta proposta)
| # | Question | Proposta | Fonte |
|---|---|---|---|
| Q1 | Rilascio in due tempi? C1 = solo Tony, con l'SMTP integrato di Supabase (deroga temporanea ad AC9) ed email dell'app spente; C2 = dominio + Resend + invito a Jessica + promemoria | Sì | P2, PO |
| Q2 | Email di un partner che ha accettato = email di accesso, in sola lettura in R1; quella di B resta modificabile finché l'invito non è accettato (con nuovo invito) | Sì, con l'avviso "l'email è il tuo accesso" | P3, PO |
| Q3 | Rito "Non lo so ancora": solo tappe comuni + tappa "Scegli il rito" in "Adesso"; le specifiche arrivano come suggerimenti | Sì | P4, PO-3 |
| Q4 | Eliminare una categoria con voci richiede prima di spostarle ("Sposta in…"); l'Assegnato torna "non assegnato"; vuota = eliminazione con Annulla (restringe "eliminabili" di AC34) | Sì | P5, PO |
| Q5 | Il partner B riceve promemoria e riepilogo solo dopo aver accettato; prima, le scadenze condivise vanno solo ad A; nessun recupero all'ingresso | Sì | P6, PO |
| Q6 | Temi approvati (`APPROVED_THEME_IDS`) tra i 12 del catalogo | Scelta dello sviluppatore; Giardino predefinito | P8 |
| Q7 | Scegliere uno scenario "periodo" come data: la UI chiede il giorno esatto dentro il periodo (lo scenario diventa data fissa, lo storico conserva il periodo) | Sì | PO-2 |
| Q8 | Promemoria: **una sola email al giorno per utente** con blocchi "tra 7 giorni" e "oggi" (max 5 righe + "e altri N"); niente email "7 giorni" per compiti la cui scadenza è stata impostata o cambiata dentro la finestra; AC50 riformulato in "un'email con i promemoria del giorno" | Sì | PO-4, DES-26 |
| Q9 | Interruttore promemoria **per compito** ("Ricordamelo per email", attivo di default): tenerlo (già nel design, costo minimo) aggiungendolo ad AC50, o toglierlo da R1 | Tenerlo e aggiungere un AC | PO-5 |
| Q10 | Regole degli importi: punto seguito da esattamente 3 cifre senza virgola = migliaia ("1.500" = 1.500,00 €); virgola o punto con 1–2 cifre = decimali; 3 cifre dopo la virgola = errore; si accettano sia "1.234,56" sia "1,234.56" incollati; tetto 1 miliardo di € | Sì | QA-11 |
| Q11 | Se il riepilogo del lunedì salta (cron perso), mandarlo alla prima esecuzione utile da lunedì a mercoledì, sempre una volta per settimana ISO | Sì | QA-5 |
| Q12 | Aggiungere un'uscita minima "Esci" in Altro (nessun AC oggi), testata una volta | Sì | QA-14 |
| Q13 | Smoke sullo staging: un solo account di prova = un indirizzo dello sviluppatore membro dell'organizzazione Supabase, in allowlist solo sullo staging, con dati finti; nessun test in produzione | Sì | QA-15 |
| Q14 | Riformulare AC39: due pagine distinte, "L'app è in pausa" (ripristino manuale dal pannello, "Riprova") e "Non riesco a raggiungere il servizio" (rete/5xx), al posto di "si sta svegliando" | Sì, testi di design §7.3 | DES-17, PO-8b |
| Q15 | Nome dell'app nei testi e mittente email: "roadmap2yes", provvisorio, in una costante `APP_NAME` | Sì | DES Q2 |
| Q16 | La pagina "in pausa" non nomina chi la ripristina: formula generica "chi gestisce l'app", con i dettagli tecnici comprimibili | Sì | DES Q3 |

## Change log
| Date | Change | Why | Approved by |
|---|---|---|---|
| 2026-11-23 | Prima stesura del piano (F2) | — | — |
| 2026-11-23 | Round 1 F2: matrice delle scritture e composite FK; orologio iniettabile; `config.toml` solo locale; limitatore di accesso; pagina servizio non disponibile senza DB; riferimento "torna automatico" e ripristino dei candidati alla riapertura; fasi di design §3.4; email raggruppate e claim ripresi; temi senza `:root` e budget dei font; contrasto esteso; componenti condivisi a T3; T0 (PO) e T17 diviso in T17a–d; CI a job separati; domande unificate Q1–Q16 | Obiezioni PO-1..9, QA-1..17, DES-16..30 | — |

## Outcome
<!-- Filled at the end of F5: what shipped, where, when, deviations from the plan, follow-ups. -->
