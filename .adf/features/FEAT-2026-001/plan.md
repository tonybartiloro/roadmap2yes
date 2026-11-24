# FEAT-2026-001 — R1 Fondamenta, onboarding guidato, Percorso e budget: piano di implementazione

<!-- Owner: architect. Approved at Gate B. Updated through the change log if the solution changes. -->

| Brief | Design | Size | Status |
|---|---|---|---|
| brief.md (approvato 2026-11-23; revisione Gate B in corso dal product-owner: accesso con codice) | design.md (finale per il Gate B) | L | in discussion (revisione per cambio requisiti al Gate B) |

- **Convenzioni**: identificatori di codice, tabelle e funzioni in inglese; testi, documentazione e interfaccia in italiano.
- **ADR collegato**: `docs/adr/0001-stack-auth-ambienti.md`.
- **Fonti integrate**:
  - obiezioni F2 round 1: PO-1..9, QA-1..17, DES-16..30;
  - cambio di requisiti dello sviluppatore al Gate B: accesso con email + codice d'accesso, primo utente da variabili d'ambiente, partner creato da A, nessuna email senza Resend, data collegabile a una location.
- **Numerazione degli AC**: i numeri citati sono quelli del brief approvato. Gli AC di accesso (AC2–AC9) vengono riformulati dal product-owner. Il test plan descrive il comportamento nuovo e va riallineato ai numeri finali quando la revisione del brief arriva.

## Current state
- **Repository greenfield**: contiene solo `README.md`, `.gitignore` e `.adf/`.
  - `.gitignore` esclude già `.env`, `.env*.local`, `.next/`, `coverage/`, `playwright-report/`, `test-results/`.
  - Non esistono `package.json` né `docs/`, tranne la bozza `docs/adr/0001-*.md`.
- **`.adf/project.md`**: `commands` vuoti, `docker: false`. Il merge su main deploya la produzione (Vercel). Comandi di produzione protetti: `vercel --prod`, `vercel deploy --prod`, `vercel promote`.
- **Toolchain locale**: Node v24.21.0, npm e Docker presenti. CLI Supabase assente: entrerà come devDependency npm.
- **Vincoli** (brief D1–D28 e `log.md`, sezione "Gate B round"):
  - solo Supabase per dati, auth e storage;
  - Resend come unico fornitore email, attivo solo quando esiste il dominio;
  - sviluppo locale con Docker;
  - accesso solo su invito;
  - un progetto Vercel, con le preview collegate a Supabase di staging.

## Solution

### 1. Architettura in sintesi
- **Stack**: Next.js (App Router, 16.x stabile) + React 19 + TypeScript strict su Vercel Hobby (`fra1`); Supabase (Postgres + Auth) in `eu-central-1`.
- **Autorizzazione**: RLS e privilegi di colonna sono l'unico confine di autorizzazione.
  - Ogni operazione dell'utente passa con il suo JWT (`@supabase/ssr`).
  - API esposta solo sullo schema `public`.
