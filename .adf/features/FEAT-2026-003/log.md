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
