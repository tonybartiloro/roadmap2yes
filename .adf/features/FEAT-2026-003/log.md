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
