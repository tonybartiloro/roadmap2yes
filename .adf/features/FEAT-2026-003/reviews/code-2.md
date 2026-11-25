# Code review 2 - FEAT-2026-003 / T1 (guests migration), commit 021a212

Reviewer: adf:reviewer. Focus: security of the data layer. Round 1, closed in round 2 (see the end).

**Verdict: changes requested** (0 blocking, 4 should, 2 nit). No exploitable hole found: the points below are
hardening and one structural guard that the L security round should leave in place.

## Verified OK (no finding)
- RLS: select/insert/update/delete on the 3 tables use `has_permission(wedding_id, 'guests', ...)`; DELETE needs
  `deleted_at is not null` + `guests/delete`; `family`, `planner`, stranger, other wedding: nothing (pgTAP covers each).
- No anon grant: core revokes default privileges; migration grants only to `authenticated`; pgTAP asserts 0 anon grants.
  No TRUNCATE/REFERENCES/TRIGGER grant. Column grants exclude id, wedding_id (update), version, *_by, import_batch_id.
- Composite FKs `(group_id|table_id, wedding_id)` block cross-wedding pointers; `on delete set null (col)` nulls only
  that column (tested). `guests_guard_refs` (DEFINER, pinned search_path) only raises, scoped to the same wedding.
- `create_guest_family`: DEFINER, search_path pinned, explicit `forbidden` on no uid / no wedding / no `guests/write`,
  wedding from `current_wedding_id()` (not a parameter), no group/table ids accepted, errors collapsed to `invalid_row`
  (no echo of values). EXECUTE revoked from public/anon/authenticated then granted to authenticated only.
- `guests_bulk` / `_undo`: INVOKER, so RLS and column grants apply; target of another wedding is invisible, hence
  `invalid_target` (same answer as "does not exist"); foreign ids change nothing; service key refused. The extra `op`
  key is accepted: it only selects which single column to touch, and everything the caller can craft in `previous` they
  could already do with direct UPDATEs under RLS (no escalation).
- `role_permissions` check widened; `delete` is inserted for `partner/guests` only; no other area gains it.
- Audit: `audit_row` subtracts the listed keys from old and new on every op (insert, update, delete, soft delete,
  restore, bulk, cascade `set null`); Home "Novita" and the jobs read only `tasks, budget_versions, payments`, never the
  guests tables. Seed: invented names, `@example.test`, `+39 000 000 NNNN`, guarded by a Vitest test.

## Findings

**REV-5 (should)** `20261202100000_guests.sql:194-198` (and the test at `guests_model.test.sql:150-160`) - the audit
exclusion is a deny-list: a future column (e.g. `dietary`, `address`, `plus_one_name`) added to `guests` is copied to
`audit_log` unless someone remembers to extend the trigger arguments. The tests only check today's five keys and the
sample values. Why: ADR-0002 is a "never" rule and the repo is public; fail-closed is the safe default. Fix (cheap, no
change to `audit_row`): add a pgTAP test that lists the columns of each of the 3 tables and asserts that
`columns - excluded` equals a hard-coded allowlist of structural columns (id, wedding_id, category, side, group_id,
table_id, import_batch_id, deleted_*, version, created_*, updated_*; capacity, shape, pos_x, pos_y). Adding a column
then fails CI until the author decides. Also write the rule in the migration header ("new column = classify it").

**REV-6 (should)** `guests.sql:35, 54, 73` - `check (char_length(btrim(name)) between 1 and 80)` bounds the TRIMMED
value only, so `repeat(' ', 100000) || 'a'` passes (80 is meant to be the stored limit, AC2/AC4). Reachable through the
PostgREST API with a valid partner session; limited by body size, but the DB is the last defence and the plan relies on
the CHECKs. Fix: add `and char_length(first_name) <= 80` (same for the two `name` columns, 80 and 60), plus pgTAP
boundary cases (80 chars + padding refused).

**REV-7 (should)** `guests.sql:262-308, 394-447` - no size cap on `p_rows` (create_guest_family), `p_ids` and
`p_previous`. Each element is a row insert plus audit row (and the audit trigger is DEFINER), so one authenticated call
with a very large array is a cheap write/CPU amplifier on the free tier (Hobby/Supabase free). Fix: `create_guest_family`
raise `P0001 too_many_rows` above a small bound (e.g. 100: a family) as the plan already does for import (500); cap
`p_ids`/`p_previous` at the largest legitimate selection (a safe 5000) with `invalid_ids`/`invalid_previous`. Add the
boundary tests.