- **Chiave segreta Supabase**: vive solo in `src/lib/supabase/admin.ts` (`server-only`). Una regola di lint ne permette l'import solo da questi moduli:
  1. `features/auth/{login,bootstrap}.ts`: limitatore dei tentativi e creazione idempotente del primo utente;
  2. `features/accounts/admin-ops.ts`: creazione, modifica e cancellazione dell'account del partner in attesa, codice temporaneo, cambio del proprio codice e della propria email. Ogni operazione è **prima una mutazione nel DB** con il JWT dell'utente (blocca, ricontrolla, registra l'evento e restituisce il bersaglio) ed è eseguita dopo con la chiave, solo sull'id restituito (contratto in §4.8);
  3. `features/jobs/**`: job giornaliero;
  4. `app/(public)/email/**`: disattivazione delle email.
- **Pattern**:
  - server component dinamici (nessuna cache condivisa dei dati utente, regola di lint);
  - server action con zod;
  - `useOptimistic`;
  - RPC atomiche per le transizioni;
  - matrice delle scritture nel DB (§3.1);
  - dominio in funzioni pure con `today`/`now` come parametro (§1.1).

### 1.1 Orologio iniettabile (QA-2)
- **Funzioni pure**: ricevono sempre `today`/`now` come parametro.
- **`getNow()`** (`src/lib/clock.ts`): legge il cookie `r2y-test-now` solo con `E2E_CLOCK=1` e `VERCEL` non definita; un test unitario lo verifica.
- **Job**: `runDailyJob({ clock, sender, db, caps })`.
- **E2E**: le spec dipendenti dal tempo girano nel progetto Playwright seriale `time`.
- **Tempo del DB**: si testa spostando i timestamp nei test.

### 2. Struttura del repository
```
src/
  app/
    layout.tsx, robots.ts, manifest.ts, globals.css, themes.css (generato), global-error.tsx
    (public)/accesso/…            # email + codice d'accesso; "Hai dimenticato il codice?"
    (public)/auth/conferma/…      # SOLO con email attive: link di recupero codice (type=recovery), verifica in POST
    (public)/invito/[token]/…     # SOLO con email attive: imposta il tuo codice (link monouso)
    (public)/su-invito/… (public)/email/disattiva/… (public)/servizio/…
    onboarding/…
    (app)/layout.tsx, (app)/page.tsx, (app)/{percorso,scelte,budget}/…
    (app)/altro/{page.tsx,impostazioni,profili,invito,account,aspetto,promemoria,esporta,info}/…
    api/cron/daily/route.ts
  proxy.ts
  lib/supabase/{server,client,admin,errors,versioned-update}.ts, database.types.ts
  lib/email/{types,index,smtp,resend,unsubscribe-token,escape}.ts, lib/email/templates/*.ts
  lib/{clock,money,display-name,app-config,access-code}.ts, lib/dates/plain-date.ts
  domain/{timeline,budget,home,reminders,export,news}/*
  content/{milestones/*,budget-categories.ts,style-tips.ts,weak-codes.ts}
  themes/*, components/ui/*, components/*
  features/{auth,accounts,invitations,onboarding,settings,timeline,decisions,budget,home,appearance,notifications,export,jobs}/*
scripts/{bootstrap,gen-themes-css,check-font-budget,keepalive-check,check-test-emails}.ts
supabase/{config.toml,migrations,seeds,templates,tests}
tests/{integration,acceptance,fixtures,lint-fixtures}, e2e/**
.github/workflows/{ci,migrate,keepalive}.yml, vercel.json, docs/**
```

### 3. Modello dati
Migrazioni additive. `public` è esposto con RLS su tutto; `private` non è esposto.

**Convenzioni**
- `wedding_id` su ogni tabella di dominio.
- Composite FK `(parent_id, wedding_id)`.
- Colonne `version`, `created_*`, `updated_*`, con i trigger `bump_version` e `guard_row` (immutabili `id`, `wedding_id`, `created_*`).
- Importi `bigint` in centesimi, con `check (>= 0)` e tetto 100.000.000.000.
- Date come `date`; enum come `text` + `check`.

**Identità, spazio, account** (migrazione core, T2)

| Tabella | Colonne chiave | Note |
|---|---|---|
| `weddings` | `id`, `rite`, `guest_band`, `style_label`, `style_note`, `region`, `comune`, `theme_id default 'giardino'`, `onboarding_answers`, `onboarding_unknown`, `onboarding_completed_at`, `manual_reference_option_id`, `applied_reference_date`, versione | |
| `wedding_partners` | `wedding_id`, `slot` (`A`/`B`), `label`, `first_name`, `last_name`, `email citext`, `user_id` | Nessuna data di nascita. Riga B facoltativa. Regole sull'email in §4.6 |
| `memberships` | `wedding_id`, `user_id`, `role`, `partner_slot` | PK `(wedding_id, user_id)` + `unique(wedding_id, partner_slot)` = max 2 partner. La membership di B nasce al **primo accesso** di B |
| `private.role_permissions` | `role`, `area`, `action` | Solo `partner` in R1 |
| `invitations` | `wedding_id`, `slot='B'`, `email`, `method` (`code`/`email`), `invitee_user_id`, `token_hash` (solo `email`), `expires_at` (solo `email`), `revoked_at`, `accepted_at`, `accepted_by`, `last_sent_at`, `send_count` | Un solo invito pendente per matrimonio. `token_hash` non leggibile ed escluso dall'audit |
| `account_events` | `wedding_id`, `kind` (`partner_account_created`/`temp_code_set`/`code_changed`/`email_changed`/`invite_revoked`), `actor_id`, `target_user_id`, `at` | Append-only. Alimenta Novità e trasparenza: "Tony ha impostato un codice temporaneo per Jessica". Mai il codice |
| `private.login_attempts` | `key_hash bytea` (sha256 dell'email normalizzata, o `ip:` + IP), `failed_count`, `window_start`, `locked_until` | Limitatore applicativo (§4.3) |
| `user_wedding_state` | `user_id`, `wedding_id`, `last_seen_at`, `previous_seen_at`, `last_export_at`, `welcome_dismissed_at` | |
| `audit_log` | come prima, colonne escluse via `TG_ARGV` | |
| `heartbeats` | `source`, `ran_at`, `details` | |

- **Rimosso** rispetto alla versione precedente: `private.founder_allowlist` e `private.signin_attempts`. Il fondatore è identificato da `app_metadata.r2y_founder = true`, impostato solo dal bootstrap con la chiave segreta e non modificabile dall'utente.

**Decisioni, scenari, Percorso** (T8)

| Tabella | Colonne chiave | Note |
|---|---|---|
| `decisions`, `decision_options`, `decision_events`, `option_reactions`, `tasks`, `task_suggestion_dismissals` | come prima | |
| `date_scenarios` | `option_id`, `wedding_id`, `kind`, `date_from`, `date_to`, **`location_option_id uuid null`** | Q7: una data può essere **collegata a una location** candidata. Composite FK `(location_option_id, wedding_id) → decision_options(id, wedding_id)`. Un trigger verifica che sia un'opzione della decisione `location`, non cancellata. Se la location viene cancellata il collegamento si azzera, con un evento `option_updated`. Nessun vincolo tra le due scelte (l'abbinamento completo resta R2) |

**Budget e notifiche** (T9)
- Tabelle come prima: `budget_versions`, `budget_categories` (con P5), `budget_items`, `payments`, `notification_preferences`, `notification_log` (`batch_key`, `claimed_at`).

### 3.1 Matrice delle scritture (QA-1)
| Tabella | Scrittura diretta consentita a `authenticated` | Solo via RPC/trigger | Protezioni |
|---|---|---|---|
| `weddings` | UPDATE `rite`, `guest_band`, `style_*`, `region`, `comune`, `theme_id`, `onboarding_answers`, `onboarding_unknown` | `create_wedding`, `complete_onboarding`, `set_reference_scenario`, `sync_timeline` | grant di colonna, `guard_row` |
| `wedding_partners` | UPDATE `label`, `first_name`, `last_name` | `email` (`update_partner_email`, `sync_my_email`), INSERT (`create_wedding`, `complete_onboarding`, `upsert_partner_b`), `user_id` (`accept_pending_invitation`) | grant di colonna |
| `memberships`, `user_wedding_state`, `account_events` | nessuna | RPC | nessun grant; `account_events` con `forbid_mutation` |
| `invitations` | nessuna (SELECT senza `token_hash`) | `create_invitation`, `rotate_invitation`, `revoke_invitation` | grant di colonna |
| `decisions` | UPDATE `question` | `choose_option`, `reopen_decision` | grant di colonna |
| `decision_options` | INSERT/UPDATE dei campi di business + `deleted_at` | `status` | trigger |
| `date_scenarios` | INSERT/UPDATE `kind`, `date_from`, `date_to`, `location_option_id` | — | trigger su decisione e tipo della location collegata, composite FK |
| `decision_events` | `decision_id`, `wedding_id`, `kind` (`option_added`/`option_updated`/`option_removed`/`chosen`/`reopened`/`note`/`reference_set`/`reference_auto`), `option_id`, `reason`, `payload`, `actor_id`, `at` | Append-only. Scritto solo da trigger e RPC |
| `budget_versions` | `wedding_id`, `total_cents`, `reason`, `created_by`, `created_at` | Append-only |
| `audit_log`, `heartbeats`, `notification_log`, `private.*` | nessuna | trigger e job | nessun grant |
| `tasks` | INSERT `source='user'`; UPDATE `title`, `notes`, `category`, `due_date`, `assignee`, `reminders_enabled`, `status`, `deleted_at` | template e `needs_review` via RPC | trigger `due_overridden`, `completed_*`, `deleted_by`; campi template immutabili |
| `option_reactions`, `notification_preferences` | solo le proprie righe | — | `with check (user_id = auth.uid())` |
| `task_suggestion_dismissals` | `wedding_id`, `template_key`, `kind`, `dismissed_at` | "Ignora" (AC16) |
| `budget_categories` / `budget_items` / `payments` | INSERT/UPDATE delle colonne di business + `deleted_at` | — | composite FK, `check >= 0`, trigger P5 |

**Funzioni con EXECUTE**
- **Per `authenticated`** (allowlist verificata da un test): `create_wedding`, `complete_onboarding`, `accept_pending_invitation`, `create_invitation`, `rotate_invitation`, `revoke_invitation`, `upsert_partner_b`, `update_partner_email`, `sync_my_email`, `authorize_account_op`, `choose_option`, `reopen_decision`, `add_decision_note`, `set_reference_scenario`, `acknowledge_task_review`, `insert_template_tasks`, `record_seen`, `record_export`, `dismiss_welcome`, `last_heartbeat`.
- **Per `anon`**: nessuna.
- **Solo con la chiave segreta**: `record_heartbeat`, `login_gate`, `login_record`, `auth_user_id_by_email` (solo bootstrap), `invitation_by_token` (§4.8), `job_*`.
- **Nessun grant** (revisione T2, REV-3): `record_account_event` non è più chiamabile dalle API; gli eventi di account li scrivono le RPC che autorizzano l'operazione (§4.8).

**RPC nuove o cambiate**
- **`create_wedding()`**: richiede `auth.jwt()->'app_metadata'->>'r2y_founder' = 'true'`, nessuna appartenenza, nessun matrimonio già creato da questo utente, nessun invito pendente per la sua email (BR13). L'etichetta iniziale del partner A arriva da `app_metadata.r2y_role` (`sposo`/`sposa`), modificabile.
- **`authorize_account_op(op, target_slot, new_email)`**: SECURITY DEFINER, con il JWT del chiamante, **volatile** (revisione T2): blocca il matrimonio, ricontrolla e **scrive l'evento di account** nella stessa transazione, poi restituisce `{ allowed, target_user_id, target_email }` oppure un codice d'errore. Copre solo le operazioni che non cambiano righe del DB:
  - `set_temp_code`: il bersaglio è **l'altro** partner membro dello stesso matrimonio, oppure l'invitato in attesa legato all'invito se è un account riutilizzabile (§4.8); evento `temp_code_set`;
  - `change_own_code`: bersaglio = chiamante; evento `code_changed`;
  - `change_own_email`: bersaglio = chiamante; `email_in_use` se la nuova email ha già un account Auth o è quella dell'altro partner; evento `email_changed`.
  - `create_partner`, `update_pending_email`, `delete_pending` **non passano più da qui**: la loro mutazione nel DB (`create_invitation`, `update_partner_email`, `revoke_invitation`) blocca, ricontrolla, scrive l'evento e restituisce il bersaglio dell'operazione admin (§4.8).
  - La decisione è sempre del DB; la server action esegue con la chiave solo se `allowed` e solo sull'id restituito.
- **`accept_pending_invitation()`**: al primo accesso di B. Corrispondenza dell'email, invito non revocato (per `method='email'` anche non scaduto), limite 2 partner; crea la membership. Codici di esito come prima.
- **`update_partner_email(slot, email)`**: solo per B in attesa. Aggiorna la riga partner e l'invito; l'account Auth lo aggiorna `admin-ops`.
- **`sync_my_email()`**: copia `auth.email()` nella propria riga partner, dopo il cambio email (§4.6).
- Le altre RPC (`choose_option` con `exact_date`, `reopen_decision` che ripristina i candidati, `set_reference_scenario(null)`, `sync_timeline`, …) restano come in round 1.

### 4. Accesso con email e codice d'accesso
Il codice d'accesso è la password di Supabase Auth: hashata da Supabase (bcrypt), mai salvata da noi né nei log. Nessun magic link né OTP email in R1. **Il login funziona senza alcun fornitore email.**

#### 4.1 Configurazione di Supabase Auth
- **Valori di base**:
  - `enable_signup = false`;
  - provider email attivo, conferma email non necessaria: gli account sono creati già confermati dall'admin;
  - **`minimum_password_length = 10`** e **`password_requirements = "letters_digits"`** (Q-A).
  - **Indurimento contro `PUT /user` diretto** (revisione T2, REV-9; **da approvare, P2**): `enable_confirmations = true` ("Confirm email"), `double_confirm_changes = true` ("Secure email change"), `secure_password_change = true` ("Secure password change"). Effetti:
    - un cambio email chiesto direttamente a GoTrue con una sessione non viene applicato senza la conferma via email su entrambi gli indirizzi: con le email spente la conferma non arriva mai (l'SMTP di serie consegna solo ai membri dell'organizzazione), con Resend serve anche la casella del titolare;
    - un cambio codice diretto richiede una sessione creata da meno di 24 ore, altrimenti un nonce inviato via email (`/reauthenticate`): con le email spente non è ottenibile;
    - **il percorso dell'app non usa `PUT /user`** per codice ed email (admin dopo la verifica del codice attuale, §4.8), quindi nessuna delle tre impostazioni richiede un fornitore email; `admin.createUser/updateUserById` con `email_confirm: true` non sono toccati; il recupero via email (`/auth/conferma`, solo con email attive) usa una sessione appena creata, quindi resta valido;
    - **rischio residuo** (R26): una sessione rubata entro 24 ore dal login può ancora cambiare il codice direttamente.
- Questi valori sono imposti dal server Auth, quindi valgono anche per chiamate dirette all'API.
- Locale e CI: `supabase/config.toml` (limiti di test alti). Staging e prod: pannello, con una checklist nel runbook (nessun `config push`).
- **Cosa dà Supabase Auth di serie**:
  - hash bcrypt;
  - limite per IP sul login (`sign_in_sign_ups`, configurabile, ~30 richieste ogni 5 minuti per IP);
  - lunghezza minima e requisiti del codice;
  - stesso errore "Invalid login credentials" per email inesistente e codice errato.
- **Cosa non dà**:
  - nessun blocco per account dopo N errori;
  - la protezione dalle password trapelate (HaveIBeenPwned) è solo sui piani a pagamento;
  - CAPTCHA solo con un servizio esterno (Turnstile/hCaptcha).

#### 4.2 Primo utente da variabili d'ambiente (bootstrap)
- **Variabili** server-only, mai `NEXT_PUBLIC_`, mai nel repo: `R2Y_BOOTSTRAP_EMAIL`, `R2Y_BOOTSTRAP_ACCESS_CODE`, `R2Y_BOOTSTRAP_ROLE` (`sposo`/`sposa`).
- **`ensureBootstrapUser()`** (`features/auth/bootstrap.ts`):
  - se manca una variabile, non fa nulla;
  - valida il codice con la policy (§4.4) e il ruolo; se non sono validi registra un errore di configurazione senza valori e non crea nulla;
  - cerca l'utente con `auth_user_id_by_email`; **se esiste non fa nulla**: non sovrascrive mai un codice cambiato in app (create-only);
  - altrimenti `auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { r2y_founder: true, r2y_role } })`;
  - se un'altra richiesta l'ha appena creato ("already registered"), l'errore è trattato come successo.
- **Dove gira** (decisione):
  - **(a) percorso server protetto nella server action di login**, quando l'email inserita coincide con `R2Y_BOOTSTRAP_EMAIL` (confronto normalizzato);
  - **(b) `npm run bootstrap`** (`scripts/bootstrap.ts`), stessa funzione, per locale e staging quando la si vuole lanciare a mano.
- **Perché il percorso (a)**:
  - Vercel non ha un hook dopo il deploy;
  - `instrumentation.ts` girerebbe a ogni avvio a freddo (latenza e un punto di guasto se il DB è in pausa);
  - lo script da solo obbligherebbe a portare la chiave segreta di produzione sul portatile (`vercel env pull` è un comando verso la produzione).
  - Con (a) il primo login crea l'account senza passaggi manuali. Il costo è una query in più solo per quell'email, e non apre superfici nuove: chi non conosce il codice non entra comunque.
- **Raccomandazioni nel runbook**:
  - dopo il primo accesso cambiare il codice in app;
  - opzionalmente togliere `R2Y_BOOTSTRAP_ACCESS_CODE` da Vercel: create-only, non serve più;
  - cambiare `R2Y_BOOTSTRAP_EMAIL` crea un **nuovo** fondatore. È voluto ed è documentato.
- **Staging**: le stesse variabili nell'ambiente Preview definiscono l'**account di smoke** (Q13), sempre con dati finti.

#### 4.3 Login, limitatore, messaggi neutri
1. **Server action `signIn(email, code)`**:
   - zod;
   - se l'email è quella di bootstrap, `ensureBootstrapUser()`;
   - `login_gate(sha256(email), ip)` con la chiave segreta: se la chiave email o IP è bloccata, risponde "Troppi tentativi. Riprova tra 15 minuti.", **identico per qualunque email**;
   - `signInWithPassword` dal server (cookie di sessione via `@supabase/ssr`);
   - esito negativo: `login_record(failure)` e "Email o codice non corretti." (neutro);
   - esito positivo: `login_record(success)` azzera il contatore dell'email **solo se non è bloccata** (revisione T2, REV-5): un blocco attivo non viene mai cancellato né accorciato da un successo, e la chiave IP non è mai azzerata da un successo;
   - un successo arrivato mentre un blocco è attivo (raffica di tentativi paralleli passati tutti dal gate aperto) **è onorato**: il codice era giusto e GoTrue ha già emesso la sessione; il blocco resta fino alla scadenza per gli altri tentativi. Nessun tetto di concorrenza per email: la raffica è limitata dal limite per IP di GoTrue e dalla chiave IP, e il percorso diretto a GoTrue resta comunque senza blocco per account (R20);
   - `login_record` si chiama **solo se il gate era aperto**: un tentativo bloccato non scrive righe (niente righe per email casuali);
   - un 429 di GoTrue è mappato sullo stesso testo dei troppi tentativi.
2. **Soglie** (configurabili via env, con questi default):
   - per email: 5 errori in 15 minuti → blocco 15 minuti;
   - per IP: 20 errori in 15 minuti → blocco 15 minuti.
   - L'IP viene da `x-forwarded-for`/`x-real-ip` di Vercel. Le chiavi sono hash e non c'è storico oltre la finestra.
3. **Limite noto**: il limitatore applicativo protegge il percorso dell'app. Un attaccante può chiamare direttamente l'endpoint password di GoTrue con la chiave pubblicabile (pubblica), e lì valgono solo il limite per IP di Supabase e la robustezza del codice. Per questo la policy del codice è imposta dal server Auth (≥ 10 caratteri, lettere + cifre) più una lista di codici deboli lato app (R20). CAPTCHA (Turnstile, servizio nuovo) resta un'opzione per dopo (Q-B).
4. **Dopo l'accesso** (`features/auth/post-login.ts`, richiamato dal proxy tramite `features/auth/guards.ts`), in quest'ordine:
   1. `app_metadata.r2y_must_change_code` → `/altro/account?obbligatorio=1`;
   2. membership → home o ripresa dell'onboarding;
   3. `accept_pending_invitation()` = `ok` → spazio invitante;
   4. fondatore senza matrimonio → `create_wedding()` + onboarding;
   5. altrimenti `/su-invito`.
5. **Uscita**: "Esci" in Altro (Q12 approvata); risposte `no-store`, quindi Indietro non mostra dati.

#### 4.4 Policy dei codici (`src/lib/access-code.ts` + `content/weak-codes.ts`)
- Lunghezza 10–72 (72 è il limite di bcrypt); almeno una lettera e una cifra.
- Non deve stare nella lista di codici comuni (≈ 200 voci, nessuna dipendenza), non deve contenere la parte locale dell'email né nome o cognome.
- Si confrontano solo hash, mai i codici in chiaro nei log.
- "Genera un codice" usa `crypto.getRandomValues` su un alfabeto senza caratteri ambigui (12 caratteri, in gruppi di 4) per il codice iniziale che A consegna a B.
- Campi con `type="password"`, mostra/nascondi, `autocomplete` `current-password`/`new-password`.

#### 4.5 Partner B: creazione, consegna, ripristino
1. **Con codice** (sempre disponibile; onboarding passo 2 o Altro > Invito):
   - A inserisce email di B, codice iniziale ("Genera" o scritto a mano) ed etichetta;
   - **ordine (revisione T2, §4.8)**: `create_invitation(email, 'code')` (riga dell'invito ed evento `partner_account_created` **prima**) → `admin.createUser({ email, password, email_confirm: true })` e legame con `create_invitation(email, 'code', nuovo_id)`, oppure `updateUserById(invitee_user_id, { password })` se il DB ha restituito un account riutilizzabile;
   - se l'account Auth esiste già ed è **riutilizzabile** (mai entrato, nessuna membership, non fondatore, nessun invito pendente di un altro matrimonio: predicato unico nel DB, §4.8), la richiesta è trattata come una nuova consegna: il codice viene aggiornato. Altrimenti il DB risponde `email_in_use` → "Questa email non si può usare". **Il controllo è del DB** (`create_invitation`), non del server;
   - A consegna il codice di persona; la UI non lo mostra più dopo la conferma;
   - al primo accesso di B la membership nasce da `accept_pending_invitation`;
   - **revoca** prima del primo accesso: prima `revoke_invitation` (blocca, rifiuta se accettato, evento `invite_revoked`, restituisce l'account da cancellare solo se è quello legato all'invito ed è ancora riutilizzabile), poi `deleteUser` su quell'id e su nessun altro.
2. **Via email** (solo con le email attive, §7):
   - account creato senza codice;
   - invito `method='email'` con token monouso (32 byte da `crypto.randomBytes` **generati dal server**, al DB solo lo sha256, 7 giorni). Un partner che chiama la RPC direttamente con un hash scelto da lui non ottiene più del metodo con codice (sceglie il codice di un account riutilizzabile, BR20), perché il bersaglio deve essere riutilizzabile anche all'uso del link;
   - l'email porta a `/invito/[token]`, dove **B sceglie il proprio codice** (POST: `invitation_by_token(hash)`, solo chiave segreta, che verifica invito pendente e non scaduto e invitato riutilizzabile e restituisce l'id → `updateUserById(id, password)` → login → accettazione);
   - "Invia di nuovo" ruota il token; "Revoca" annulla.
3. **Cambio del proprio codice** (`/altro/account`):
   - richiede il codice attuale, verificato con `signInWithPassword` su un client senza cookie e soggetto allo stesso limitatore (`login_gate` → verifica → `login_record`);
   - poi `authorize_account_op('change_own_code')` (evento `code_changed`, scritto prima della chiamata admin);
   - poi **una sola** chiamata `admin.updateUserById(self, { password, app_metadata: { r2y_must_change_code: false } })` (codice e flag insieme; revisione T2: non più `updateUser` con la sessione, così `secure_password_change` non tocca il percorso dell'app);
   - l'aggiornamento admin del codice chiude le sessioni esistenti (da verificare in un test di T7a): il server rifà `signInWithPassword` con il nuovo codice sul client con cookie e chiude la sessione di verifica.
4. **Codice dimenticato**:
   - **(a) sempre**: l'altro partner imposta un **codice temporaneo**: `authorize_account_op('set_temp_code')` (evento `temp_code_set` scritto **prima**, visibile in Novità al bersaglio) → `updateUserById(target, { password, app_metadata.r2y_must_change_code = true })`. `app_metadata` deve essere unito e non sostituito (`r2y_founder`, `r2y_role` restano): test in T7b. L'aggiornamento chiude anche le sessioni del bersaglio, comprese quelle eventualmente rubate;
   - con le email attive, al bersaglio parte anche un'email di notifica di sicurezza;
   - al login successivo il bersaglio deve cambiare il codice;
   - **(b) solo con le email attive**: "Hai dimenticato il codice?" → `resetPasswordForEmail` → template di recupero Supabase con link `token_hash` → `/auth/conferma` (POST) → scelta del nuovo codice. Senza email il link non è mostrato; la pagina spiega "Chiedi a {partner} di impostarti un codice temporaneo".
   - Se nessuno dei due partner ricorda il codice e le email non sono attive, resta il runbook: lo sviluppatore lo reimposta dal pannello Supabase.
   - **Approvato (Q-C, D51)**: il codice iniziale scelto da A è solo *suggerito* da cambiare (banner non bloccante); il codice **temporaneo** di ripristino *obbliga* al cambio.

#### 4.6 Regole sulle email
- **A modifica l'email di B finché B non è mai entrato**: prima `update_partner_email` (riga partner e invito; rifiuta se B è membro o se l'account legato è già entrato, `email_in_use` se la nuova email ha già un account; restituisce l'account legato e l'email precedente), poi `admin.updateUserById(target, { email, email_confirm: true })`; se la chiamata admin fallisce, compensazione con `update_partner_email` all'email precedente (§4.8). Con invito via email, `rotate_invitation` e nuovo invio.
- **Dopo il primo accesso, ciascuno modifica solo la propria email di accesso**:
  - nuova email inserita due volte + codice attuale (verificato come in §4.5.3);
  - `authorize_account_op('change_own_email', null, nuova)` (controlli + evento `email_changed` prima) → `admin.updateUserById(self, { email, email_confirm: true })`: nessuna email di conferma necessaria, funziona anche senza fornitore email;
  - `sync_my_email()`, richiamata anche da `post-login` a ogni accesso (idempotente) se fallisce qui; con le email attive, notifica al vecchio indirizzo.
  - Il cambio diretto via `PUT /user` è chiuso da `double_confirm_changes` (§4.1).
  - Un refuso si corregge con un nuovo cambio mentre si è ancora collegati; da scollegati c'è il runbook (pannello).
- **Etichetta, nome e cognome**: modificabili da entrambi per entrambi.

#### 4.7 Proxy e intestazioni
- Proxy: `getClaims()`; con errori di rete o 540 riscrive su `/servizio` invece di reindirizzare al login (DES-16).
- Intestazioni: noindex, `frame-ancestors 'none'`, CSP di base; `Referrer-Policy: no-referrer` su `/invito/*`, `/auth/*`, `/email/*`.

#### 4.8 Contratto DB → operazioni admin di Auth (revisione sicurezza T2, `reviews/code-6.md` REV-1..REV-5)
**Regola generale**
- Per ogni operazione sugli account: **prima la mutazione nel DB con il JWT dell'utente**, che blocca le righe (ordine sotto), ricontrolla lo stato, scrive l'evento di account e restituisce il bersaglio; **poi** la chiamata admin con la chiave segreta, **solo sull'id restituito** da quel passo (o appena creato dal passo admin). Mai l'ordine inverso.
- Mai un id ottenuto da una ricerca per email (`auth_user_id_by_email` resta solo per il bootstrap) né da `wedding_partners.user_id` letto a parte.
- Le funzioni restano chiamabili con il JWT (il DB decide); la chiave segreta serve solo all'esecuzione.

**Account riutilizzabile**: un solo predicato `private.account_reusable(user_id, wedding_id)`, usato da `create_invitation`, `update_partner_email`, `revoke_invitation`, `authorize_account_op('set_temp_code')` e `invitation_by_token`. Vero solo se l'account Auth:
1. esiste e non è cancellato;
2. **non è mai entrato** (`auth.users.last_sign_in_at is null`);
3. non ha membership in nessun matrimonio;
4. non è un fondatore (`raw_app_meta_data->>'r2y_founder'`);
5. non ha un invito pendente di un **altro** matrimonio (per id o per email).

Solo un account riutilizzabile può ricevere un codice, cambiare email o essere cancellato da chi non ne è il titolare.

**Ordine e fallimenti per operazione**

| Operazione | 1. DB (JWT) | 2. Admin (chiave segreta) | Se il passo 2 fallisce | Ricontrollo del server |
|---|---|---|---|---|
| Creare B con codice | `create_invitation(email,'code')`: `email_in_use` se l'account dell'email esiste e non è riutilizzabile; inserisce o riconsegna l'invito, lega `invitee_user_id` all'account riutilizzabile se c'è; evento `partner_account_created`; restituisce `{ id, invitee_user_id }` | `invitee_user_id` nullo → `createUser({ email, password, email_confirm: true })`, poi `create_invitation(email,'code', nuovo_id)` per legarlo (non conta come nuovo invio); altrimenti `updateUserById(invitee_user_id, { password })` | Invito pendente senza account, o account non legato: "Non riuscito, riprova". Ripetere converge: la riconsegna ritrova l'account per email (riutilizzabile) e lo lega. "Already registered" per una corsa → un solo nuovo tentativo dal passo 1 | Admin solo su `invitee_user_id` restituito o sull'id appena creato |
| Invito via email | Token generato dal server, al DB solo lo sha256; `create_invitation(email,'email', null, hash)` come sopra | Se nessun account: `createUser({ email, email_confirm: true })` senza codice + legame; poi l'invio | Email non partita: invito pendente, "Invia di nuovo" (`rotate_invitation` prima, invio dopo) | — |
| `/invito/[token]` (POST, senza sessione) | `invitation_by_token(hash)` (nuova, **solo chiave segreta**): blocca l'invito, pendente e non scaduto, invitato riutilizzabile → `{ invitation_id, user_id }`; altrimenti esito neutro | `updateUserById(user_id, { password })` → `signInWithPassword` → `accept_pending_invitation` | Il link resta valido finché l'invito non è accettato: ripetere converge | Admin solo sull'id restituito |
| Cambiare l'email di B in attesa | `update_partner_email('B', nuova)`: `partner_already_joined` se B è membro o l'account legato è già entrato; `email_in_use` se la nuova email ha un account Auth; aggiorna riga partner e invito; restituisce `{ target_user_id, old_email }` (`target_user_id` = account legato e riutilizzabile, o nullo) | Se `target_user_id`: `updateUserById(target, { email, email_confirm: true })`; con invito via email, `rotate_invitation` + invio | **Compensazione**: `update_partner_email('B', old_email)`, poi errore. Se fallisce anche quella, ripetere il cambio converge (entrambi i passi sono idempotenti) | Admin solo sull'id restituito |
| Revocare B in attesa | `revoke_invitation(id)`: `already_accepted` se accettato; revoca idempotente; evento `invite_revoked`; restituisce `{ delete_user_id }` = account legato all'invito **solo se riutilizzabile** | `deleteUser(delete_user_id)` se non nullo | Invito revocato (B non entra più nello spazio), account orfano senza membership. Ripetere la revoca restituisce di nuovo l'id e completa | Mai cancellare un id non restituito dal passo 1 |
| Codice temporaneo | `authorize_account_op('set_temp_code', slot)`: blocca, bersaglio = l'altro partner membro o l'invitato legato riutilizzabile; evento `temp_code_set` | `updateUserById(target, { password, app_metadata: { r2y_must_change_code: true } })` | Evento senza cambio: falso allarme accettato (direzione sicura); "Non riuscito, riprova" | Admin solo sull'id restituito |
| Cambio del proprio codice | 0. verifica del codice attuale con il limitatore; 1. `authorize_account_op('change_own_code')`: evento `code_changed` | `updateUserById(self, { password, app_metadata: { r2y_must_change_code: false } })`, poi nuovo login sul client con cookie | Evento senza cambio (sicuro); errore e nuovo tentativo | `self` = id restituito dal DB |
| Cambio della propria email | 0. come sopra; 1. `authorize_account_op('change_own_email', null, nuova)`: `email_in_use`; evento `email_changed` | `updateUserById(self, { email, email_confirm: true })` → `sync_my_email()` | Evento senza cambio (sicuro). Se fallisce solo `sync_my_email`, la ripete `post-login` | Come sopra |

**Corse coperte**: B che accetta mentre A cambia email o revoca → la RPC del passo 1 blocca l'invito e risponde `already_accepted`/`partner_already_joined`, quindi nessuna chiamata admin tocca un account attivo. Un'accettazione dopo il passo 1 trova l'invito revocato o con un'altra email (`revoked`/`not_found`): esito deterministico.

**Eventi di account (REV-3)**
- Li scrive **solo il DB**, dentro la RPC del passo 1, con `actor_id = auth.uid()`, e il tipo e il bersaglio sono derivati dall'operazione e dallo stato, non dichiarati dal chiamante.
- `record_account_event` esce dall'allowlist di `authenticated`; diventa un helper `private`.
- L'evento è scritto **prima** dell'operazione admin, nella stessa transazione dell'autorizzazione, quindi non si perde. Il rischio inverso è un evento per un'operazione poi fallita: è accettato, perché un avviso in più è sicuro e uno mancante no.
- Un partner che chiama la RPC direttamente produce solo eventi di operazioni che è autorizzato a fare: niente falsi su tipi o bersagli arbitrari.
- Il cambio diretto via GoTrue (R26) non produce eventi.

**Ordine unico dei lock (REV-4)**
1. Lock advisory, se presenti: `create_wedding:uid`, `accept:uid`.
2. `weddings` (`for update`).
3. `wedding_partners`.
4. `invitations`.
5. Inserimenti in `memberships` e `account_events`.

Le RPC che partono da un id di invito (`rotate_invitation`, `revoke_invitation`, `accept_pending_invitation`, `invitation_by_token`) leggono prima `wedding_id` senza lock (è immutabile per trigger), bloccano il matrimonio, poi bloccano l'invito e **ricontrollano** lo stato. Anche `authorize_account_op` e `sync_my_email` bloccano il matrimonio per primo. Sempre `for update`, mai `for share`, sulle stesse righe.

**Migrazione**: `20261201100000_core.sql` non è mai stata applicata a un ambiente remoto (non esiste ancora `migrate.yml`), quindi le correzioni si fanno nel file, senza una migrazione nuova.

### 5. Motore del Percorso

- **Contenuti**: il modello di tappe viene da una **specifica del product-owner** (task T0, PO-9) e si traduce in `src/content/milestones/it.ts`, validato da zod.
  - Campi: `key`, `version`, `title`, `advice`, `category`, `offset|null`, `rites`, `priority`, `highlightFirst`, `bureaucratic`.
  - La tappa "Scegli il rito" (Q3 approvata) ha `highlightFirst` e nessun offset.
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

**Novità Gate B**
- **Periodo come data scelta** (Q7): scegliere uno scenario periodo chiede il giorno esatto, via `choose_option(…, exact_date)`. Lo scenario diventa data fissa; lo storico conserva il periodo.
- **Data collegata a una location** (Q7): dove compare la data compare anche la location collegata, come "3 set 2027 · Villa Rossi". Vale per `DateScenarioList`, `OptionCard`/Confronta 2, `ReferenceBadge` e testata del Percorso, conto alla rovescia della Home, riepilogo dell'onboarding, `ScenarioPicker`, banner di anteprima, export (JSON + colonna CSV), email del riepilogo.
  - Il modulo dello scenario ha il campo facoltativo "Collegata a una location" con le location candidate non cancellate.
  - Una location scartata resta mostrata come "(scartata)"; una location cancellata scollega la data.

### 6. Budget

- **Totale** = ultima versione.
- **Calcoli**: `src/domain/budget/totals.ts` (funzioni pure).
- **Avvisi** (`warnings.ts`):
  - Concordato > Assegnato (categoria);
  - Concordato > totale;
  - Pagato > Concordato (conferma);
  - totale ridotto sotto il Concordato;
  - **Assegnato > totale**, mostrato come "Hai assegnato € X oltre il totale" con lo stesso tono caldo, mai come numero negativo (PO-7).
- **Importi** (`src/lib/money.ts`): parsing **dalla stringa in centesimi interi**, mai `parseFloat * 100`. Regole di Q10 (approvata); tetto massimo; `inputmode="decimal"` verificato da un test di componente.
- **Categorie con voci**: per eliminarle prima si spostano le voci ("Sposta in…"); l'importo assegnato torna "non assegnato" (Q4 approvata).

### 7. Email: opzionali, interfaccia unica, job, promemoria
- **Interruttore unico**: `emailEnabled()` (`src/lib/email/index.ts`, solo lato server) è vero solo se `EMAIL_TRANSPORT` è `resend` con `RESEND_API_KEY` ed `EMAIL_FROM` presenti, oppure `smtp` (locale/CI) con `SMTP_HOST`. **`EMAIL_TRANSPORT` assente o `none` significa nessuna email**:
  - niente promemoria, riepilogo, inviti via email, notifiche di sicurezza né recupero del codice via email;
  - Supabase Auth non serve per il login, quindi non c'è alcuna dipendenza email.
- **Avviso in app quando le email sono spente**:
  - il valore è calcolato nel layout `(app)` (server) e passato come prop a `EmailOffBanner` (T3);
  - è un banner persistente e discreto su Home e Percorso: "Le email sono spente: i promemoria li trovi solo qui nell'app";
  - in Altro > Promemoria gli interruttori sono sostituiti da una spiegazione;
  - le opzioni solo-email (invito via email, "Hai dimenticato il codice?" via email) sono nascoste e spiegate.
  - Nessuna variabile `NEXT_PUBLIC_`: il valore resta sul server e segue la configurazione di runtime.
- **Trasporti**: `EmailSender` (smtp/resend); con email spente si usa `NullSender`, che non viene mai chiamato. Escape HTML, rimozione di `\r\n`, template con firme esplicite, nota "data provvisoria", `APP_NAME = "roadmap2yes"` (Q15).
- **Template**:
  - app: invito con link "scegli il tuo codice", notifica "codice temporaneo impostato da {nome}", notifica "email di accesso cambiata", promemoria raggruppato, riepilogo;
  - Supabase Auth: solo il **recupero codice** (`supabase/templates/recovery.html`, palette Giardino). Nessun template magic link/OTP.
  - In produzione, con le email attive, Supabase Auth usa il custom SMTP di Resend solo per il recupero.
- **Job giornaliero** (`runDailyJob`, Vercel Cron `0 5 * * *` UTC):
  1. heartbeat (sempre);
  2. **se `emailEnabled()` è falso: fine**. Nessun claim, così nulla resta "consumato". Quando le email si accendono si parte dagli elementi la cui finestra include oggi, senza recuperare il passato;
  3. `planReminders(today)`:
     - `task_7d` e `task_due`;
     - destinatari per assegnatario, **solo partner con membership**: per B vuol dire dopo il suo primo accesso (Q5);
     - promemoria per compito attivo (Q9 approvata: interruttore per compito tenuto, da aggiungere ad AC50);
     - niente "7 giorni" per scadenze impostate o cambiate dentro la finestra (Q8);
  4. **una sola email al giorno per utente** (Q8 approvata) con i blocchi "tra 7 giorni"/"oggi";
  5. riepilogo il lunedì, con recupero da lunedì a mercoledì (Q11), una volta per settimana ISO;
  6. claim, ripresa dei claim scaduti (15 minuti) con la stessa `batch_key`, tetti (50/giorno, 1.500/mese, solo app), `skipped_quota` + flag.
- **Disattivazione**: token HMAC; GET non modifica nulla; POST one-click; intestazioni `List-Unsubscribe`.
- **Controllo settimanale**: `keepalive.yml` + `scripts/keepalive-check.ts` (staging e prod, heartbeat oltre 36 h o quota → fallisce).

### 8. Temi (AC49): tutti e 12 approvati (Q6)
- **`APPROVED_THEME_IDS` = i 12 temi**, predefinito `giardino`. `themes.css` senza `:root`; applicazione DB → cookie → giardino; contrasto (gate su tutti e 12, chiaro e scuro, coppie estese; regola "accent solo su background/card").
- **Font con 12 temi approvati**:
  - si dichiarano **24 famiglie** `next/font/google` (`latin`, `swap`, `preload: false`; titoli 1 peso, corpo 400+600): il build contiene circa 70 file woff2;
  - il browser scarica solo le facce del tema attivo, quindi il budget per tema (≤ 4 file, ~120 KB, `check-font-budget.ts`) resta il gate;
  - la **galleria** carica le 12 famiglie dei titoli solo quando si apre (~12 × 25–40 KB), in modo pigro con `IntersectionObserver` sulle carte visibili. Il corpo si carica alla selezione, con `document.fonts.load()` (max 1,5 s);
  - axe sulla matrice dei temi solo nel job notturno (12 × 2 × 3 schermate);
  - piano B se l'LCP misurato supera 2,5 s: `next/font/local` con preload dei 2 file del tema attivo.

### 9. Concorrenza, novità, stati

- **Conflitti**: `versioned-update.ts` restituisce `{ conflict, current, changedBy, changedAt }`. Il `ConflictDialog` (T3) riceve una **mappa campo→etichetta** per entità (`features/*/field-labels.ts`, DES-29), con focus trap annidato sopra gli sheet.
- **Novità** (AC41): `record_seen()` sposta `last_seen_at` in `previous_seen_at`. Se `previous_seen_at` è nullo (prima visita), al posto delle Novità compare la **carta di benvenuto** (`WelcomeCard`, chiusa con `dismiss_welcome`, DES-20).
- **Servizio non disponibile** (DES-16; testi di Q14 e Q16 approvati):
  - `src/lib/supabase/errors.ts` → `classifyDbError()` con due esiti: `paused` (HTTP 540 / risposta "project paused") e `unreachable` (rete, timeout, altri 5xx);
  - proxy e root layout non reindirizzano al login in questi casi: riscrivono su `/servizio?motivo=…`, pagina **senza accesso al DB** (`PublicShell` + `ServiceDownPage`, tema da cookie) con testi di design §7.3;
  - `global-error.tsx` è autosufficiente (stili inline minimi, nessun import di dati);
  - offline: banner + `useFormDraft`.
- **Novità**: include anche gli `account_events` (codice temporaneo impostato, email cambiata).
- **Email spente**: il layout `(app)` passa `emailEnabled()` a `EmailOffBanner` (§7).

### 10. Esportazione

- **Generazione**: lato client con query RLS; JSON con `schemaVersion: 1` (senza data di nascita, senza `token_hash`, mai codici).
- **CSV**: `compiti.csv` e `budget.csv` con `;`, BOM, escaping RFC 4180.
- **File**: 3 download separati con data nel nome.
- **Promemoria**: `record_export()` aggiorna la data dell'ultimo export, usata per il promemoria a 30 giorni.
- **In più**: la location collegata a ogni scenario di data (JSON e colonna CSV).

### 11. Ambienti e configurazione
| Variabile | Locale | Preview (Vercel) | Production (Vercel) |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | locale | staging | prod |
| `SUPABASE_SECRET_KEY` | locale | staging | prod |
| `NEXT_PUBLIC_SITE_URL` | localhost | `VERCEL_BRANCH_URL` | URL prod |
| `R2Y_BOOTSTRAP_EMAIL`, `R2Y_BOOTSTRAP_ACCESS_CODE`, `R2Y_BOOTSTRAP_ROLE` | finti `@example.test` | **account di smoke** (Q13) | primo partner reale (solo in Vercel) |
| `R2Y_LOGIN_MAX_FAILURES_EMAIL`/`_IP`, `R2Y_LOGIN_LOCK_MINUTES` | default | default | default (5/20/15) |
| `EMAIL_TRANSPORT` | `smtp` | assente (email spente) | assente → `resend` dopo il dominio |
| `SMTP_HOST`/`SMTP_PORT` | mail catcher | — | — |
| `RESEND_API_KEY`, `EMAIL_FROM` | — | — | dopo il dominio |
| `EMAIL_DAILY_CAP`, `EMAIL_MONTHLY_CAP` | 50/1500 | — | 50/1500 |
| `CRON_SECRET`, `EMAIL_LINK_SECRET` | finti | casuali | casuali |
| `E2E_CLOCK` | solo e2e/CI | mai | mai |

- **Supabase remoto** (pannello, checklist): `enable_signup` off, provider email attivo, lunghezza minima 10, lettere + cifre, limite di login per IP al default, `site_url` e redirect (servono solo per recupero e invito via email), template di recupero, SMTP Resend in prod solo dopo il dominio.
- **Vercel**: le variabili `R2Y_BOOTSTRAP_*` e le chiavi sono marcate *Sensitive*.

### 12. CI e migrazioni

- **`ci.yml`, job su ogni PR**:
  - **`checks`**: lint (incluse guardie `use cache`, `text-accent` ed email solo `@example.test` in tutto il repo), typecheck, unit (anche con `TZ` alternativi), allineamento di `themes.css` e `database.types.ts`, budget dei font;
  - **`db`**: `supabase start` (servizi esclusi; i nomi `-x` vanno verificati sulla versione CLI bloccata, `analytics` disattivato in config), `db reset` una volta, pgTAP (developer + QA), integration e acceptance Vitest (`fileParallelism: false` dove si leggono stati globali);
  - **`e2e-mobile`**: Chromium 360 px, spec complete;
  - **`secrets`**: gitleaks su tutta la cronologia.
- **`e2e-full`** (su push a main, ogni notte e con etichetta `e2e-full` sulla PR): desktop Chromium, smoke WebKit (login, onboarding, Percorso a 390 px; etichettato "Playwright WebKit", non Safari), progetto `time` seriale, progetto `degraded` (§9), progetto `email-off` (secondo `next start` senza `EMAIL_TRANSPORT`), axe sulla matrice dei temi.
- **Cache**: browser Playwright e immagini Docker di Supabase.
- **Retry**: `retries: 1` solo in CI. Un test passato al secondo tentativo viene **riportato come flaky** (bug da correggere, non verde silenzioso).
- **Dati**: utenti e matrimoni unici per test (`@example.test` casuali); nessuna pulizia, perché le tabelle append-only lo impediscono.
- **`migrate.yml`**: staging sulle PR con migrazioni; prod al push su main nell'environment `production`. Solo migrazioni additive.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Magic link / codice OTP via email (piano precedente) | Niente password | Dipende da un fornitore email, che manca fino al dominio | Sostituito su richiesta dello sviluppatore: l'accesso deve funzionare senza email |
| Codici gestiti da noi (hash scrypt in tabella + sessione creata dal server con `generateLink`) | Blocco per account completo, nessun endpoint password esposto | Autenticazione "fatta in casa", più codice da proteggere; l'OTP di GoTrue resterebbe comunque un percorso | Password di Supabase Auth (bcrypt, limiti per IP, policy imposta dal server) + limitatore applicativo; rischio residuo documentato (R20) |
| CAPTCHA Turnstile sul login | Blocca anche il brute force diretto su GoTrue | Servizio esterno in più (account Cloudflare), attrito per due utenti | Rimandato (Q-B) |
| Bootstrap solo con `npm run bootstrap` | Esplicito | Serve la chiave segreta di prod sul portatile; passaggio manuale a ogni ambiente | Tenuto come opzione locale/staging; in prod il percorso protetto nel login |
| Bootstrap in `instrumentation.ts` all'avvio | Automatico | Gira a ogni avvio a freddo; fallisce se il DB è in pausa | Percorso protetto nel login, solo per l'email di bootstrap |
| Bootstrap via SQL (allowlist) | Nessuna variabile | Passaggio manuale; non porta il codice né il ruolo | Sostituito su richiesta dello sviluppatore |
| `auth.updateUser({ email })` con conferma via email | Standard Supabase | Senza fornitore email il cambio è impossibile | Cambio con verifica del codice attuale + admin |
| Account di B creato all'accettazione di un link | Nessun account inutilizzato | Senza email non c'è un link da aprire | Account creato subito con codice; la membership nasce al primo accesso |
| (Le alternative di round 1 su stack, RLS, riferimento, inviti Supabase, orologio, scheduler, deploy, librerie restano valide) | | | |

## Impacts
- **Dati e migrazioni**: 3 migrazioni nuove, additive.
  - Rispetto al round 1: `account_events`, `private.login_attempts`, `invitations.method/invitee_user_id`, `date_scenarios.location_option_id`.
  - Tolte `founder_allowlist` e `signin_attempts`: non sono mai esistite in un ambiente, quindi nessuna migrazione distruttiva.
- **Contratti**: server action `signIn`, `signOut`, `changeOwnCode`, `changeOwnEmail`, `createPartnerAccount`, `setTemporaryCode`, `updatePendingPartnerEmail`, `revokePendingPartner`; route `/invito/[token]` e `/auth/conferma`, solo con email attive.
- **Sicurezza**:
  - **cambia il modello di autenticazione** (password di Supabase con policy imposta dal server, limitatore applicativo, bootstrap da variabili, operazioni admin autorizzate dal DB, eventi di account visibili all'altro partner): **richiede l'approvazione esplicita dello sviluppatore al Gate B** e il round di revisione sicurezza in F3;
  - la chiave segreta passa da 3 a 4 ambiti, tutti server-only e con allowlist di import.
- **Dipendenze**: **nessuna nuova** rispetto a P1. Il CAPTCHA non viene introdotto.
- **Configurazione**: variabili `R2Y_BOOTSTRAP_*` e `R2Y_LOGIN_*`; con `EMAIL_TRANSPORT` assente le email restano spente in modo voluto.

### Proposta per `.adf/project.md` (invariata)
- `docker: true`.
- Comandi `setup` / `start` / `lint` / `typecheck` / `test` / `build` / `e2e` come nella versione precedente. In più `npm run bootstrap` (solo per locale e staging) va citato in README e runbook, non in `commands`.

## Risks
Limiti dei piani gratuiti non riverificati online in questa sessione: il release-manager li ricontrolla alla creazione dei servizi.

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Pausa di Supabase free; ripristino manuale | Media | Alta | Cron + controllo settimanale; `/servizio`; runbook; export |
| R2 | Workflow schedulati disattivati dopo 60 giorni | Media | Media | Primario Vercel; runbook |
| R3 | Cron impreciso o saltato | Media | Bassa | Recupero; idempotenza |
| R4 | Dominio non acquistato | Certa ora | **Bassa** (l'accesso non dipende più dalle email) | Avviso in app; promemoria visibili in app; Resend da attivare dopo |
| R5 | Quote Resend free | Bassa | Media | Email raggruppate; tetti; segnalazione |
| R7 | Errori RLS, aggiramento delle invarianti, cache | Bassa | Alta | Matrice delle scritture; test generati (QA); lint; revisione sicurezza |
| R8 | Divergenza TS/SQL sulle date | Media | Media | Vettori condivisi |
| R10 | Gara deploy/migrazione | Media | Bassa | Migrazioni additive |
| R11 | Fuga via repo pubblico | Bassa | Alta | Guardia `@example.test`; gitleaks; variabili di bootstrap solo in Vercel o `.env.local` |
| R12 | Peso dei font con 12 temi | Media | Media | Budget per tema; galleria pigra; piano B |
| R13 | Nessun backup scaricabile sul free | Media | Alta | Export + runbook |
| R14 | Cambi di versione | Media | Bassa | Lockfile, contratti degli helper |
| R16 | Ricorsione dei trigger | Bassa | Media | Guardie + pgTAP |
| R18 | Orologio di test in produzione | Bassa | Alta | Doppia guardia + checklist |
| R19 | Tempo di CI | Alta | Bassa | Job separati |
| R20 | **Brute force sui codici** su un'app pubblica: l'endpoint password di GoTrue è raggiungibile direttamente con la chiave pubblicabile e non c'è blocco per account sul piano free | Media | Alta | Policy imposta da Supabase (≥ 10, lettere + cifre: ~10^17 combinazioni anche per codici semplici); lista di codici deboli lato app; limite per IP di Supabase; limitatore applicativo per email/IP sul percorso dell'app; codice iniziale generabile casualmente; trasparenza (`account_events` in Novità); CAPTCHA come rinforzo (Q-B). Revisione sicurezza in F3 |
| R21 | Codice di bootstrap salvato in Vercel | Media | Media | Variabile *Sensitive*; create-only; runbook: cambiare il codice al primo accesso e togliere la variabile |
| R22 | **Nessun recupero via email senza Resend**: se entrambi i partner dimenticano il codice | Bassa | Media | Codice temporaneo dall'altro partner; runbook di reimpostazione dal pannello; con Resend attivo anche il link di recupero |
| R23 | Blocco usato come disservizio: qualcuno che conosce l'email di Tony ripete codici errati dal percorso dell'app | Bassa | Bassa | Blocco breve (15 minuti) e non progressivo, per email e per IP; nessuna informazione sull'esistenza dell'account |
| R24 | Endpoint OTP/recupero di GoTrue raggiungibili direttamente anche se l'app non li usa | Bassa | Bassa | Senza SMTP personalizzato Supabase consegna solo ai membri dell'organizzazione; dopo Resend le email arrivano solo all'indirizzo reale dell'utente; limiti per IP di Supabase |
| R25 | Refuso nell'email di accesso cambiata da sé | Bassa | Media | Email inserita due volte; correzione da collegati; runbook dal pannello |
| R26 | **Sessione rubata** (es. XSS: i cookie di `@supabase/ssr` sono leggibili dal client) che cambia codice o email chiamando direttamente `PUT /user` di GoTrue, senza il codice attuale (AC56, AC58 valgono solo sul percorso dell'app) | Bassa | Alta | Impostazioni Auth di §4.1 (P2): email mai cambiata senza conferma su entrambi gli indirizzi; codice cambiabile solo entro 24 ore dal login. **Residuo**: entro 24 ore il codice si può cambiare. Recupero: codice temporaneo dall'altro partner, che chiude anche le sessioni del bersaglio; CSP; runbook dal pannello. Nessun evento in Novità per il cambio diretto |

## Tasks
**Regole di parallelismo**
- `package.json` e il lockfile sono di T1, che pre-dichiara anche gli script (incluso `bootstrap`).
- Migrazioni con prefissi riservati e seed per task.
- `database.types.ts` si rigenera, non si unisce a mano.
- Cartelle disgiunte tra task paralleli.
- Componenti condivisi a T3.
- QA possiede i test di accettazione e gli e2e.

| # | Task | Owner | Files (owned) | Depends on | AC |
|---|---|---|---|---|---|
| T0 | Specifica delle tappe e frasi di stile | product-owner | `.adf/features/FEAT-2026-001/milestones-spec.md` | — | AC25, BR7 |
| T1 | **Scaffolding + CI**:<br>- Next/TS/Tailwind/shadcn;<br>- lint (guardie: `use cache`, `text-accent`, **import di `admin.ts` solo dai 4 ambiti**);<br>- Vitest, Playwright (progetti `mobile`, `desktop`, `webkit-smoke`, `time`, `degraded`, **`email-off`**);<br>- `config.toml` locale (registrazione chiusa, **password ≥ 10 lettere + cifre**, limiti di test, mail catcher, solo `public`);<br>- script npm, `.env.example` (con `R2Y_*` finti);<br>- intestazioni, client Supabase, `errors.ts`;<br>- `proxy.ts`, che delega le regole a `features/auth/guards.ts`;<br>- `clock.ts`, `app-config.ts`;<br>- CI, gitleaks, guardia `@example.test`, README | developer | `package.json`, lockfile, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` (+ `tests/lint-fixtures/**`), `.prettierrc`, `postcss.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `supabase/config.toml`, `.env.example`, `.nvmrc`, `src/app/robots.ts`, `src/lib/supabase/{server,client,admin,errors}.ts`, `src/proxy.ts`, `src/lib/clock.ts`, `src/lib/app-config.ts`, `src/components/ui/*`, `src/lib/utils.ts`, `.github/workflows/ci.yml`, `.gitleaks.toml`, `scripts/check-test-emails.ts`, `README.md` (setup) | — | AC1, AC43, AC45 |
| T2 | **DB core e RLS**:<br>- tabelle core, compresi `account_events`, `private.login_attempts`, `invitations.method`;<br>- `has_permission`, trigger generici, audit con esclusioni, composite unique, allowlist delle funzioni;<br>- RPC: `create_wedding` (claim fondatore), `accept_pending_invitation`, `create/rotate/revoke_invitation`, `upsert_partner_b`, `update_partner_email`, `sync_my_email`, `authorize_account_op`, `record_account_event`, `login_gate`/`login_record`, `auth_user_id_by_email`, `record_heartbeat`, `last_heartbeat`, `record_seen`/`record_export`/`dismiss_welcome`;<br>- seed, pgTAP, `versioned-update.ts`<br>- **Rework F3 (`reviews/code-6.md`)**: contratto §4.8 (`private.account_reusable`; `create_invitation`/`update_partner_email`/`revoke_invitation` restituiscono il bersaglio e scrivono l'evento; `authorize_account_op` volatile con `change_own_code` e `new_email`; `invitation_by_token` solo chiave segreta; `record_account_event` senza grant; ordine dei lock), `login_record` che non cancella un blocco attivo (§4.3), più REV-6..REV-8 | developer | `supabase/migrations/20261201100000_core.sql`, `supabase/seeds/01_core.sql`, `supabase/tests/{00_helpers,core_*}.sql`, `src/lib/supabase/{versioned-update,database.types}.ts`, `tests/integration/core.*.test.ts` | T1 | AC3–AC6, AC10, AC11, AC40, AC46 |
| T3 | **Design system, temi, shell e componenti condivisi**: temi (catalogo, `approved.ts`, generatore senza `:root`, contrasto con vettori WCAG e coppie estese), root layout (tema da DB/cookie/default, script modo + `theme-color`, font), `global-error.tsx`, `(app)/layout.tsx` + AppNav, `/servizio` + `ServiceDownPage` + `PublicShell`, EmptyState, ErrorState, OfflineBanner, `useFormDraft`, ConflictDialog (mappa etichette), Countdown, MoneyInput, BudgetBar, DateField, **MonthYearField, DateScenarioList, ReferenceBadge**, ThemeGallery/ThemeProvider, `manifest.ts`, controllo del budget dei font<br>- **Gate B**: tutti e 12 i temi approvati; in più **`AccessCodeField`** (mostra/nascondi, suggerimenti di policy, "Genera") ed **`EmailOffBanner`**; `DateScenarioList`/`ReferenceBadge` mostrano la location collegata | developer (+ designer) | `src/themes/*`, `scripts/{gen-themes-css,check-font-budget}.ts`, `src/app/{layout.tsx,globals.css,themes.css,manifest.ts,error.tsx,global-error.tsx}`, `src/app/(public)/servizio/**`, `src/app/(app)/layout.tsx`, `src/components/*` (non `ui/`), `src/lib/hooks/*` + `src/components/{AccessCodeField,EmailOffBanner}.tsx` | T1 | AC39, AC40, AC49 |
| T4 | **Motore del Percorso**: `plain-date.ts`, vettori condivisi, `content/milestones` (da T0), `domain/timeline/*` (riferimento, offset, generazione per rito, `groupTasks` di design §3.4, anteprima con conteggio, suggerimenti), `domain/home/next-step.ts`, countdown; test unitari, anche con `TZ` alternativi | developer | `src/lib/dates/*`, `tests/fixtures/date-offset-vectors.json`, `src/content/milestones/*`, `src/domain/timeline/*`, `src/domain/home/*` | T1, T0 | AC15, AC16, AC24–AC30, AC32, AC48 |
| T5 | **Puri**: `money.ts` (regole Q10), budget, export (location collegata), novità (`account_events`), `display-name.ts`, **`access-code.ts` + `content/weak-codes.ts`** | developer | `src/lib/money.ts`, `src/lib/display-name.ts`, `src/domain/budget/*`, `src/content/budget-categories.ts`, `src/domain/export/*`, `src/domain/news/*` + `src/lib/access-code.ts`, `src/content/weak-codes.ts` | T1 | AC34–AC38, AC41, AC42, AC46 |
| T6 | **Livello email**:<br>- `emailEnabled()`, `EmailSender`/`NullSender`, escape, HMAC;<br>- template app (invito "scegli il tuo codice", codice temporaneo, email cambiata, promemoria raggruppato, riepilogo);<br>- template Supabase **solo recovery**;<br>- `mailbox.ts` | developer | `src/lib/email/*`, `supabase/templates/*`, `e2e/support/mailbox.ts` | T1 | AC9, AC52 |
| T7a | **Accesso e account propri**:<br>- `/accesso` (email + codice, errori neutri, troppi tentativi, "Hai dimenticato il codice?" secondo le email);<br>- `signIn` con `login_gate`/`login_record`, `bootstrap.ts` + `scripts/bootstrap.ts`;<br>- `guards.ts` + `post-login.ts`, `/su-invito`, `signOut`;<br>- `/altro/account` (cambio codice, cambio email, cambio obbligatorio);<br>- `/auth/conferma` (recupero, solo con email);<br>- integrazione | developer | `src/app/(public)/{accesso,auth,su-invito}/**`, `src/features/auth/**`, `src/app/(app)/altro/account/**`, `scripts/bootstrap.ts`, `tests/integration/auth.*.test.ts`; **revisione T2**: crea `src/features/accounts/admin-ops.ts` con le sole operazioni sul proprio account (cambio codice, cambio email, §4.8; T7b lo estende dopo, in sequenza) e, se P2 è approvato, le tre impostazioni di §4.1 in `supabase/config.toml` (T1 è chiuso) con i test sul `PUT /user` diretto | T2, T3, T5, T6 | AC1–AC4, AC8 (riformulati) |
| T7b | **Account del partner e invito**:<br>- `admin-ops.ts` (create/update/delete pending, temp code);<br>- azioni `createPartnerAccount` (codice), invito via email (se attive), `/invito/[token]` (scegli il tuo codice), revoca, invia di nuovo;<br>- `setTemporaryCode`, `updatePendingPartnerEmail`;<br>- Altro > Invito;<br>- integrazione | developer | `src/features/{accounts,invitations}/**` (con `admin-ops.ts` ricevuto da T7a; ordine delle chiamate secondo §4.8), `src/app/(public)/invito/**`, `src/app/(app)/altro/invito/**`, `tests/integration/accounts.*.test.ts` | T7a | AC5–AC7 (riformulati), AC46 |
| T8 | **DB decisioni + Percorso**: tabelle, matrice delle scritture (grant, trigger `due_overridden`/`completed_*`/`deleted_by`, stato delle opzioni, eventi), composite FK, RPC (`choose_option` con `exact_date`, `reopen_decision` con ripristino dei candidati, `set_reference_scenario(null)`, `add_decision_note`, `acknowledge_task_review`, `insert_template_tasks`, `complete_onboarding`), `add_date_offset`, `sync_timeline`; seed; pgTAP<br>- **Gate B**: `date_scenarios.location_option_id` (FK, trigger, matrice) | developer | `supabase/migrations/20261201200000_decisions_timeline.sql`, `supabase/seeds/02_decisions_timeline.sql`, `supabase/tests/{decisions,timeline}_*.test.sql` | T2, T4 | AC14, AC18–AC24, AC28, AC31 |
| T9 | **DB budget + notifiche**: tabelle, matrice delle scritture, trigger P5, `notification_log` con `batch_key`/`claimed_at`, funzioni `job_*` (solo chiave segreta), seed, pgTAP | developer | `supabase/migrations/20261201300000_budget_notifications.sql`, `supabase/seeds/03_budget.sql`, `supabase/tests/{budget,notifications}_*.test.sql` | T2 | AC33, AC38, AC52, AC53 |
| T10 | **Onboarding + Impostazioni + Profili**:<br>- passo 1 con l'etichetta da `r2y_role`;<br>- passo 2: B con email + modalità (**codice ora** / invito via email se attive / più tardi), `AccessCodeField`;<br>- scenari con location collegata;<br>- Profili con le regole sull'email (§4.6) | developer | `src/app/onboarding/**`, `src/features/{onboarding,settings}/**`, `src/app/(app)/altro/{impostazioni,profili}/**`, `src/content/style-tips.ts` | T3, T4, T5, T7b, T8, T9 | AC12–AC15, AC46, AC48 |
| T11 | **Percorso UI**: testata con riferimento, `ScenarioPicker`, `ScenarioPreviewBanner` (`?anteprima`), fasi, filtri, compito CRUD (`AssigneeField`, `ReminderToggle` (Q9), `field-labels.ts`), Annulla ≥ 8 s, "Eliminati di recente", banner "data riaperta", "Da rivedere", suggerimenti, striscia "Scadenze ricalcolate"<br>- **Gate B**: location nella testata, nel selettore e nel banner; `EmailOffBanner` | developer | `src/app/(app)/percorso/**`, `src/features/timeline/**` | T3, T4, T8 | AC15, AC16, AC20, AC24, AC25, AC29–AC32, AC40 |
| T12 | **Scelte UI**: elenco/dettaglio, OptionCard, Confronta 2, opzioni (data fissa/periodo, location), scelta (con giorno esatto per un periodo, Q7), riapertura, **azioni di riferimento sulle carte scenario (imposta, torna automatico, Annulla, anteprima)**, `HistoryList` con eventi di riferimento, reazioni, `field-labels.ts`<br>- **Gate B**: campo "Collegata a una location" sugli scenari, location mostrata sulle carte e in Confronta 2, giorno esatto per un periodo | developer | `src/app/(app)/scelte/**`, `src/features/decisions/**` | T3, T8 | AC17–AC24 |
| T13 | **Budget UI** | developer | `src/app/(app)/budget/**`, `src/features/budget/**` | T3, T5, T9 | AC33–AC38, AC40 |
| T14 | **Home**: saluto, Countdown + ReferenceBadge, Prossimo passo, pagamenti, Novità, `WelcomeCard`, ultimo export<br>- **Gate B**: location nel conto alla rovescia, `EmailOffBanner`, Novità sugli eventi di account | developer | `src/app/(app)/page.tsx`, `src/features/home/**` | T3, T4, T5, T8, T9 | AC26, AC27, AC41, AC42 |
| T15 | **Altro**: indice con "Esci" e link ad Account; Aspetto (12 temi); Promemoria (interruttori o spiegazione "email spente"); Esportazione; Info | developer | `src/app/(app)/altro/{page.tsx,aspetto,promemoria,esporta,info}/**`, `src/features/{appearance,notifications,export}/**` | T3, T5, T7a, T9 | AC42, AC44, AC49, AC52 |
| T16 | **Job e pipeline**: `runDailyJob`, `domain/reminders/{plan,digest,batch}.ts`, claim/ripresa/tetti, route cron, `/email/disattiva`, `vercel.json`, `migrate.yml`, `keepalive.yml` + `scripts/keepalive-check.ts` con test<br>- **Gate B**: nessun claim con email spente, solo destinatari con membership | developer | `src/app/api/cron/**`, `src/app/(public)/email/**`, `src/domain/reminders/**`, `src/features/jobs/**`, `vercel.json`, `.github/workflows/{migrate,keepalive}.yml`, `scripts/keepalive-check.ts`, `tests/integration/cron.*.test.ts` | T6, T8, T9 | AC43, AC44, AC50–AC53 |
| T17a | **QA: fondamenta + accesso/account/onboarding**:<br>- helper (`loginAs` = login con email + codice delle fixture, senza mailbox);<br>- matrice RLS/grant/scritture (incluse le RPC di account);<br>- concorrenza;<br>- **messaggi neutri e blocco** (QA-4 rivisto);<br>- bootstrap idempotente;<br>- intestazioni;<br>- e2e login, partner con codice, invito via email (con smtp), onboarding | qa | `supabase/tests/qa_*.test.sql`, `tests/acceptance/{rls-api,grants,concurrency,login-neutral,bootstrap,headers}.test.ts`, `e2e/support/{auth,fixtures,clock,stub-supabase}.ts`, `e2e/{login,partner,onboarding}.spec.ts` | T2, T7a, T7b | AC1–AC8, AC10–AC14, AC45, AC46 |
| T17b | QA: Percorso e Scelte (incl. location collegata, periodo con giorno esatto) | qa | `tests/acceptance/timeline.test.ts`, `e2e/{percorso,anteprima,scelte}.spec.ts` | T11, T12 | AC15–AC32, AC40, AC48 |
| T17c | QA: Budget, Home, Altro, job (incl. **email spente**: nessun claim, avviso) | qa | `tests/acceptance/{jobs,unsubscribe,email-off}.test.ts`, `e2e/{budget,home,altro,export,email-off}.spec.ts` | T13–T16 | AC33–AC44, AC49–AC53 |
| T17d | QA: accessibilità, cross-browser, degradato, cache, matrice dei 12 temi | qa | `e2e/{a11y,themes,degraded,cache,cross-browser}.spec.ts`, `reviews/qa-a11y-checklist.md` | T10–T16 | AC39, AC49, NFR |
| T18 | Documentazione (+ runbook bootstrap, codici, reimpostazione dal pannello) | technical-writer | `docs/functional/**`, `docs/technical/**`, `README.md` | T1–T16 | — |

**Gruppi paralleli** (max 3 sviluppatori; QA, PO e technical-writer in aggiunta):
- **G0**: T1 ‖ T0.
- **G1**: T2 ‖ T3 ‖ T4, poi T5 e T6. QA avvia T17a.
- **G2**: T7a ‖ T8 ‖ T9.
- **G3**: T7b ‖ T11 ‖ T12.
- **G4**: T10 ‖ T13 ‖ T14.
- **G5**: T15 ‖ T16. QA T17b–d; T18 in F5.

Totale: 24 task (19 developer, 4 qa, 1 technical-writer) più T0 del product-owner.

## Test plan
- **Strumenti e regole**: come in round 1 (Vitest unit/integration/acceptance, pgTAP, Playwright; orologio §1.1; dati finti `@example.test`; matrice generata dal catalogo).
- **Login negli e2e**: `loginAs` usa email + codice delle fixture, senza mailbox. Il mail catcher serve solo per invito via email, recupero, notifiche e promemoria.
- **Non automatizzabili**:
  - email reali via Resend (dopo il dominio);
  - impostazioni Vercel/GitHub;
  - notifica dello scheduler (una volta);
  - log e artefatti;
  - copy "tu";
  - VoiceOver;
  - **checklist della configurazione Auth remota** (lunghezza minima, requisiti, registrazione chiusa), verificata a mano su staging e prod e in più da un test di smoke sullo staging: un codice di 9 caratteri viene rifiutato.

**Righe nuove o cambiate per il Gate B** (le altre righe del round 1 restano valide e sono riportate in sintesi in fondo)

| Level | What | Cases (incl. edge cases) | AC covered | Owner |
|---|---|---|---|---|
| Acceptance | Registrazione chiusa | `signUp` diretto via GoTrue con la chiave pubblicabile → rifiutato; nessun utente creato da email sconosciute | AC2 (rif.) | qa (T17a) |
| Acceptance | Messaggi neutri e blocco | Email sconosciuta vs codice errato → stesso stato, corpo e intestazioni; dopo 5 errori per una email (esistente o no) → stesso "Troppi tentativi"; blocco per IP a 20; sblocco dopo 15 minuti (timestamp spostato); successo che azzera; 429 di GoTrue mappato; tempi solo come nota | AC2, AC8 (rif.) | qa (T17a) |
| Unit + pgTAP/integration | Policy del codice | < 10 caratteri, solo lettere, solo cifre, nella lista deboli, contiene email o nome → errore con testo esatto; 72 caratteri ok, 73 errore; "Genera" (alfabeto, lunghezza, casualità); il server Auth locale rifiuta < 10 anche con chiamata diretta | AC8 (rif.) | developer (T5, T7a), qa |
| Acceptance | Bootstrap | Variabili assenti → nessuna azione; presenti → utente creato con `r2y_founder` e ruolo; secondo login → nessuna modifica; **codice cambiato in app e poi login con l'email di bootstrap → il codice in app resta valido, quello di env no**; codice di env non valido → nessuna creazione, errore di configurazione senza valori nei log; due login simultanei → un utente; `npm run bootstrap` idempotente | AC3 (rif.) | qa (T17a), developer (T7a) |
| pgTAP | `create_wedding` | Senza claim fondatore → errore; fondatore con matrimonio già creato → errore; invito pendente per l'email (BR13) → errore; successo con etichetta da `r2y_role` | AC3, AC4 | developer (T2) |
| pgTAP + Acceptance | Operazioni di account | `authorize_account_op`: crea B (slot libero / B già entrato / chiamante non partner / altro matrimonio); codice temporaneo solo sull'**altro** partner dello stesso matrimonio, mai su sé stessi, mai cross-matrimonio; email in attesa modificabile solo prima del primo accesso; revoca che cancella l'account mai usato; email di un account esistente e attivo → "non si può usare"; scrittura di `account_events` | AC5, AC6, AC46 (rif.) | developer (T2, T7b), qa |
| pgTAP + Integration | **Contratto DB → admin (§4.8, revisione T2)** | Account riutilizzabile: già entrato, membro, fondatore, con invito pendente di un altro matrimonio → `email_in_use` in `create_invitation` (anche chiamata diretta con un `token_hash` scelto dal partner) e nessun id restituito da `revoke_invitation`/`update_partner_email`/`set_temp_code`; `invitation_by_token` non eseguibile da `authenticated`; `record_account_event` non eseguibile; ogni RPC del passo 1 scrive l'evento giusto con `actor_id` = chiamante; due sessioni: accettazione contro revoca, contro cambio email e contro "Invia di nuovo" → esiti deterministici, nessun 40P01; fallimento simulato del passo admin → stato convergente al nuovo tentativo; `app_metadata` unito dopo il codice temporaneo; sessioni del bersaglio chiuse; `login_record(success)` con blocco attivo → il blocco resta; (se P2) `PUT /user` diretto: email non cambiata, codice rifiutato con una sessione più vecchia di 24 ore (timestamp spostato) | AC5, AC6, AC46, AC54, AC56–AC58 | developer (T2, T7a, T7b), qa (T17a) |
| E2E | Partner con codice | A crea B con codice generato → B entra con quel codice → spazio di A (mai creazione) → suggerimento di cambio; B cambia il codice (serve quello attuale; attuale errato → errore e contatore); revoca prima dell'accesso → il codice non funziona più | AC4–AC7 (rif.) | qa (T17a) |
| E2E (smtp) | Invito via email | Con le email attive: link `/invito/[token]` → B sceglie il codice (policy) → entra; link scaduto, usato o revocato → messaggi; "Invia di nuovo" invalida il vecchio link | AC5–AC7 (rif.) | qa (T17a) |
| E2E | Codice dimenticato | A imposta un codice temporaneo per B → B entra e deve cambiarlo prima di qualunque pagina → evento in Novità per B; con le email attive: notifica e link di recupero (`/auth/conferma` in POST); con le email spente il link non c'è e c'è la spiegazione | AC8 (rif.), AC41 | qa |
| E2E | Regole email | A modifica l'email di B prima del primo accesso → B entra con la nuova; dopo il primo accesso A non può più; ognuno cambia la propria (due volte + codice) → login con la nuova, vecchia rifiutata, riga partner allineata | AC46 (rif.) | qa |
| E2E | Uscita | "Esci" → login; Indietro non mostra dati | Q12 | qa (T17d) |
| Unit + Acceptance + E2E | **Email spente** | `emailEnabled()` per {assente, `none`, `resend` senza chiave, `resend` completo, `smtp`}; `runDailyJob` con email spente → heartbeat sì, zero claim, zero invii; all'accensione nessun recupero del passato; progetto `email-off`: banner su Home e Percorso, Promemoria con spiegazione, opzioni di invito e recupero via email nascoste, invito con codice disponibile | AC9 (rif.), AC50–AC53 | developer (T6, T16), qa (T17c) |
| Unit + Acceptance | Destinatari dei promemoria | B con account ma mai entrato → nessuna email (anche per "Entrambi"); dopo il primo accesso sì; interruttore per compito (Q9) | AC50 | developer (T16), qa |
| pgTAP + E2E | Data collegata a una location | Collegamento solo a opzioni `location` dello stesso matrimonio (cross-matrimonio e tipo sbagliato → errore); cancellazione della location → scollegata + evento; location scartata → "(scartata)"; visualizzazione in carte, Confronta 2, testata del Percorso, Home, selettore, anteprima, export | AC17, AC24 + Q7 | developer (T8), qa (T17b) |
| pgTAP + E2E | Periodo scelto come data | `choose_option(..., exact_date)` dentro il periodo → data fissa, evento con il periodo originale; data fuori dal periodo → errore | AC18 + Q7 | developer (T8), qa |
| Unit + E2E | 12 temi | Gate di contrasto su tutti e 12 (chiaro e scuro); budget dei font per ciascuno; galleria pigra (nessuna richiesta di font del corpo prima della selezione); axe notturno sulla matrice | AC49 | developer (T3), qa (T17d) |

**Righe del round 1 ancora valide** (quelle superate dalle righe sopra sono state tolte):

| Level | What | Cases (incl. edge cases) | AC covered | Owner |
|---|---|---|---|---|
| Acceptance (pgTAP + PostgREST) | **Matrice RLS/grant/scritture vietate, generata dal catalogo** | Ogni tabella/funzione `public` deve avere una voce nella matrice (una nuova senza voce fa fallire la CI). SELECT/INSERT/UPDATE/DELETE incrociati tra due matrimoni, compreso il cambio di `wedding_id` e i figli verso un padre di un altro matrimonio. Scritture dirette vietate: `decision_options.status`, `decision_events`, `memberships`, `tasks.source/template_*/needs_review/completed_*`, `due_date` senza `due_overridden`, `version`, `created_by`, `reactions.user_id` altrui. EXECUTE di `anon`/`authenticated` contro l'allowlist; `private` non esposto; `record_heartbeat` e `signin_gate` solo con la chiave segreta; `family` senza permessi non legge nulla; `token_hash` assente da `audit_log` ed export | AC1, AC10, AC11, AC21 | qa (T17a) |
| Integration | Accesso anonimo | Chiave pubblicabile senza sessione: 0 righe o rifiuto su tutto; server action e route chiamate senza sessione → rifiuto | AC1 | developer (T2, T7) |
| E2E | Redirect | Route private → `/accesso`, nessun dato nell'HTML | AC1 | qa |
| Acceptance | Concorrenza | Due `accept_pending_invitation` in parallelo (stesso utente) → una membership; `create_wedding` doppio → un matrimonio; accettazione vs revoca e vs "Invia di nuovo" → esiti deterministici, nessun 500; INSERT diretto in `memberships` negato | AC6, AC3 | qa (T17a) |
| pgTAP + Acceptance | Inviti via email avversari (solo `method=email`) | Token di un altro matrimonio, vecchio token dopo il nuovo invio, scaduto (con timestamp spostato), utente già membro di un altro matrimonio, email già membro → codici previsti | AC5–AC7 | developer (T2), qa |
| Unit + manuale | Email di produzione | Trasporto da env; payload Resend con `Idempotency-Key`; verifica manuale post-dominio | AC9 | developer (T6), release-manager |
| Unit + E2E | Onboarding | Macchina a passi (ordine, ripresa, "Non lo so ancora", B facoltativo, email uguale); e2e con ricarica a metà | AC12, AC13 | developer (T10), qa |
| Integration | `complete_onboarding` | Tutto creato in una transazione; seconda chiamata rifiutata; risposte parziali | AC14, AC15 | developer (T8, T10) |
| Unit | Motore | Nessun riferimento; riti (pubblicazioni, corso solo cattolico, simbolico); rito sconosciuto → comuni + "Scegli il rito" | AC15, AC25 | developer (T4) |
| Unit + E2E | Suggerimenti | Nuove e non pertinenti; nulla di automatico; eliminati e ignorati mai ri-suggeriti | AC16, AC48 | developer (T4), qa |
| E2E | Confronto | 360 px carte + Confronta 2; 768 px colonne; pro/contro con icona (assert su icona + testo) | AC17 | qa |
| pgTAP + E2E | Scelta e riapertura | Scelta atomica con conflitto di versione; riapertura senza motivo → errore; con motivo: aperta, **scartate tornano candidate**, riferimento provvisorio uguale, `needs_review`; "Va bene così"; periodo con giorno esatto (Q7) | AC18–AC20 | developer (T8), qa |
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
| Unit + E2E | Temi | Vettori WCAG del calcolatore; gate su `themes.css` generato per i temi approvati (coppie estese, semantici); report sui 12; nessun `text-accent`; tema salvato visibile al secondo partner; `data-theme` nell'HTML SSR; ripiego cookie; axe notturno sulla matrice | AC49 | developer (T3, T15), qa |
| Unit + Acceptance | Promemoria | `planReminders` (7 gg/oggi, entrambi/A/B, esclusioni, B non accettato, recupero dei cron saltati, nessun 7 gg per date cambiate nella finestra, Q8); raggruppamento 1 email/giorno, max 5 righe; nota "data provvisoria" | AC50 | developer (T16), qa (T17c) |
| Unit | Riepilogo | Lunedì; recupero lun–mer (Q11); settimane ISO 2026-W53/2027-W01; vuoto → niente | AC51 | developer (T16) |
| Acceptance | Disattivazione | GET non cambia nulla; token manomesso, di altro tipo o di altro utente; POST one-click senza sessione; header; accesso e invito senza link | AC52 | qa (T17c), developer (T6, T16) |
| Acceptance | Idempotenza e quota | Due esecuzioni → un invio; due esecuzioni sovrapposte (`Promise.all`) → un invio; errore prima dell'invio / l'invio fallisce / errore dopo l'invio prima di `sent` → nessun duplicato, ripresa con la stessa chiave; 40 compiti spostati nella finestra → tetto + `skipped_quota` + flag | AC53 | qa (T17c) |
| E2E | Sicurezza e cache | Intestazioni sul server buildato (`X-Robots-Tag`, robots, `frame-ancestors`, `Referrer-Policy` no-referrer su invito/auth/email, CSP che non rompe l'app); due sessioni alternate sulle stesse URL → nessuna fuga; Indietro dopo l'uscita senza dati; budget di JS e font deterministici; LCP solo come report (+ misura manuale sulla preview) | NFR, AC1 | qa (T17a, T17d) |
| E2E + manuale | Accessibilità | axe (`target-size`, `color-contrast`), reflow 320 px / zoom 200 %, tastiera, `prefers-reduced-motion`; checklist manuale F3 (VoiceOver) | NFR | qa (T17d) |
| Type | Destination | What changes |
| Functional | `docs/functional/` | `accesso-e-invito.md`, `onboarding.md`, `percorso.md`, `scelte.md`, `budget.md`, `promemoria-email.md`, `temi-e-aspetto.md`, `esportazione.md`, `servizio-in-pausa.md`, indice |

## Documentation plan
| Type | Destination | What changes |
|---|---|---|
| Functional | `docs/functional/` | `accesso-e-codici.md` (prima `accesso-e-invito.md`: login con codice, partner, codice dimenticato, regole email), `onboarding.md`, `percorso.md`, `scelte.md` (location collegata), `budget.md`, `promemoria-email.md` (anche "email spente"), `temi-e-aspetto.md`, `esportazione.md`, `servizio-in-pausa.md` |
| Technical | `docs/technical/` | `architettura.md`, `modello-dati.md` (matrice delle scritture, account), `sicurezza.md` (codici, limitatore, cosa offre Supabase e cosa no, 4 ambiti della chiave segreta, R20, **contratto DB → admin di §4.8, eventi di account, ordine dei lock, R26**), `email-e-job.md`, `ambienti-e-rilascio.md` (runbook: **variabili di bootstrap**, checklist Auth remota, reimpostazione di un codice dal pannello, attivazione di Resend, ripristino del progetto in pausa, dump, workflow), `sviluppo-locale-e-test.md` |
| ADR | `docs/adr/0001-stack-auth-ambienti.md` | Aggiornato al modello con codice d'accesso |
| README | `README.md` | Setup, `npm run bootstrap`, link |

## Release plan
- **Percorso**: PR → CI verde → preview (staging, account di smoke da variabili) → **Gate C** → merge = deploy prod + `migrate.yml` prod con approvazione. **Il merge deploya la produzione: sì.**
- **Prerequisiti** (ognuno approvato al momento dell'esecuzione):
  1. Supabase prod e staging con la checklist Auth;
  2. Vercel con le variabili per ambiente: `R2Y_BOOTSTRAP_*` *Sensitive*, `EMAIL_TRANSPORT` **assente**, nessuna `E2E_CLOCK`;
  3. secret ed environment GitHub.
- **Un solo Gate C, nessun rilascio in due tempi**: in C1 il primo partner entra con le variabili di bootstrap, crea l'account di Jessica con un codice e glielo consegna; **Jessica entra subito**. Le email restano spente, con l'avviso in app.
- **Attivazione email** (dopo l'acquisto del dominio; cambio di configurazione in produzione, da approvare al momento):
  - account Resend, DNS (SPF, DKIM, DMARC);
  - `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `EMAIL_FROM` in Vercel;
  - SMTP personalizzato di Supabase prod (per il recupero codice);
  - nuovo deploy (le variabili si leggono al runtime della nuova build);
  - verifica: promemoria e riepilogo una volta sola, disattivazione, recupero codice, invito via email, avviso sparito.
- **Feature flag**: nessuno. `EMAIL_TRANSPORT` fa da interruttore delle email.
- **Rollback**: Instant Rollback di Vercel; migrazioni additive; export; togliere `EMAIL_TRANSPORT` spegne subito tutte le email.
- **Controlli post-deploy**:
  1. primo login con le variabili di bootstrap e cambio del codice in app;
  2. secondo login con l'email di bootstrap: il codice cambiato resta valido;
  3. email o codice errati → messaggio neutro; 6 errori → blocco;
  4. creazione dell'account di Jessica e suo primo accesso;
  5. un codice di 9 caratteri è rifiutato dal server Auth;
  6. intestazioni e robots;
  7. cron manuale → heartbeat in Altro > Info, nessuna email;
  8. `keepalive.yml` verde;
  9. preview → staging;
  10. `/servizio` raggiungibile;
  11. avviso "email spente" visibile.

## Decisions
| # | Decision | By | Date |
|---|---|---|---|
| A1 | Stack Next.js + TS su Vercel (`fra1`), Supabase `eu-central-1`; RLS + privilegi di colonna come unico confine; chiave segreta in 4 ambiti server-only con allowlist di import | architect | 2026-11-23 |
| A2 | **Accesso con email + codice d'accesso** (password Supabase, policy imposta dal server ≥ 10 lettere + cifre), limitatore applicativo per email/IP con messaggi neutri, nessun magic link/OTP; primo utente da variabili `R2Y_BOOTSTRAP_*` creato al primo login con quell'email (create-only), più `npm run bootstrap` per locale e staging; fondatore = `app_metadata.r2y_founder` | architect (requisito dello sviluppatore) | 2026-11-23 |
| A3 | Email opzionali dietro `emailEnabled()`; senza trasporto nessuna email e avviso in app; Resend per app e recupero codice quando c'è il dominio | architect | 2026-11-23 |
| A4 | Riferimento derivato nel DB; date TS/SQL con vettori condivisi | architect | 2026-11-23 |
| A5 | Migrazioni additive via Actions; deploy automatico al merge | architect | 2026-11-23 |
| A6 | Matrice delle scritture nel DB; operazioni admin sugli account autorizzate prima da `authorize_account_op` | architect | 2026-11-23 |
| A7 | Orologio iniettabile | architect | 2026-11-23 |
| A8 | `config.toml` solo locale/CI; Auth remota dal pannello con checklist | architect | 2026-11-23 |
| A9 | `/servizio` senza DB; nessun redirect al login su rete/540 | architect | 2026-11-23 |
| A10 | Promemoria: una email al giorno per utente, log per elemento, ripresa dei claim | architect | 2026-11-23 |
| A11 | Partner B creato da A con codice iniziale (sempre) o invito via email per scegliere il codice (solo con email attive); membership al primo accesso; codice temporaneo dall'altro partner con cambio obbligatorio; cambio email proprio con codice attuale via admin | architect (requisito dello sviluppatore) | 2026-11-23 |
| A12 | Data collegabile a una location candidata (`date_scenarios.location_option_id`), mostrata ovunque compaia la data | architect (Q7) | 2026-11-23 |
| P1 | **Da approvare (sviluppatore)**: servizi e dipendenze npm come nella versione precedente, **nessuna aggiunta**. Nessuna migrazione distruttiva. **Modello di autenticazione nuovo** (A2, A6, A11): approvazione esplicita | developer | — |
| A13 | Contratto DB → admin di Auth (§4.8): mutazione nel DB con il JWT prima, admin dopo e solo sull'id restituito; predicato unico di account riutilizzabile nel DB; eventi di account scritti dalle RPC che autorizzano (nessuna RPC per eventi dichiarati dal chiamante); ordine unico dei lock; un successo non cancella un blocco attivo; cambio del proprio codice via admin dopo la verifica del codice attuale | architect (revisione sicurezza T2) | 2026-11-24 |
| P2 | **Da approvare (sviluppatore)**: indurimento di Supabase Auth (`enable_confirmations`, `double_confirm_changes`, `secure_password_change` = true, in locale e nella checklist remota; §4.1) e accettazione del rischio residuo R26 per R1. Nessun servizio né dipendenza nuova | developer | — |

### Risposte dello sviluppatore registrate (Gate B, 2026-11-23)
- **Q1**: superata, rilascio unico (Jessica entra con codice in C1).
- **Q2**: superata dalle regole email di §4.6.
- **Q3, Q4**: approvate.
- **Q5**: promemoria a B solo dopo il primo accesso.
- **Q6**: tutti e 12 i temi, predefinito Giardino.
- **Q7**: periodo → giorno esatto; data collegabile a una location.
- **Q8, Q9 (interruttore per compito tenuto), Q10, Q11, Q12**: approvate.
- **Q13**: account di smoke e bootstrap da variabili d'ambiente.
- **Q14, Q15, Q16**: approvate.

### Domande Q-A/Q-B/Q-C — risposte dello sviluppatore (Gate B, 2026-11-24)
| # | Question | Risposta |
|---|---|---|
| Q-A | Lunghezza minima del codice d'accesso: 10 caratteri con lettere e cifre (imposta dal server Supabase), invece degli 8 ipotizzati, perché l'endpoint di login è raggiungibile direttamente da Internet e il piano free non blocca gli account | **Approvato**: 10 + lettere e cifre (D49) |
| Q-B | CAPTCHA (Cloudflare Turnstile, gratuito ma un servizio nuovo) sul login, per fermare anche i tentativi diretti a Supabase | **Approvato**: nessun CAPTCHA in R1 (D50) |
| Q-C | Il codice iniziale scelto da A per B: cambio solo *suggerito* al primo accesso; il codice *temporaneo* di ripristino: cambio *obbligatorio* | **Approvato** (D51) |

## Change log
| Date | Change | Why | Approved by |
|---|---|---|---|
| 2026-11-23 | Prima stesura del piano (F2) | — | — |
| 2026-11-23 | Round 1 F2 (matrice delle scritture, orologio, `/servizio`, raggruppamento email, temi, divisione dei task QA, …) | Obiezioni PO/QA/DES | — |
| 2026-11-23 | **Cambio di requisiti al Gate B**:<br>- accesso con email + codice d'accesso al posto di magic link/OTP;<br>- bootstrap del primo utente da variabili d'ambiente (create-only, al primo login + script) al posto dell'allowlist SQL;<br>- partner creato da A con codice o invitato via email;<br>- cambio e ripristino dei codici; regole sulle email;<br>- limitatore con messaggi neutri;<br>- email opzionali con avviso in app;<br>- promemoria a B dopo il primo accesso;<br>- data collegabile a una location;<br>- 12 temi approvati;<br>- rilascio unico;<br>- T7 diviso in T7a/T7b e gruppi riordinati;<br>- nuove righe di test, rischi R20–R25, domande Q-A/Q-B/Q-C | Decisione dello sviluppatore (`log.md`, "Gate B round") | tonybartiloro, 2026-11-24 (Gate B) |
| 2026-11-24 | Risposte Q-A (10 caratteri, lettere e cifre), Q-B (nessun CAPTCHA), Q-C (cambio obbligatorio solo dopo codice temporaneo) | Gate B | tonybartiloro, 2026-11-24 |
| 2026-11-24 | F3/T4 (revisione code-2): lo scenario di riferimento automatico è il primo scenario aperto con data **non passata** rispetto a `today`; se tutti sono passati, il primo in assoluto; uno scelto a mano resta valido anche se passato. **T8** (`set_reference_scenario(null)` / default SQL), **T11** e **T14** devono applicare la stessa regola (`resolveReference({..., today})`). `GroupedTasks.deleted` separato da `hidden` per "Eliminati di recente" (T11). Le dismissioni dei suggerimenti non dipendono dal rito. | Revisione T4 | Coordinatore (chiarimento nel perimetro approvato) |
| 2026-11-24 | F3/T2 (revisione sicurezza `code-6`, REV-1..REV-5, REV-9): nuovo §4.8 (ordine DB → admin per ogni operazione, fallimenti e compensazioni, predicato `account_reusable` nel DB, `invitation_by_token` solo chiave segreta, eventi di account scritti dalle RPC che autorizzano e `record_account_event` senza grant, ordine unico dei lock); `authorize_account_op` volatile, solo per codice temporaneo, cambio del proprio codice e della propria email; creazione di B con la riga dell'invito prima dell'account; cambio del proprio codice via admin dopo la verifica (§4.5.3); limitatore: un successo non cancella un blocco attivo (§4.3); impostazioni Auth contro il `PUT /user` diretto (§4.1, **P2 da approvare**) e rischio R26; righe di task T2/T7a/T7b, test plan e documentazione allineate. Nessuna dipendenza, servizio o migrazione nuova (correzioni nel file core, mai applicato in remoto) | Revisione sicurezza T2 | Architetto (A13, nel perimetro approvato); P2 attende lo sviluppatore |
| 2026-11-24 | F3/T13 (revisione `code-12`): le 11 categorie predefinite del budget sono create da **T10** subito dopo `complete_onboarding` con `seedDefaultCategories` (`src/features/budget/seed.ts`, idempotente, sessione utente); `/budget` mantiene solo un fallback pigro per i matrimoni creati prima; un 42501 è un errore, non viene ignorato. F3/T16: `sync_timeline` è chiamata dal job giornaliero; il riepilogo esclude i compiti con l'interruttore per compito spento. | Revisioni T13/T16 | Coordinatore (nel perimetro approvato) |

## Outcome
<!-- Filled at the end of F5: what shipped, where, when, deviations from the plan, follow-ups. -->
