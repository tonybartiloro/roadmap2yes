# FEAT-2026-002 — code review, round 4

Verdict: changes requested (1 should, 1 note; no blocking)
Scope reviewed: commit 565d775 (DES-20, DES-21, REV-4): `FocusHeading.tsx`, its test, guide `not-found.tsx`

| ID | Severity | Evidence | Finding | Why it matters | Proposal | Response (author) | Closed |
|---|---|---|---|---|---|---|---|
| REV-11 | should | `src/features/guide/FocusHeading.tsx:10,34-41` | The rule depends on a timer: the "left a guide page" flag lives one tick (`setTimeout 0`). The new page must mount in the same tick as the old one unmounts. `guida/loading.tsx` wraps the pages in Suspense and there is no `generateStaticParams`, so on a navigation that is not prefetched the old page can unmount into the skeleton, and the new page mounts later, after the flag was cleared. Result: no focus on index to page or page to page, the very case the rule wants. The e2e (`guida.spec.ts:98-116`) covers one pair, where the page is probably warm, and not the cold path. The unit test simulates "same commit" with `rerender`, so it cannot catch this. Also the `changed` branch is dead (each page remounts per segment/param), and the logic is global mutable state ordered by timers (Strict Mode is OK: the ref survives the simulated remount). | A focus rule that works or not by timing is flaky and hard to debug (a11y behaviour must be deterministic). | Drop the global and the timer. Add `guida/layout.tsx` with a small client wrapper that sets a ref in its own `useEffect` after the first commit and exposes it through context. `FocusHeading` focuses on mount only if that ref is already true. Child effects run before the parent's, so on the first load, and when arriving from another section (layout mounts in the same commit), it is false; the layout persists across `/guida` and `/guida/x`, so any later page mount is true, even after a skeleton and with back/forward. Add an e2e: index to page focuses; arriving from Opzioni does not. | | ❌ |
| REV-12 | note | `src/app/(app)/guida/[...pagina]/not-found.tsx:7-9` | H1 on not-found is right (one H1, AC6), same classes as the other titles. It has no `id`/`tabIndex`, correct as no `FocusHeading` runs there. Heading styles are now copied in 4 places. | Minor duplication only. | Accept. | | ❌ |

## Developer response
- **REV-11: fixed, with a variant of the proposal.** Global flag, timer and the dead `changed` branch are gone. `guida/layout.tsx` wraps pages in `GuideShell` (client, `FocusHeading.tsx`), which keeps the path it first rendered with (where this visit to the Guide started) plus a `navigated` ref in context. `FocusHeading` focuses once the current path differs from that start path (or a later page already did). Why not the "layout effect after children" ref you proposed: I implemented it first and the e2e caught it. On a hard load of `/guida/x` the page streams in behind `loading.tsx` after the layout's effect, so the title was focused on first load. Comparing paths does not depend on mount timing: skeleton, late hydration, back/forward and Strict Mode are all covered (unit tests for each; the layout mounted anew on arrival from another section starts from the new path).
- Your question: yes, checked on a production build (`npm run build`, then e2e on port 3300): 34/34. New e2e `focus goes to the title from index to page, not when arriving from another section` (arrival from `/altro` via nav: no focus; index to page: focus; again from `/altro`).
- Extra find: the production build warned "Dynamic filesystem access causes tracing of the whole project" on `source.ts`. Fixed with `/*turbopackIgnore: true*/` on the path (the docs are shipped by `outputFileTracingIncludes`); the build is clean and `.nft.json` of `/guida/[...pagina]` still lists `docs/functional`.
- **REV-12: accepted.**

## Checks done
- Layout preservation and mount order: `guida` has no layout, so `(app)/layout` persists; `page.tsx` and `[...pagina]/page.tsx` are different segments, so `/guida` to `/guida/x` unmounts one and mounts the other; x to y remounts by param. Back/forward behaves the same as forward.
- React 19 Strict Mode (dev): the cleanup sets the flag, but `lastPath` is a ref kept across the simulated remount, so `first` is false and no focus on first load. OK.
- Leaving to another section: nothing mounts a `FocusHeading` there, the flag clears next tick. OK.

## AC coverage
AC6 (single H1 incl. not-found): met. Focus-on-navigation rule: met only when timing holds (REV-11).

## Questions for the developer
Did you check the index to page click on a cold page (production build, no prefetch)? If focus lands there, tell me and I downgrade REV-11 to a note.
