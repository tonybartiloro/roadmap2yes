# FEAT-2026-002 — code review, round 2

Verdict: approved (no blocking, no should)
Scope reviewed: F3/S1 T1–T5, commits 7b2e364, 1c67bf2 (markdown.ts and its test), 2f80f1e, 982a97d, 91abfea

| ID | Severity | Evidence | Finding | Why it matters | Proposal | Response (author) | Closed |
|---|---|---|---|---|---|---|---|
| REV-4 | note | `src/features/guide/FocusHeading.tsx:7` | The module flag `seenInThisDocument` is set by the first Guide page mounted, not by the first document load. A user who opens `/budget` and then taps the Guida tab gets no focus move (first mount, flag false); after one visit to Guida, later entries from the tab do move focus. Behaviour depends on history. | Predictable focus is the accessibility goal (design). | Accept if design only asks for focus on Guida-internal navigation; say so in the comment. Otherwise detect a real first load (e.g. `performance.getEntriesByType("navigation")` or a flag set from the layout). | | ❌ |
| REV-5 | note | `next.config.ts:61` | Tracing keys are valid for Next 16 (picomatch on the route `/guida/[...pagina]`; `contains: true`, so `/guida` already covers both). The files are read with a computed `join(process.cwd(), ...)`, which nft may flag or over-trace. Not verifiable from source. | A missing doc in the Vercel function is a runtime error page. | In the preview deploy (or `next build`) check that `.next/server/app/(app)/guida/[...pagina]/page.js.nft.json` lists `docs/functional/*.md`, and read the build warnings. | | ❌ |
| REV-6 | note | `src/features/guide/GuideMarkdown.tsx:27` | No `img` component: a `![](https://…)` in a doc would render a raw `<img>`. The CSP (`img-src 'self' data: blob:`) blocks external loads, and the docs have none. | Defence in depth, and no layout break on a wide image. | Optional: map `img` to its alt text, or add a guard test. | | ❌ |
| REV-7 | note | `src/features/guide/GuideMarkdown.test.tsx:64` | The "no literal colours" regex would not catch Tailwind palette classes beyond red/blue/green/gray. | Weak guard, low risk (classes are reviewed). | Optional: widen to `text-|bg-` + any palette name. | | ❌ |

## Checks done
- Path traversal: the slug reaches the disk only after `isGuideSlug` (exact match against names read from the folder, regex `^[a-z0-9-]+\.md$`); catch-all with more than one segment gives 404. Tests reject `../package`, `README`, `Budget`, `budget.md`, `""`, `budget/x`. Safe.
- Raw HTML: `skipHtml` on, test covers `<script>`, `<b>`, block `<div>`. `javascript:` links render as `<span data-guide-unresolved>`; test asserts no `<a ` and no `href=`. Only http(s)/mailto go out, with `noopener noreferrer`.
- Server-only: `GuideMarkdown` and `source` import `server-only`; `FocusHeading` imports only `next/navigation` and React; it receives `targetId` as a prop. `error.tsx` is the only other client file, and it imports no guide code. The Vitest alias for `server-only` exists.
- Auth: `/guida` is not public in `proxy.ts`; unauthenticated users are redirected like every `(app)` route. Pages use a Promise `params`, as Next 16 requires.
- Tests fail on what they claim: `checkIndex` and `checkPage` have failing fixtures (missing row, missing file, empty cells, outside link, `docs/technical`, heading jump, no or two H1). The real-docs tests run the same functions.
- Deviations: `x.md#a` to `/guida/x` (fragment dropped) is safe and tested; filtering README rows with no file at runtime is paired with the CI check that fails on it; empty-page message and table label "Tabella: {title}" are consistent with design.

## AC coverage
AC1 ✅ (routes + nav, e2e in T10) · AC2 ✅ unit (index cards, README order) · AC3 ✅ (guard tests with fixtures) · AC4 ✅ (links, 404, unknown slug) · AC5 ✅ (focus, table region, contrast pair test; manual pass in T10) · AC6 ✅ (R1 no copies, R3 allowlist, skipHtml).

## Questions for the developer
1. REV-4: is "no focus on first Guida mount after a client navigation from another section" intended?
