# FEAT-2026-003 — decision log

<!-- One section per phase transition, checkpoint or discussion round: who decided what, and why, in a few lines. Details stay in reviews/ and in the commits. Length target: method → Keep files short. -->

## F0 intake — 2026-11-25
- Request: roadmap item R-03 "Invitati: anagrafica, gruppi/famiglie, tavoli facoltativi" (release "R2", roadmap approved 2026-11-25). Original request: "gestione invitati (anagrafica, gruppi/famiglie, tavoli opzionali)".
- Size: L, confirmed by the developer 2026-11-25. Reason: personal data of third parties (names, contacts, allergies), new data model with its own RLS area and migration, export changes; not the amount of work.
- Team: product-owner, architect (ADR if needed), designer, developer(s), qa-engineer, reviewer (with a security round), technical-writer, release-manager.
- Housekeeping: FEAT-2026-002 marked done, R-02 done (commit ad82157). Branch `feature/FEAT-2026-003-invitati` from origin/main 55cb281.
- Code findings for the team:
  - `supabase/migrations/20261201100000_core.sql:246-269`: `private.role_permissions(role partner|family|planner, area, action read|write)`; partner areas today: wedding, partners, invitations, audit, decisions, tasks, budget, notifications. Guests need a new area.
  - `weddings.guest_band` (up_to_50, 50_80, 80_120, over_120, unknown) is the only guest data today; used in onboarding, settings and export.
  - `src/features/export/data.ts` selects columns explicitly: guests must be added to the export.
  - `src/content/milestones/it.ts`: milestone `lista-invitati-preliminare` and the task "Raccogliere le conferme degli invitati" can link to the new section.
  - Nav (`src/components/AppNav.tsx`) already has 6 items on a 320 px mobile bar: a new top-level item needs a decision.

