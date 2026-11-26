# Code review 4 - FEAT-2026-003 / T4 (data layer and server actions) + code-2 fix round

Reviewer: adf:reviewer. Commits 2d2c9db (T4) and 631e251 (REV-5..10). Round 1.

**Verdict: changes requested** (0 blocking, 2 should, 2 nit). Security is sound; the two "should" are about
honesty of the bulk guarantee and a transport bound that does not match the undo payload.

## Verified OK (no finding)
- Auth: every action parses first, then `getClaims()` (no token argument), `expired` on no sub; the wedding id is
  never read from the client: `weddingIdOrFail` reads it through RLS, `create_guest_family` uses `current_wedding_id()`.
  Foreign group/table/guest ids are stopped by RLS, composite FKs and `guests_guard_refs`.
- Errors: `mapDbError` uses only SQLSTATE and an exact-match business code (`Object.hasOwn`, so `constructor` is
  `unknown`); `VersionedUpdateError.message` is only fed back into that same mapper; `GuestsLoadError` keeps a fixed
  message and drops the cause. Nothing logs. QA-5 test spies on `console`, forces a 23514 with secrets, scans results.
- Versioned writes: update with `eq(version)`, conflict returns current row + who/when, never overwrites (tested).
- Reads: pages of 500 (<= max_rows 1000), ordered by unique `id`; tested with 1200 rows. `not_migrated` covers
  42P01 / PGRST205 / PGRST202 for reads, writes and RPCs; tested.
- REV-1 (code-1): schemas call `validateGuest` and `LIMITS`; group name uses `LIMITS.name` (=DB 80); agreement test at
  `guests.actions.test.ts:146`. Closed.

## Findings

**REV-17 (should)** `data.ts:563-595` (`bulkGuests`) - the "all or nothing" claim is best-effort. Each RPC is its
own transaction, so batch 1 is committed when batch 2 fails; the compensation `await undo(db, previous)` at line 588
discards its result. The usual cause of a mid-way failure (network drop, paused project) is exactly what makes the
rollback fail too, so the user can end up with a half-changed selection, no `previous` to undo, and the message
"Riprova" as if nothing happened. Also nobody else is locked out between batches, and the rollback overwrites a
concurrent edit of those rows. Why: a guarantee in a comment that the code does not give; the user's mental model
(AC7: Annulla restores everything) breaks silently. Fix: (a) reword the doc comment to "best effort"; (b) if the
rollback fails or is partial, return a distinct fixed message with a reload code, e.g. `code: "partial"`: "Ne ho
cambiati solo alcuni. Ricarica la pagina e controlla." (add it to `STALE_CODES`); (c) add the missing test: a Db
wrapper whose second `guests_bulk` call errors, asserting the first batch was restored, and one where the rollback
also fails, asserting the `partial` message.

**REV-18 (should)** `schemas.ts:22-23,127` - `MAX_SELECTION = 20_000`. Judgement on the cap: acceptable as a per
request transport bound (Decision 10 is about guests per wedding, not per click; a wedding has hundreds; lifting it
would need several actions and a merged `previous` on the client, not worth it), but it is wrong in two ways.
(1) Size: `ids` fit (~39 B each, ~0.8 MB), but an undo entry is ~140 B (`id`, `op`, `group_id`, `table_id`, `deleted`),
so 20,000 entries are ~2.8 MB against the 1 MB default Server Action body limit (no `serverActions.bodySizeLimit` in
`next.config.ts`; confirmed in `node_modules/next/dist/docs/.../serverActions.md`). Above ~7,000 the undo fails in
the framework before the action runs, and the bulk that succeeded cannot be undone. (2) Copy: a too large selection
fails `schemas.bulk`/`undo` and returns `BULK_ERROR` "Riprova", which can never succeed. Fix: lower `undo` to what fits
(e.g. 5,000) and `bulk` to the same number, or raise `bodySizeLimit` to 4 MB for the actions; give the oversize case its
own fixed text ("Hai selezionato troppe persone insieme: scegline meno") and a test at the boundary. Write the
"per selection, not per wedding" wording in the brief's Decision 10 notes so it is not read as a cap on guests.

