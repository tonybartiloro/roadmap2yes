# Modello dati

Il modello è in cinque migrazioni additive in `supabase/migrations/`:

| File | Contenuto |
|---|---|
| `20261201100000_core.sql` | Identità, spazio, account, inviti, eventi di account, limitatore, stato per utente, audit, heartbeat |
| `20261201200000_decisions_timeline.sql` | Decisioni, opzioni, scenari di data, reazioni, compiti, soppressioni dei suggerimenti, Percorso |
| `20261201300000_budget_notifications.sql` | Budget, pagamenti, preferenze e log delle notifiche, funzioni dei job |
| `20261202100000_guests.sql` | Invitati, gruppi e tavoli; area di permessi `guests` con l'azione `delete`; RPC di famiglia e di massa (FEAT-2026-003, ADR-0002) |
| `20261202200000_guests_import.sql` | Importazione in blocco (`import_guests`) e annullamento del lotto (`undo_guest_import`) |

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

### Invitati (ADR-0002)

Dati personali di terzi. Le regole sono in [Sicurezza](sicurezza.md#dati-personali-degli-invitati). Tutte le tabelle hanno `wedding_id`, `version`, colonne di audit, `deleted_at`/`deleted_by` e la chiave composta `(id, wedding_id)`.

| Tabella | Scopo | Note |
|---|---|---|
| `guests` | Una riga per persona | `first_name` 1-80 non vuoto dopo il trim, `last_name` fino a 80, `category` `adult`/`child`/`infant` (default `adult`, `check` estendibile), `side` `A`/`B`/`both`/null, `phone` con regex `^[0-9+()./ -]{6,20}$`, `email` citext, `notes` fino a 500. `group_id` e `table_id` sono FK composte con `on delete set null` (PG ≥ 15). `import_batch_id` lega le righe di un'importazione |
| `guest_groups` | Famiglie e gruppi, solo etichetta | `name` 1-80. Nessun capofamiglia. Eliminare un gruppo non tocca i suoi membri: il puntatore resta |
| `guest_tables` | Tavoli facoltativi | `name` 1-60, `capacity` 1-50 o null, `shape` `round`/`rect` (default `round`), `pos_x`/`pos_y` null. Forma e posizione sono riservate a R-06 e non usate dalla UI |

Regole di dato:

- "Senza gruppo" e "Senza tavolo" si calcolano nell'app: `id` null **oppure** elemento eliminato. Così il ripristino rimette dentro i membri senza memorizzare nulla (P2).
- Il trigger `guests_guard_refs` rifiuta l'assegnazione a un gruppo o a un tavolo eliminato (`group_deleted`, `table_deleted`). La riga di destinazione è bloccata `FOR SHARE`.
- `deleted_by` lo stampa il trigger `*_soft_delete`, come per `tasks`.
- `audit_row` esclude le colonne personali (`first_name`, `last_name`, `phone`, `email`, `notes` per `guests`; `name` per gruppi e tavoli). L'audit conserva chi, quando, l'operazione e i campi strutturali.
- Le tabelle non entrano in "Novità" (`AUDIT_TABLES`).

Permessi: area `guests` in `private.role_permissions`, solo per `partner`, con `read`, `write` e `delete` (il `check` di `action` si allarga). Famiglia e planner non hanno righe.

### RPC del modulo invitati

| Funzione | Sicurezza | Cosa fa |
|---|---|---|
| `create_guest_family(p_name, p_side, p_rows jsonb) → {group_id, guest_ids}` | `SECURITY DEFINER` | Gruppo e persone in una transazione. Una riga errata annulla tutto con `invalid_row` |
| `guests_bulk(p_ids uuid[], p_op, p_target) → {previous, changed}` | `SECURITY INVOKER` | `assign_group`, `assign_table`, `delete`, `restore`. Vale RLS e grant di colonna. Restituisce i valori precedenti letti sotto lock, solo per le righe cambiate. Al massimo 1000 id per chiamata |
| `guests_bulk_undo(p_previous jsonb) → {restored}` | `SECURITY INVOKER` | Rimette i valori salvati. Salta gli id spariti, le persone eliminate nel frattempo e le assegnazioni a gruppi o tavoli eliminati. L'ultimo salvataggio vince |
| `import_guests(p_rows jsonb) → {batch_id, guests, groups}` | `SECURITY DEFINER` | Importazione atomica: gruppi nuovi e persone con lo stesso `import_batch_id`. Il gruppo esistente si riusa per chiave normalizzata calcolata in SQL (`private.guest_group_key`, come `groupKey` del TypeScript). Limiti ricontrollati: 500 righe, payload sopra ~940 KB rifiutato |
| `undo_guest_import(p_batch_id uuid) → {guests, groups}` | `SECURITY DEFINER` | Cancella **fisicamente** le persone del lotto e i gruppi creati dal lotto rimasti senza membri. Richiede `guests/delete`. Un lotto di un altro matrimonio non fa nulla |

Nelle `SECURITY DEFINER` il matrimonio viene dall'appartenenza di chi chiama, mai da un parametro, e il permesso si controlla per primo. Gli errori sono `P0001` con codice stabile (`invalid_row`, `too_many_rows`, `payload_too_large`, `group_deleted`, `table_deleted`) e `42501` per i dinieghi. Il messaggio non contiene mai valori.

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
| `guests`, `guest_groups`, `guest_tables` | Colonne di business, `deleted_at` (eliminazione e ripristino). `DELETE` fisico solo su righe già eliminate e con `guests/delete` | `create_guest_family`, `guests_bulk`, `guests_bulk_undo`, `import_guests`, `undo_guest_import` |
| `audit_log`, `heartbeats`, `notification_log`, `private.*` | Nessuna | Trigger e job |

Le funzioni eseguibili da `authenticated` includono, tra le altre: `create_wedding`, `complete_onboarding`, `accept_pending_invitation`, `create_invitation`, `rotate_invitation`, `revoke_invitation`, `upsert_partner_b`, `update_partner_email`, `sync_my_email`, `authorize_account_op`, `choose_option`, `reopen_decision`, `set_reference_scenario`, `insert_template_tasks`, `record_seen`, `record_export`, `dismiss_welcome`, `last_heartbeat`. Solo con la chiave segreta: `record_heartbeat`, `login_gate`, `login_record`, `auth_user_id_by_email` (solo bootstrap), `invitation_by_token`, e le funzioni `job_*`.

## Regole non negoziabili

- Una migrazione è **additiva**. Una modifica distruttiva richiede un piano separato e revisionato (vedi [runbook](ambienti-e-rilascio.md#migrazioni)).
- Un trigger o una funzione `SECURITY DEFINER` non deve mai essere più permissiva di quanto dichiarato nel nome e nel commento della funzione.
- Le viste SQL devono avere `security_invoker = true`, altrimenti bypassano la RLS.
- Il `DELETE` fisico è ammesso solo per le tabelle degli invitati, e solo su righe già eliminate logicamente (ADR-0002). Le altre tabelle di dominio non hanno `DELETE`; l'unica eccezione precedente è `option_reactions`, con le proprie righe.

## Storico delle modifiche

| Data | Feature | Modifica |
|---|---|---|
| 2026-11-24 | FEAT-2026-001 | Prima stesura (F4, T18) |
| 2026-11-25 | FEAT-2026-003 | Tabelle `guests`, `guest_groups`, `guest_tables`; permesso `guests` con `delete`; RPC di famiglia, di massa e di importazione |