## F1 definition — 2026-11-25
- Round 1: PO brief (15 AC); architect ARC-1..11 (blocking ARC-1 guest personal data in the permanent audit log, ARC-2 deleted items never purged; ADR-0002 proposed), designer DES-1..16 (blocking DES-1 nav at 320 px). PO accepted all; brief grew to 22 AC in 3 steps.
- Developer answers: nav B ("Invitati" in the bar, Guida moved into Opzioni plus a help link; reverses the FEAT-2026-002 choice by the developer's decision); no auto-expiry of deleted guests; import skips bad rows; computed guest band; categories adult/child/infant (infant counted, no table seat); +1 as a normal guest; over-capacity allowed with warning; no budget link; Percorso links only; **no cap on guests** (paged reads, no silent truncation).
- Scope change: developer asked for a visual, rearrangeable room of tables. Agreed as new roadmap item **R-06 "Sala: disposizione visuale dei tavoli"** (M, depends on R-03), roadmap re-approved 2026-11-25. R-03 stores table shape and position (BR10) so R-06 needs no destructive migration.
- Final brief: 23 AC, steps 1 (AC1-13, AC23), 2 tables (AC14-16), 3 import/export (AC17-22). Gate A recorded via roadmap R-03.

## F2 plan — 2026-11-25
- Architect plan: 17 tasks in 3 steps, 2 additive migrations, 5 RPCs, no new dependency; ADR-0002 "Dati personali degli invitati" drafted.
- Challenge: QA-1..11 (blocking QA-1 bulk undo, QA-2 TS oracle unowned), DES-17..26, PO-1..7. Architect accepted all but DES-22 (not-migrated state tested below e2e) and changed QA-7 (900 KB import guard instead of raising the global body limit).
- Gate B approved 2026-11-25 by the developer ("Vai direttamente in produzione che tanto siamo ancora in sviluppo e non facciamo danni"): plan, ADR-0002, new `delete` permission action, routine git work. D-A = (c): no preview test on staging; Gate C on the local result before the merge, then production checks.

## F3 step S1 checkpoint — 2026-11-25
- Done: T1 migration (021a212, cc66cb6, 631e251), T2 domain (8add42d, d1e4678), T3 nav/help (1500e23, ed244ab), T4 data/actions (2d2c9db, 8f0d557), T5 Persone UI (7555fb6, 6adc63e, 2d228e0), T6 band/Percorso link (02a5d9b, 526a5b2), T7 docs (ab55a84, daf0ead), T8 QA (b0cdc40, f7dbc17).
- Reviews: code-1 (T2) approved; code-2 (T1 security round) REV-5..10 closed; code-3 (T3) closed; code-4 (T4) REV-17..20 closed; code-5 (T6) fixed; code-6 (T5) REV-24..31 fixed, closure re-check in the final review round.
- Coordinator decisions: per-action bounds (bulk 5,000 selected, family 100, bulk RPC 1,000 per call with transparent batching), not a cap on guests (brief Decision 10 note); ADR-0002 notes the Postgres log residual (REV-8); remote PG 17.12 verified; extra files recorded in plan Change log; QA-1 accepted (family role redirected to /su-invito by the existing proxy).
- QA: acceptance 13/13, nav 4/4, mobile 9/9 after QA-2 fix (axe name mismatch on guest rows), desktop 4 pass + 1 fixme (1200 guests in the full export, waits for T14). 500 guests ready in ~250 ms; search over 1200 in 9 ms. db:test 1228 green.
- `adf verify` pass on 33939b637e7b. Not run yet: full e2e suite (end of S3, T17).
- Developer: "Procedi" → S2.

## F3 step S2 checkpoint — 2026-11-25
- Done: T9 tables (8c90a12, b245703, a0d626d), T10 QA (0ce1731, a93c447, 42adaff); A exported `versioned`/`conflictResult` for reuse (REV-32); code-6 closed (2212ce7).
- Reviews: code-7 (T9) REV-32..36 fixed; closure re-check in the final review round.
- QA: tables mobile 6/6, S1 mobile 9/9, desktop 4 + 1 fixme (full export, T14). QA-3 (table sheet covered the Annulla toast at 360 px) fixed. QA-4 (toast contrast) was a false positive from the enter animation; developer C added a 12 themes × light/dark toast axe check in `e2e/themes.spec.ts` (841a683). 500 guests ready in ~470 ms with tables.
- `adf verify` pass on f6d26ad5ea77.
- Developer: "Procedi" → S3.

## F3 step S3 checkpoint — 2026-11-26
- Done: T11 CSV domain (A), T12 import migration (A, 5ec1f7d), T13 import UI (B, 2bca800), T14 full export (C, c1d87a2), T15 QA (7726741), T16 docs (9b5b2aa, bd820c7; ADR-0002 accepted), T17 QA (8dc2ea9, dcbdad5).
- Reviews: code-7 closed; code-8 (T14) approved; code-9 (T11) REV-39..44 closed; code-10 (T13) REV-45..51, 57 closed; code-11 (T12 security round) REV-52..56 closed, REV-58/59 fixed; design-1: DES-01/02/04-07 fixed, DES-03 (desktop columns) waits for the developer.
- Coordinator decisions: REV-47 unknown import outcome = wording ("Non so se…", no retry, list reload), no client batch id; REV-53 `undo_guest_import` removes only untouched batch people (live, version 1, unseated), no time window; DES-02 toast above the mobile nav.
- QA: full suite via verify 288 pass; the 18 failures were environmental (wrong port first run; degraded/email-off need their own servers, 12/12 pass when selected; WebKit not installed, 3 not run; `partner.spec.ts:415` recovery mail uses the local Supabase CLI default template, not from this branch, 2 fail locally). Themes: /invitati and toast with description, 12 themes × light/dark, axe clean.
- `adf verify` pass on 428b63d6aedc.
- Developer: "Colonne ora" → DES-03 desktop columns built (81b95bd); code-12 REV-60..63 and DES-08 fixed and closed; design-1 closed. Guests e2e 27/27 on the final build (500 guests ready ~360 ms). `adf verify` pass on 9ab912ad037a.

## F5 close — 2026-11-26
- Gate C approved by the developer; PR #5 squash-merged (fd4680e, 14:19 UTC), production deployed the same day. Post-deploy checks not recorded here.
- Closed during the F0 housekeeping of FEAT-2026-004: phase done, R-03 done.