**REV-19 (nit)** `all-pages.ts:29-38` as used by `loadGuests` - pages are read at different instants. A guest
inserted (random uuid) or hard deleted by the partner between page 1 and 2 shifts the window: one row duplicated or
skipped, and a duplicate would be counted twice in the summary. Fix: de-duplicate by `id` in `loadGuests` (cheap); the
skip case self-heals on the next revalidate. Mention it in a comment.

**REV-20 (nit)** `versioned-update.ts:93-102` / `data.ts:352` - zero rows because RLS denies the UPDATE (reader
without `guests/write`) is indistinguishable from a stale version: the user sees "Qualcuno ha modificato questo
elemento" with `current.version === expected`. Same ambiguity for `purge`/`assign` (`not_deleted`/`not_found` when the
real reason is permission). No role can hit it today (partner has both), so low. Fix: in `versioned`, if
`current.version === version` return `forbidden`.

## Closed from code-2 (verified in 631e251)
REV-5 closed (pgTAP allowlists for the 3 tables + trigger-argument test + header rule). REV-6 closed (`char_length(col)
<= N` on 4 columns, padding tests). REV-7 closed (100 family, 1000 bulk/undo, boundary tests; app batches). REV-8 closed
on the code side (mapper + spy test); the ADR-0002 note on Postgres DETAIL logs is not in the diff, see question 1.
REV-9 closed. REV-10 closed (final scan with a non-vacuity check).

## AC coverage
AC2/AC5 (add, family atomic) ok; AC6 conflict ok; AC7 bulk + undo ok, atomicity REV-17, size REV-18; AC10/AC11 soft delete,
restore, purge, Svuota ok; AC12 reads above 1000 ok (REV-19); AC13 no personal data in errors/logs ok; AC3/AC4 limits via
the single source ok; `not_migrated` ok.

## Questions for the developer
1. Is the ADR-0002 line "Postgres logs keep the DETAIL of a failed CHECK (known residual)" written? I did not find it.
2. `emptyDeleted` stops at the first failure and keeps earlier sections deleted: is the message for that case shown?

## Risposte (developer A)
- **REV-17**: fatto. Il commento dice "best effort". Se un lotto successivo fallisce si annullano i precedenti; se l'annullamento fallisce o ripristina meno righe, il risultato e' `code: "partial"` con "Ne ho cambiati solo alcuni. Ricarica la pagina e controlla." (anche per un undo interrotto dopo il primo lotto: "Ne ho ripristinati solo alcuni..."). `partial` e' in `STALE_CODES`. Test: secondo lotto che fallisce con rollback riuscito (1100 righe tutte ripristinate), rollback che fallisce (primo lotto resta cancellato, poi si ripristina), undo interrotto.
- **REV-18**: fatto. `MAX_SELECTION` = 5.000 (undo ~0,7 MB, test sotto 900 KB), per azione e non sugli invitati; `bodySizeLimit` non toccato. Oltre: messaggio fisso "Puoi selezionare al massimo 5.000 persone alla volta: dividi la selezione." (mai "Riprova"), test al limite 5000/5001 per bulk e undo. Resta al coordinatore la nota nelle Decisioni del brief.
- **REV-19**: fatto. `loadGuests` toglie i duplicati per `id` (invitati, gruppi, tavoli), con commento; test con una riga ripetuta.
- **REV-20**: fatto. In `versioned`, zero righe con riga visibile alla stessa versione = `forbidden`; test con UPDATE negato simulato. Per `assign`/`purge` resta il codice `not_found`/`not_deleted` (nessun ruolo puo' arrivarci oggi).
- **Domanda 1**: la riga su ADR-0002 (residuo dei log di Postgres) la scrive il coordinatore/technical-writer, non e' un mio file.
- **Domanda 2**: `emptyDeleted` che si ferma a meta' ritorna `partial` con "Ho eliminato per sempre N persone e M gruppi, ma non sono riuscito a finire. Ricarica la pagina: quello che resta e' ancora tra gli eliminati."; se fallisce la prima sezione e' un errore normale. Test.
