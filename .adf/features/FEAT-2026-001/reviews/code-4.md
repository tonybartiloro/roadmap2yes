# Code review 4 - T3 Design system, temi, shell, componenti (FEAT-2026-001), round 1

Verdict: **changes requested**. Counts: blocking 0, should 4, nit 5.
Commits: 774ba95 (themes), ebfa696 (shell + components).
AC coverage: AC39 (offline banner, draft hook) and AC40 (ConflictDialog) covered by tests; AC49 (themes: 12 themes, light/dark, WCAG gate on the generated CSS, font budget static + build) covered; AC59/AC60 (service-down pages, noindex, no data) covered on read, but see S1.

Verified correct:
- Theme resolution: the cookie is only used through `isApprovedThemeId` (allowlist) in `resolveThemeId`; `data-theme` and `<meta theme-color>` never receive raw input; the test pins `"<script>"` to giardino. `ThemeProvider` re-validates on every entry point (`preview`, `confirmSaved`, `initialThemeId`). No injection path.
- `MODE_SCRIPT` is a static string (only `JSON.stringify` of a constant), try/catch wrapped, no user data. CSP in `next.config.ts` has `script-src 'self' 'unsafe-inline'` (no nonce in R1, ADR-0001), so it runs; if a nonce is adopted later this script must carry it (note for that follow-up).
- `global-error.tsx`: no imports besides React runtime, no DB, theme, font or data; static strings; own `<html>`; inline styles with `prefers-color-scheme`; 44 px button; noindex. Good.
- `/servizio`: `robots` noindex, reason read from `searchParams` and reduced to a 2-value enum (no reflection of the parameter), no data access in the page itself.
- `AccessCodeField`: `type=password`, `new-password`/`current-password`, real `name`, no paste handler, toggle with `aria-pressed` + changing label, hints with icon AND sr text, error tied by `aria-describedby`, 44 px targets (`size-11`, `h-11`). Code never goes to storage by this component.
- Contrast methodology: tests parse the generated `themes.css` (what ships), known WCAG vectors, accent restricted to background/card, UI pairs at 3:1, both modes for 12 themes, catalog/CSS agreement, CSS freshness test. Sound.
- Fonts: one `next/font` per family, `latin`, `swap`, `preload:false`, so only faces referenced by the active theme's `font-family` are fetched; budget script counts latin face only (reasonable for it-IT, documented).

## Should

S1. `src/themes/server.ts:25-37` and `:51` - the "never blocks / DB-free on outage" claim is not met yet. (a) The 1.5 s `AbortSignal.timeout` only covers the `weddings` query; `createClient()` and `auth.getClaims()` run before it with no timeout (getClaims can call the auth server, e.g. symmetric keys or JWKS miss), and during a paused/unreachable project that is exactly the call that hangs, so the root layout (every page, including `/servizio`) can wait on it. (b) `x-r2y-backend` is read but nothing sets it: `grep` finds no writer in `src/proxy.ts`, so today `/servizio` does hit the DB path, contrary to the page comment ("without touching the database") and to plan §9/DES-16. Fix: wrap the whole lookup (client creation, getClaims, query) in one `Promise.race` with the 1.5 s budget; make the proxy set `x-r2y-backend` on the forwarded headers of the `/servizio` rewrite (and strip any client-supplied `x-r2y-backend` on all other requests, since today any visitor can send it; harm is only "skip DB theme", but a trusted header must be proxy-owned). If T2 owns the proxy change, record it in the plan T-row and add a test that `getActiveThemeId` with the header present never calls `lookup`.

S2. `src/themes/server.ts` (no test) - the fallback chain I/O wrapper has no test. Only `resolveThemeId` is covered. Plan test rows ask for DB -> cookie -> giardino, lookup that throws/rejects, lookup `null`, header present. `getActiveThemeId` already takes an injectable `lookup`; mock `next/headers` and cover: lookup resolves approved id; lookup rejects; lookup returns unapproved id with valid cookie; backend header present (lookup not called); `cookies()` throwing. Also no test for `mode.ts` (`resolveMode`, `isModePreference`) or `MODE_SCRIPT` behaviour (run it in jsdom: localStorage `dark`, garbage value, no storage -> falls back to media query; sets `theme-color`).

