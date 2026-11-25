# FEAT-2026-002 — code review, round 1

Verdict: approved
Scope reviewed: T6, commits 54fe384 (nav) and 78b9af4 (docs/functional)

| ID | Severity | Evidence | Finding | Why it matters | Proposal | Response (author) | Closed |
|---|---|---|---|---|---|---|---|
| REV-1 | note | `src/components/interactive.test.tsx` (new test, `expect(... "Percorso" ...)` line) | The line is about 101 characters; check that `prettier --check` / lint pass. | Format gate in CI. | Run the formatter if it complains. | | ❌ |
| REV-2 | note | `docs/functional/README.md:20` | The row `[Altro](altro.md)` still carries the old name. | Correct for T6; T8/S2 renames it after Q7. | None now: keep in T8. | | ❌ |
| REV-3 | note | `docs/functional/promemoria-email.md` (removed block) | Q6 says the block "passes to the technical docs". `docs/technical/ambienti-e-rilascio.md:233` ("Attivare Resend") already holds the same content, so nothing is lost. | The content is not lost. | None. | | ❌ |

## Checks done
- `AppNav.tsx`: `/guida` is the 6th and last item with `BookOpen`; `isActivePath` already covers `/guida/*`. Below `md` the padding is `px-0.5`, and `md:px-1` restores the old value. `lg:px-3` is unchanged, `min-h-14` unchanged, so the target stays at least 44 px (matches design). Scope: no rename of "Altro" (S2).
- Test: `mockPathname` is reset in `finally`, so the tests stay isolated. It covers 6 items, Guida last, `aria-current` on `/guida/budget`, and Percorso not active.
- Docs: no `docs/technical` reference or link is left in `docs/functional`. The remaining "chi gestisce l'app" phrases are plain text. The README states the conventions the guide relies on (table as index, internal links only, "Storico" hidden). Phrases are neutral and readable.

## AC coverage
AC1 ✅ (AppNav unit: 6 items, Guida last and active on `/guida/budget`; rendering at 320 px is for the e2e in T10) · AC3 ✅ for T6's part (source cleaned, convention written; the automatic failing test belongs to T4) · AC7 ⏳ (S2, not T6).

## Questions for the developer
None.