**REV-8 (should)** personal data in logs (security.md) - direct writes by T4 server actions that violate a CHECK
(`23514`) make PostgREST return `details: "Failing row contains (..., first_name, phone, email, notes ...)"`, and
Postgres also logs it. The RPCs are safe (they re-raise a clean code), the table API is not. Why: that string would
reach Vercel logs if an action logs `error.details`/`error.message`. Fix: not in this migration; add to T4/T5 (and to
ADR-0002 or the plan Risks) the rule "server actions map errors by `code` and never log or return `error.details`,
`message` of a Postgres error"; add one unit test for the error mapper. Supabase DB logs keep the DETAIL: note it as a
known residual in ADR-0002.

**REV-9 (nit)** `guests.sql:74` - `last_name` has no `btrim` check, so `''` and `'   '` are valid while `phone`/`side`
refuse `''`. The domain code treats null and `""` alike (code-1 REV-4), the DB permits both. Fix: `check (last_name is
null or char_length(btrim(last_name)) >= 1)` or accept and document; keep the tests consistent.

**REV-10 (nit)** `guests_model.test.sql:146-160` - the audit assertions run before the bulk-undo, import-style and 1200-row
sections, so those paths are not inside the "no personal key" scan (same trigger, so low risk). Fix: move the two
personal-key assertions (or repeat them) to the end of the file, before `finish()`.

## AC coverage (T1)
AC2/AC4 CHECK limits (REV-6 gap on padding), AC5 atomic family (ok), AC7 bulk + undo + 1200 ids (ok), AC10/AC11 soft
delete, DELETE only when deleted, no expiry (ok), AC13 audit without personal data (ok today, REV-5 for tomorrow),
BR5 side as A/B/both/null (ok), BR8 partner-only area (ok), BR10 shape/pos stored, no sort_order (ok).

## Questions for the developer
1. REV-7: is there a reason `create_guest_family` should accept more than ~100 people?
2. `planner` role has no row and `family` neither: confirmed intentional until a later release (matches plan/BR8).

## Risposte (developer A)
- **REV-5**: fatto. `guests_model.test.sql`: per le tre tabelle, colonne meno quelle escluse = allowlist strutturale scritta a mano (una colonna nuova fa fallire il test finche' l'autore non la classifica); un test verifica anche gli argomenti del trigger `guests_audit`. Regola "nuova colonna = classificala" nell'intestazione della migrazione.
- **REV-6**: fatto. `char_length(col) <= N` aggiunto a `first_name`, `last_name` e ai due `name` (80/80/80/60); test con 100 spazi + testo.
- **REV-7**: fatto con la decisione del coordinatore. `create_guest_family`: `too_many_rows` sopra 100 (100 ok, 101 no); `guests_bulk` e `guests_bulk_undo`: massimo 1000 per chiamata (`invalid_ids` / `invalid_previous`). Il tetto e' per chiamata, non sul totale: le server action (T4) dividono in lotti da 1000. Test pgTAP con 1200 in due lotti e undo.
- **REV-8**: in T4: `mapDbError` legge solo SQLSTATE e codici esatti noti, mai `message`/`details`; test con spia su `console` (guests.actions). Residuo dei log di Postgres da annotare in ADR-0002 (coordinatore).
- **REV-9**: fatto lato DB: `last_name` rifiuta '' e solo spazi (null = nessuno). Il dominio T2 tratta gia' vuoto come valido: lo schema Zod (T4) normalizza vuoto in null, quindi nessuna modifica a `validation.ts`.
- **REV-10**: fatto. Le asserzioni "nessuna chiave/valore personale" sono ripetute a fine file, dopo undo, 1200 righe e famiglie (con controllo di non vacuita').

## Round 2 (reviewer, commit 631e251; details in code-4.md)
REV-5 CLOSED, REV-6 CLOSED, REV-7 CLOSED, REV-9 CLOSED, REV-10 CLOSED (all verified in the migration and pgTAP file).
REV-8 CLOSED on the code side (mapper reads SQLSTATE and exact codes only; spy test in guests.actions); the ADR-0002
note on Postgres DETAIL logs was not found in the diff: coordinator to confirm.
**Verdict code-2: approved.**
