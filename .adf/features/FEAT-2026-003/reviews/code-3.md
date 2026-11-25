# Code review 3: T3 nav and help (commit 1500e23)

Verdict: **approved with should-fix items** (0 blocking, 3 should, 3 nit).

AC23: covered. 6 items with Invitati (UsersRound, P7) and no Guida; Guida card first in Opzioni with `border-primary`; `/guida` activates Opzioni (P5); HelpLink in Home, Percorso, Scelte, Budget, Opzioni (Invitati is T5); item hidden without permission (unit + layout). Not verified in a browser: I did not run e2e.

## Findings

**REV-11 (should)** `src/app/(app)/layout.tsx:12-24`. Two serial round trips (`weddings`, then `has_permission`) block the whole shell render. `withTimeout` caps it at 1500 ms, but on a slow DB every full page load pays up to that before any byte streams (`loading.tsx` cannot cover a layout). Also, the losing promise is not aborted (themes lookup uses `abortSignal(AbortSignal.timeout(...))`, this does not). Fix: pass `.abortSignal(AbortSignal.timeout(LOOKUP_TIMEOUT_MS))` to both calls, or get the answer in one call (e.g. a `has_permission` variant that resolves the wedding itself, or run it in parallel with the page by moving the check into a small Suspense-wrapped server component feeding `AppNav`). Not a per-navigation cost: Next keeps a shared layout mounted on client navigation, so it runs on full loads and refreshes. Consequence to document: a permission change shows in the bar only after a reload.

**REV-12 (should)** `layout.tsx:9-24` vs `src/features/guests/data.ts:226`. Two functions named `canReadGuests` with opposite failure semantics (fail-closed in data, fail-open in layout) and the same query logic. Risk: someone "reuses" the wrong one. Fail-open for the nav item only is acceptable (RLS and the page's "su invito" panel enforce; nothing leaks, worst case a dead link to the panel). Fix: rename the layout one (`shouldShowGuestsNav`) and have it call the data function with a catch, or share the query and keep only the fallback different. Keep a test of the fail-open path (none exists for the layout today).

**REV-13 (should)** `e2e/themes.spec.ts:38` / design §1 and test item "bersagli". Target size is fine in code: `HelpLink` always has `min-h-11 min-w-11`, so Scelte, Opzioni and Percorso get 44 px too, not only Home and Budget. The gap is coverage: axe in the themes matrix visits only `/`, `/percorso`, `/budget`. Fix: add a 320 px check of the HelpLink height/width on `/scelte`, `/altro`, `/percorso` (T8 `invitati.nav.spec` is the natural place) and look at Percorso at 320 px (DES-26) in a browser: the header now holds h1 + HelpLink while `PercorsoHeader` already has a `CircleHelp` popover below it; confirm no overflow and that the two "?" affordances are not confusing (nit if they are the same icon: use a different icon or label for one).

**REV-14 (nit)** `HelpLink.tsx:30`. Accessible name: keep **"Aiuto"** (decision). Reasons: one link per page next to the h1, so context is already announced; "Aiuto" equals the visible text at 360+ px (WCAG 2.5.3 safe) and is stable for the e2e queries; "Aiuto su {sezione}" would also pass 2.5.3 but adds nothing here. Update design §1 to match, so the doc and code agree. The test that `max-[359px]:sr-only` is in the class string is weak (it checks a class, not behaviour); acceptable since jsdom cannot evaluate media queries; cover at 320 px in e2e.

**REV-15 (nit)** `HelpLink.tsx:30`. `className` is interpolated with `?? ""`, leaving a trailing space and bypassing the project's class merging (`cn`/tailwind-merge if present). Use `cn(...)`.

**REV-16 (nit)** `layout.tsx:12`. `!wedding` resolves to `true` (shows Invitati for a user with no visible wedding). Harmless, but say so in the comment, since the doc comment only mentions errors and timeouts.

## Checked and fine
- Security: no new entry point; no data in the client beyond one boolean; no secrets or personal data logged; RLS and the page remain the real gate.
- Next 16: async layout is valid; `createClient` already reads cookies elsewhere in the shell path.
- Tests updated coherently (`interactive.test`, `guida.*`, `altro`); HelpLink map-to-docs test is a good guard. The Profili icon change (UserCog) is per P7.

## Risposte

| ID | Risposta |
|---|---|
| REV-11 | Fatto. Le due letture condividono un solo `AbortSignal.timeout(1500)` e la richiesta perdente viene annullata. Un `Suspense` attorno alla barra e' stato provato e scartato: lascia nel DOM una seconda barra nascosta (12 voci, rottura di guida.nav). Le due letture restano seriali, ma limitate dal timeout. Nel commento del layout: un cambio di permesso si vede dopo un ricaricamento. |
| REV-12 | Fatto. Funzione rinominata `shouldShowGuestsNav` in `src/components/guests-nav.ts` (nuovo file, non in `features/guests`). Test `guests-nav.test.ts` sul percorso fail-open (errore, eccezione, nessuna nozze) e sul "no" esplicito. |
| REV-13 | Fatto. Nuovo e2e a 320 px (guida.spec) su Home, Percorso, Scelte, Budget, Opzioni: bersaglio >= 44 px, dentro lo schermo, nessuno scroll laterale. Il pulsante "Cos'e'?" del Percorso usa ora l'icona `Info`, cosi' non si confonde con il "?" di Aiuto. |
| REV-14 | Resta "Aiuto". |
| REV-15 | Fatto, `cn(...)`. |
| REV-16 | Fatto: il caso "nessuna nozze visibile" e' documentato in `guests-nav.ts`. |
