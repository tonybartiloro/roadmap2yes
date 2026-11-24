# Modello dati

Il modello è in tre migrazioni additive in `supabase/migrations/`:

| File | Contenuto |
|---|---|
| `20261201100000_core.sql` | Identità, spazio, account, inviti, eventi di account, limitatore, stato per utente, audit, heartbeat |
| `20261201200000_decisions_timeline.sql` | Decisioni, opzioni, scenari di data, reazioni, compiti, soppressioni dei suggerimenti, Percorso |
| `20261201300000_budget_notifications.sql` | Budget, pagamenti, preferenze e log delle notifiche, funzioni dei job |

`database.types.ts` si rigenera con `npm run db:types` e non si modifica a mano: la CI confronta il file generato con quello committato.

Stato sugli ambienti remoti: da confermare. Non risulta che la migrazione `core` sia stata applicata a un progetto remoto; vedi [runbook](ambienti-e-rilascio.md#migrazioni).

## Schemi

- **`public`**: esposto all'API con RLS su tutte le tabelle.
- **`private`**: non esposto. Contiene `role_permissions`, `login_attempts` e le funzioni di supporto (per esempio `account_reusable`, `add_date_offset`, `resolve_reference`, `rome_today`).

## Convenzioni

- `wedding_id` su ogni tabella di dominio.
- Chiavi composte `(parent_id, wedding_id)`: un figlio non può puntare a un padre di un altro matrimonio.
- Colonne `version`, `created_*`, `updated_*`. I trigger `bump_version`, `set_audit_cols` e `guard_row` rendono immutabili `id`, `wedding_id` e `created_*`.
- Importi in `bigint`, in centesimi, con `check (>= 0)` e un tetto massimo.
- Date come `date`, mai come timestamp con fuso. Enum come `text` con `check`.
- Cancellazioni logiche con `deleted_at` dove il dato deve restare per lo storico o per "Eliminati di recente".

## Tabelle

### Identità, spazio e account

| Tabella | Scopo | Note |
|---|---|---|
| `weddings` | Lo spazio del matrimonio | Rito, fascia invitati, stile, luogo, tema (`theme_id`, default `giardino`), risposte dell'onboarding, riferimento applicato |
| `wedding_partners` | Partner A e B | `slot` `A`/`B`, etichetta, nome, cognome, `email` (citext), `user_id`. B è facoltativo |
| `memberships` | Chi appartiene a quale spazio | PK `(wedding_id, user_id)` e `unique(wedding_id, partner_slot)`: al massimo due partner |
| `invitations` | L'invito del partner B | `method` `code` o `email`; `token_hash` solo per `email`, non leggibile; `expires_at`, `revoked_at`, `accepted_at`, `send_count`. Un solo invito in sospeso |
| `account_events` | Eventi visibili all'altro partner | Solo inserimenti, `forbid_mutation`. Tipi: creazione del partner, codice temporaneo, cambio codice, cambio email, invito revocato. Mai il codice |
| `user_wedding_state` | Ultimo accesso, accesso precedente, ultimo export, benvenuto chiuso | Serve alle Novità |
| `audit_log` | Storico generale di tabelle di dominio | Trigger `audit_row`; solo inserimenti |
| `heartbeats` | Battiti dei job e del keep-alive | `source`, `ran_at`, `details` |

### Accesso

| Tabella | Scopo |
|---|---|
| `private.login_attempts` | Limitatore: `key_hash bytea` (HMAC-SHA256 dell'email normalizzata oppure dell'IP, con chiave `SUPABASE_SECRET_KEY`), `failed_count`, `window_start`, `locked_until`. Vedi [Sicurezza](sicurezza.md#limitatore-di-accesso) |
| `private.role_permissions` | Mappa ruolo → area → azione. Solo `partner` in R1 |

Il fondatore non è una tabella: è `app_metadata.r2y_founder = true`, impostato solo dal bootstrap con la chiave segreta e non modificabile dall'utente.

### Decisioni, scenari e Percorso

| Tabella | Scopo | Note |
|---|---|---|
| `decisions` | Le domande (data, location) | Stato e opzione scelta |
| `decision_options` | Le opzioni candidate | Campi leggeri in R1; `deleted_at` |
| `date_scenarios` | Date o periodi candidati | `kind`, `date_from`, `date_to`, `location_option_id` (facoltativo). Chiave composta verso `decision_options(id, wedding_id)`; un trigger verifica che l'opzione appartenga a una decisione di tipo `location` e non sia cancellata |
| `decision_events` | Storico delle decisioni | Solo inserimenti, scritto da trigger e RPC |
| `option_reactions` | "Preferisco" / "Dubbioso" | Solo le proprie righe |
| `tasks` | Compiti del Percorso | `template_key`, `template_version`, offset, `due_overridden`, `needs_review`, assegnatario, promemoria, `deleted_at`. Limite di 2000 compiti per matrimonio |
| `task_suggestion_dismissals` | Suggerimenti ignorati | `template_key`, `kind`, `dismissed_at` |

Il riferimento della timeline non è memorizzato a parte: si calcola con `private.resolve_reference`, a partire dagli scenari, dalla decisione e da `today`. La regola è descritta in [Percorso](../functional/percorso.md#scenario-di-riferimento).

### Budget, pagamenti e notifiche

| Tabella | Scopo | Note |
|---|---|---|
| `budget_versions` | Storico del totale | Append-only, con `forbid_mutation` e `forbid_truncate` |
| `budget_categories` | Categorie e assegnato | Con `guard_delete`: una categoria con voci non si elimina |
| `budget_items` | Voci: previsto, concordato, annullata | Chiave composta verso la categoria; trigger sulla categoria collegata |
| `payments` | Acconti, saldi, pagato | `check >= 0` |
| `notification_preferences` | Interruttori per utente | Solo le proprie righe |
| `notification_log` | Un log per elemento inviato | `batch_key`, `claimed_at`, usato per l'idempotenza |

## Matrice delle scritture

Sintesi di ciò che `authenticated` può fare direttamente con una `UPDATE` o `INSERT` e di ciò che passa da funzioni. Le protezioni sono privilegi di colonna, trigger e chiavi composte.

| Tabella | Scrittura diretta | Solo via funzione |
|---|---|---|
| `weddings` | Campi di profilo, stile, luogo, tema, risposte | `create_wedding`, `complete_onboarding`, `set_reference_scenario`, `sync_timeline` |
| `wedding_partners` | Etichetta, nome, cognome | Email: `update_partner_email`, `sync_my_email`. Inserimenti: `create_wedding`, `complete_onboarding`, `upsert_partner_b`. `user_id`: `accept_pending_invitation` |
| `memberships`, `user_wedding_state`, `account_events` | Nessuna | RPC (per esempio `record_seen`, `dismiss_welcome`) |
| `invitations` | Nessuna (lettura senza `token_hash`) | `create_invitation`, `rotate_invitation`, `revoke_invitation` |
| `decisions` | Domanda | `choose_option`, `reopen_decision`, `add_decision_note` |
| `decision_options`, `date_scenarios` | Campi di business e `deleted_at` | Stato tramite trigger |
| `decision_events` | Nessuna | Trigger e RPC |
| `tasks` | Inserimento di compiti dell'utente; modifica di titolo, note, categoria, scadenza, assegnatario, promemoria, stato, cancellazione logica | `insert_template_tasks`, `acknowledge_task_review`, `sync_timeline`. Trigger su `due_overridden`, completamento e campi di modello |
| `option_reactions`, `notification_preferences` | Solo le proprie righe (`user_id = auth.uid()`) | — |
| `budget_versions` | Nessuna | Append-only |
| `budget_categories`, `budget_items`, `payments` | Colonne di business e `deleted_at` | `move_budget_items` per spostare le voci |
| `audit_log`, `heartbeats`, `notification_log`, `private.*` | Nessuna | Trigger e job |

Le funzioni eseguibili da `authenticated` includono, tra le altre: `create_wedding`, `complete_onboarding`, `accept_pending_invitation`, `create_invitation`, `rotate_invitation`, `revoke_invitation`, `upsert_partner_b`, `update_partner_email`, `sync_my_email`, `authorize_account_op`, `choose_option`, `reopen_decision`, `set_reference_scenario`, `insert_template_tasks`, `record_seen`, `record_export`, `dismiss_welcome`, `last_heartbeat`. Solo con la chiave segreta: `record_heartbeat`, `login_gate`, `login_record`, `auth_user_id_by_email` (solo bootstrap), `invitation_by_token`, e le funzioni `job_*`.

## Regole non negoziabili

- Una migrazione è **additiva**. Una modifica distruttiva richiede un piano separato e revisionato (vedi [runbook](ambienti-e-rilascio.md#migrazioni)).
- Un trigger o una funzione `SECURITY DEFINER` non deve mai essere più permissiva di quanto dichiarato nel nome e nel commento della funzione.
- Le viste SQL devono avere `security_invoker = true`, altrimenti bypassano la RLS.

## Storico delle modifiche

| Data | Feature | Modifica |
|---|---|---|
| 2026-11-24 | FEAT-2026-001 | Prima stesura (F4, T18) |