S3. `src/lib/hooks/use-form-draft.ts:55-110` - "NEVER store access codes" is only a comment. The hook serializes whatever the form passes, so a future form that spreads its whole state (including `AccessCodeField`'s value) leaks the code to `localStorage` in clear. Cheap guard: reject (and `console`-free drop) keys matching `/code|password|codice|token/i` in `writeDraft` when value is a plain object, or take an explicit `include: (keyof T)[]` allowlist as a required option; add a test. Related question Q1: drafts are keyed without user/wedding and nothing clears them on sign-out; on a shared device the next person can see budget drafts of the previous one. Define who calls `clearAllDrafts()` on logout (T5) and prefix the key with the wedding or user id.

S4. `src/components/ui/button.tsx:20` (`size: sm` = `h-10`, 40 px) - below the 44 px target rule (design a11y, AC for touch). No current use of `size="sm"` was found in `src`, so it is latent: raise to `h-11` or remove the variant so nobody picks it up. Also `ThemeGallery`/`ConflictDialog` buttons use default (44 px), fine.

## Nit

N1. `src/app/layout.tsx:41-43` - the inline script reads `--background` from computed style; this relies on `themes.css` being applied before the script runs (stylesheet link in head precedes it in Next output, so it works, but it is order-dependent). Add a one-line comment, and keep the `try/catch` fallback (already there). Server `theme-color` is always the light background (dark users get the script correction only).
N2. `src/themes/server.ts:41` doc comment says "(and on the /servizio page)" the DB is not touched; true only after S1. Fix with S1.
N3. `src/components/MoneyInput.tsx:3` - the developer note says `parse` is a prop, but the code imports `parseEuroToCents` from `@/lib/money` (better; matches T1). Update the notes/plan wording so they agree.
N4. `src/components/AccessCodeField.tsx:78-85` - `copy()` timeout is not cleared on unmount (React 19 tolerates it, but `setCopied` after unmount in tests can warn). Use a ref/cleanup. Also `Genera` offers copy but the success of copy is not announced (only the button label changes; add `aria-live` or `role="status"` "Codice copiato").
N5. `src/components/ConflictDialog.tsx:79` - `aria-describedby="conflict-description"` is a fixed id (fine for a singleton modal, but two dialogs mounted would collide); use `useId`. Escape = Annulla and unlabeled fields hidden are good decisions; also confirm in T8 that "Annulla" keeps the draft copyable as the description promises.

## Questions for the developer

Q1. Who clears `r2y-draft:*` on sign-out, and should the key include the wedding/user id (S3)?
Q2. Is the proxy change for `x-r2y-backend` planned in T2 or T3? If neither, S1(b) is T3's to do (the plan T3 row lists the DB-free `/servizio`).
Q3. Countdown copy for past/today is invented: needs product confirmation (flag in the PR/hand-off, not a code issue).

Review file: /Users/tonybartiloro/Documents/roadmap2yes/.adf/features/FEAT-2026-001/reviews/code-4.md

## Response (developer, round 1)

| # | Response |
|---|---|
| S1 | Fixed. The whole lookup (client creation, getClaims, query) is now under one `withTimeout` race (1.5 s) in `getActiveThemeId`. `src/proxy.ts` (narrow edit) deletes any incoming `x-r2y-backend` and sets it on the outage rewrite; tests in `proxy.test.ts` (set on outage, stripped when spoofed, not set on non-outage rewrite) and `server.test.ts` (header present: lookup never called). |
| S2 | Fixed: `src/themes/server.test.ts` (db id, null/reject/sync throw, unapproved id, invalid cookie, header, `cookies()` throwing, hanging lookup with fake timers) and `src/themes/mode.test.ts` (helpers and `MODE_SCRIPT` run in jsdom: stored value, garbage, no storage, `theme-color`). |
| S3/Q1 | Fixed. `writeDraft` refuses keys/nested fields matching code/codice/password/token/secret/otp/pin. `scope` (`userId:weddingId`) is a required option and prefixes the storage key. New `clearAllFormDrafts()`: T15's "Esci" flow must call it on sign-out. Tests added. |
| S4 | Fixed: `size="sm"` is `h-11`. |
| N1 | Comment added in `layout.tsx`. |
| N2 | Fixed with S1. |
| N3 | Agreed: `MoneyInput` uses `parseEuroToCents` (no `parse` prop); the code is the reference. |
| N4 | Fixed: timer cleared on unmount, "Codice copiato" announced in an `aria-live` region. |
| N5 | Fixed: `useId` for the ids. T8 to confirm that "Annulla" keeps the draft copyable. |
| Q2 | Done in T3 (proxy edit above). Q3: copy kept; the designer confirms it in the visual check. |
