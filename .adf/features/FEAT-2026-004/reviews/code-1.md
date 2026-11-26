# FEAT-2026-004 — code review, round 1 (S1 Dati: T1, T2, T3)

Verdict: approved (round 1 closed; fixes verified in `git diff a8fcb64..9c4b354`, `npm run db:test` 1778 tests PASS). Carry-overs for later steps, not blockers: T5 maps non-`invalid_answers` submit errors to a generic retry state and passes `p_ip_key: null` explicitly (unit test); T7 normalises a blank note to null and passes `answered_at` back untouched; T10 adds the `\u0000` PostgREST case. Q1-Q3 answered by the coordinator (Q1 DB rejects blank, T7 normalises; Q2 create/rotate refuse after expiry; Q3 explicit revoke reads "Da rimandare", D8).
Scope reviewed: `git diff c96b987..HEAD -- supabase src tests` (6e6aa08, af95a06, a147c0f, 3cd7bc1), then the fix commit 9c4b354. General round: correctness, BR1-BR5 vs lifecycle matrix, test quality, additivity, conventions. The security round ran in parallel and is not repeated here.

Checked and fine: the seed token and hash in `05_rsvp.sql` (recomputed: HMAC-SHA256 of `r2y-rsvp:v1:<id>`, base64url, and its sha256 match the file); both migrations are additive (the only `create or replace` is `undo_guest_import`, same signature, extra `skipped` key, so old code keeps working: Instant Rollback holds); the demo wedding has no taken date, so the seed link does not expire; `rsvp_cover` honours BR1-BR4 and the 54-row matrix plus the invariants in `lc_obs` assert it from real RPCs; limiter counts before writes under a row lock; identical rewrite really writes nothing.

| ID | Severity | Evidence | Finding | Why it matters | Proposal | Response (author) | Closed |
|---|---|---|---|---|---|---|---|
| REV-1 | should | `rsvp_public.sql` `rsvp_hit` | `insert ... on conflict do nothing` then `select ... for update`: `do nothing` does not lock an existing row, so `rsvp_attempts_gc()` could delete it in between and the hit would be lost (QA-9). | "Never more than 20 writes" could be off by one. | Single atomic upsert. | fixed: `on conflict (key_hash) do update ... returning a.* into r` takes the lock in the first statement | ✅ |
| REV-2 | should | plan test row, `rsvp_public.test.sql` | NUL (`\u0000`) is refused by jsonb parsing (22P05) before the RPC, so "NUL → `invalid_answers`" is unreachable and untested. | QA-8 "never a 500" depends on the wrapper. | Amend plan row; T5 maps unknown submit errors to a generic retry; T10 adds the PostgREST case. | accepted: plan amended, T5/T10 carry it | ✅ (DB side; T5/T10 must deliver) |
| REV-3 | note | `rsvp_item_ok` | A blank note fails the whole submission. | Trap for T7. | Keep, T7 sends null. | kept; T7 normalises to null (Q1) | ✅ (T7 to verify) |
| REV-4 | note | `answered_at` / `seen_at` | Microsecond equality: a JS `Date` round trip would flag every answer as changed. | PO-1 would fire on every resubmit. | Pass the string untouched; add a microsecond pgTAP case. | pgTAP added: untouched string round-trips to `[]`, millisecond-truncated one reports a change | ✅ (T7 must pass the string through) |
| REV-5 | note | `rsvp_submit` signature | `p_ip_key` has no default, so passing null needs a cast. | Typing friction in T5. | Reorder or cast with a unit test. | rejected: keep the order, T5 passes null explicitly with a unit test on the null path | ✅ (convincing) |
| REV-6 | note | limiter cleanup | Cleanup runs only on failure paths. | Pseudonymous rows without a retention end; trivial volume. | Accept and document. | accepted as residual, goes in `sicurezza.md` | ✅ |
| REV-7 | note | `rsvp_unmark_shared` | `shared_by` taken from client JSON. | Attribution integrity. | Use the caller. | fixed: `shared_by` = caller (null if nothing was shared), future `shared_at` refused, 3 tests | ✅ |
| REV-8 | note | `mark_shared` / create / rotate | `mark_shared` used `now()`; create/rotate ignored expiry. | AC12 rule in two places, dead-on-arrival links. | `p_now` on mark_shared; refuse after expiry. | fixed: `private.rsvp_is_expired` (also used by the cover), `link_expired` on create/rotate, `p_now` on create/rotate/mark_shared, 6 tests, allowlists and types updated | ✅ |
| REV-9 | note | `lc_obs` | Matrix did not assert page (`rsvp_resolve`) against list (`rsvp_cover`). | Core of P2. | Add the invariant. | done on all 54 rows | ✅ |
| REV-10 | note | `rsvp.sql:21` | Constraint name differs from sibling tables. | Consistency. | Rename. | renamed `guests_id_wedding_id_key` | ✅ |

Re-check notes on the fixes: the new upsert in `rsvp_hit` fires no triggers (none on `rsvp_attempts`) and holds the row lock to the end of the transaction, so parallel submits serialise as before; `rsvp_is_expired` returns false when no date is taken (BR7/BR8); in `rsvp_rotate_link` the order is `link_not_found` first, then `link_expired`; the limits now live in `private.rsvp_limits()` and the cleanup age follows them (tested with 10 and 20 minute rows). The security nits REV-101..103 (code-2.md) overlap with REV-1, REV-7 and the limits function and are consistent with the diff.

## AC coverage (S1 level)
AC3 ✅ · AC4 ✅ · AC5 ✅ · AC6 ✅ · AC7 ✅ · AC8 ◐ data side only (UI in S4) · AC9 ✅ · AC10 ◐ limits and "opening writes nothing" ✅, headers/429 in S2 · AC11 ✅ (parallel part is T10) · AC12 ✅ (expiry with both DST changes, date moved/reopened, and now `link_expired` on create/rotate) · AC13 ➖ S2 · AC14 ✅ · BR5 ✅ · BR11 ✅ · BR12 ✅.

## Questions for the developer (answered)
- Q1. Blank note: DB rejects, T7 normalises to null.
- Q2. After expiry create/rotate refuse (`link_expired`): done.
- Q3. After an explicit "Revoca" the people read "Da rimandare" (D8): unchanged, confirmed.
