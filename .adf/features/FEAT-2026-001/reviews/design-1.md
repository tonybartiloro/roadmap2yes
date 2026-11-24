# Design visual check, round 1 (F3) — FEAT-2026-001

Designer, 2026-11-24. Built app (`npm run build`, `next start` on 3360, plus a second instance on 3361 with `EMAIL_TRANSPORT=none`, both stopped). Local Supabase, seeded wedding (3 scenarios: 2 fixed, 1 period; 2 locations with pro/contro; budget with an overrun and payments), partner B first visit, empty-onboarding user. Viewports 360x780, 768x1024, 1280x800; light and dark (emulated `prefers-color-scheme`), fake clock cookie. Screenshots live in the browser tool's result folder, not in the repo.

Totals: 0 blocking, 5 should, 9 nit. Everything else checked is OK.

## Findings

| ID | Sev | Finding | File to change / fix |
|---|---|---|---|
| DES-31 | should | Preview banner is 204 px tall at 360 (26% of the viewport, 255 px with the "Altro" menu open) and `scroll-padding-top` is 64 px, so focused rows can sit under the sticky banner (WCAG 2.4.11). Also the menu label "Altro" duplicates the nav tab. | `src/app/globals.css`: scroll-padding-top >= banner height (e.g. `html:has([data-preview-banner]) { scroll-padding-top: 14rem }`, 8rem from md). `src/features/timeline/ScenarioPreviewBanner.tsx`: put "Esci" and "Imposta come riferimento" in one row, move the counter inline with the title, rename the menu "Più azioni"; target <= 150 px. |
| DES-32 | should | Gallery loads all 12 heading fonts at first paint (13 woff2 at t=93 ms, tabs at top of a 2,700 px list), so the "only near the viewport" budget is not met. Cause: `useInView` starts `true` when `IntersectionObserver` is undefined, which is always the case on the server, so SSR HTML already uses `var(--font-heading)` for every card (also a hydration style mismatch). | `src/lib/hooks/use-in-view.ts`: initial state `false`; in the effect, if no IntersectionObserver call `setInView(true)`. Add a test that SSR output uses the system heading font. |
| DES-33 | should | Compare table at 360: label column 128 px + first option 192 px fill the width; the second option is entirely off-screen with no cue (table 544 px in a 326 px scroller). The sticky label column also has no edge, text is cut hard. | `src/features/decisions/*` compare view: option columns ~150 px at < 768 so the next one peeks, add a right edge shadow or border on the sticky column and a hint "Scorri per vedere l'altra opzione". |
| DES-34 | should | Countdown grammar and tone: definitive past reads "È passato 5 giorni" (should be "Sono passati 5 giorni"); provisional past reads "è passata da 548 giorni". | `src/components/Countdown.tsx` (`countdownText`): plural verb, months over 60 days (see copy decisions) + test in `presentational.test.tsx`. |
| DES-35 | should | Partner step uses gendered "Lui potrà cambiarlo..." and "sceglie lui il suo codice" although the partner label can be Sposa/Altro. | `src/features/onboarding/steps.tsx` lines 281, 288: "Potrà cambiarlo al primo accesso." / "Riceve un link e sceglie il suo codice." |
| DES-36 | nit | Scenario without a label shows the raw "03/09/2027" as title and "3 set 2027" below (picker, Scelte, Impostazioni). | Scenario title fallback in `DateScenarioList.tsx` / picker: "Data fissa" or "Opzione 2", or hide the title. |
| DES-37 | nit | Percorso header is ~390 px tall at 360 before the first row (status line, badge, hint, picker, Filtri, Miei/Tutti). | `src/features/timeline/*` header: put Filtri and Miei/Di/Tutti on one row, hide the hint behind "Cos'è?". |
| DES-38 | nit | Home at 768: Pagamenti card drops to a second grid row, leaving a ~150 px hole under the countdown. | `src/features/home/*`: two stacked columns instead of row-based grid. |
| DES-39 | nit | Duplicate calendar icons at md+ in DateField (native input icon plus the popover button). | `src/components/DateField.tsx`: hide the native picker indicator (`::-webkit-calendar-picker-indicator`) when the popover is used. |
| DES-40 | nit | Soft warning in onboarding step 4 ("È prima della data...") is amber text without icon (design: icon + text). | `src/components/DateScenarioList.tsx`: add the warning icon. |
| DES-41 | nit | Assignee radios list Jessica before Tony; design §7.1 says Entrambi / A / B. | `src/features/timeline/AssigneeField.tsx`: slot order A then B. |
| DES-42 | nit | Onboarding step 8 title "vostra app" next to "tua app" in the line below; summary says "Altro > Invito" while the page is "Invito al partner". | `steps.tsx` / summary copy: one voice; "Altro > Invito al partner". |
| DES-43 | nit | Dashed preview rows: dashes look chunky at the rounded corners; first-visit welcome card sits below Pagamenti (acceptable per §3.3). | Optional: `border-l-2` with `rounded-l-none` on preview rows. |
| DES-44 | nit | New user sees "Scaduto il 10 apr 2026" on the first Home; correct but cold for the calm principle. | Optional copy: "Previsto per il 10 apr 2026. Hai ancora tempo per recuperare." in `src/features/home/*`. |

## Checklist

**T3**
- ✅ Gallery cards light/dark, each with its theme and heading font; "Usa questo tema"/"Annulla" bar above the nav; no visible font jump on selection. ❌ near-viewport font loading: DES-32.
- ✅ AppNav active marker: bar on top at 360, left edge from 768 (and 1280 expanded sidebar).
- ✅ Warning tokens (border-warning, icon, overrun bar): 24 theme/mode combinations measured, >= 5.8:1 against card and track. OfflineBanner seen (Vivace light, text + icon + border). ErrorState card could not be triggered locally (no failing card); covered by the degraded e2e, not claimed here.
- ✅ DateField calendar popover at 1280: Italian, Monday first, selected day clear. DES-39 duplicate icon.
- ✅ ConflictDialog at 360: title wraps to 4 lines but fits, table "Campo / Tu / Il tuo partner" readable, three actions reachable, focus returns to the sheet.
- ✅ `/servizio` paused and unreachable in dark (also expanded "Per chi gestisce l'app"); no theme flash.
- ✅ Countdown "oggi" and "passato" seen with the fake clock. Copy: DES-34.

**Percorso**
- ✅ Header wrap at 360 (long, DES-37). ✅ Preview banner on two rows (too tall, DES-31). ✅ + button above the nav, never over it (it covers the right end of the row under it; padding at the end of the page is enough). ✅ Dashed preview rows with "Anteprima: 12 mar -> 1 mag". ✅ Sheet bottom at 360, side from 768. ✅ "Da recuperare": clock icon, neutral line "Di solito si fa prima, ma hai ancora tempo." ✅ Focus ring 2 px + offset in dark and light. ❌ `scroll-padding-top` for the banner: DES-31 (it is 4rem today).
- Soft keyboard open in sheets: not testable in a desktop browser pane; form layout at 360 is fine and the sheet scrolls.

**Scelte**
- ✅ Compare at 768 side by side. ❌ at 360: DES-33. ✅ Pro/contro carry "+" and "-" glyphs plus text (grayscale safe). ✅ The 4 scenario buttons wrap cleanly at 360 (card ~600 px tall).

**Budget**
- ✅ Amber warning in all themes (see T3). ✅ Sticky "Non assegnato" with shadow. ✅ Overrun bar uses warning colour with "112% concordato". ✅ 2-column grid at 768. ✅ Warm wording ("Sei oltre di € 1.200 su Catering."). ✅ Prossimi pagamenti: overdue shown with clock icon and "Scaduto da 2 giorni".

**Home**
- ✅ 2 columns at 768 (hole: DES-38). ✅ Primary-step copy "Scegli la data / Da qui partono tutte le scadenze del Percorso." ✅ Countdown at 360 wraps to 3 lines at 28 px, OK. ✅ Welcome card for partner B with 3 actions.

**Altro**
- ✅ Index rows at 360. ✅ "Le email sono spente" alert (second instance with `EMAIL_TRANSPORT=none`). ✅ Export page, three cards with file names. Export progress texts ("Preparo il file…", "File pronto: ...", "Non riesco a preparare il file. Riprova.") verified from `ExportPanel.tsx` and its tests only: I did not click "Scarica" because it downloads a file.

**Onboarding, Impostazioni, Profili**
- ✅ Wizard 8 steps, progress text + bar, radio cards, inline error "Scegli un'opzione, anche «Non lo so ancora»", scenario card, soft warning (DES-40), summary "Ecco il tuo percorso", style tip. ✅ Impostazioni radio cards and date list (DES-36). ✅ Invito al partner. Partner mode cards: DES-35. Profili: not opened separately (same PersonForm as step 1/2).

## Polish list
- `scroll-padding-top`: open, DES-31 (owner `src/app/globals.css`, T3 file).
- §7.1 disclaimer: done. `design.md` now reads "Indicativo: verificate sempre con il comune o la parrocchia" (AC25, code, tests); the plural is a conscious exception to "tu" because the practice is the couple's.

## Copy decisions (also written in design.md §7.1)
- "È oggi!" (definitive) and "Se fosse il {data}: sarebbe oggi" (provisional): confirmed.
- Past: provisional "La data del {data} è passata" and, over 60 days, "da N mesi"; never a raw count like 548 days. Definitive "Sono passati N giorni" / "È passato 1 giorno".
- Disclaimer plural kept as above.

## Changes to design.md
§7.1: disclaimer wording (twice: §3.4 and the table), plus two table rows for the countdown today and past cases.

## Response (developer, T3 items)

| ID | Response |
|---|---|
| DES-32 | Fixed: `useInView` starts `false` (SSR and first client render use the system heading font, no style mismatch); without `IntersectionObserver` it turns true after mount. Tests: SSR markup uses Georgia (`use-in-view.test.tsx`), intersection and no-observer paths (`use-in-view.dom.test.tsx`). Please re-check in the browser that the 13 woff2 are no longer requested at first paint and that cards load their font on scroll. |
| DES-34 | Fixed with the §7.1 copy: definitive "Sono passati N giorni" / "È passato 1 giorno"; provisional "La data del {data} è passata", plus "da N mesi" over 60 days (months = floor(days/30)). "È oggi!" and "sarebbe oggi" kept. Added the optional `changeReferenceHref` prop: the link "Cambia riferimento" shows whenever a reference exists; **T14 must pass it** (`/scelte/data` or the real route). Tests updated. |
| DES-36 | Fixed in `DateScenarioList` (`scenarioTitle`): an empty label or a raw date falls back to "Data fissa" / "Periodo". The ScenarioPicker (T11) must use the same `scenarioTitle` export; it is exported for that. |
| DES-39 | Fixed for WebKit/Chromium: the native picker indicator is hidden from md. Firefox desktop cannot hide its own icon, so a second icon remains there. |
| DES-40 | Fixed in `DateField` (where the soft warning lives): icon + text. |
| DES-31 (T3 part) | `globals.css`: `scroll-padding-top` is 14rem (8rem from md) while an element with `data-preview-banner` exists. T11 must put that attribute on the banner and reduce its height as listed. |
| DES-33, 35, 37, 38, 41-44 | Not T3 files. |

## Response (developer, T12 items)

| ID | Response |
|---|---|
| DES-33 | Fixed in `CompareOptions.tsx`: fixed narrow columns on a phone (label 112 px, options 152 px) so a slice of the second option peeks in; the sticky label column has a side shadow (none from 768 px); a visible hint "Scorri di lato per vedere l'altra opzione." (hidden from 768 px, read by screen readers). No page scroll (QA-5 kept). Component test plus `e2e/scelte.spec.ts` green on mobile and desktop. |
| DES-36 | Scelte cards use `DateScenarioList`, so the T3 `scenarioTitle` fallback already applies; nothing else in the T12 files. |

## Response (T14 items)

| ID | Response |
|---|---|
| DES-34 (link) | Fixed: Home passes `changeReferenceHref="/scelte/date"` to `Countdown` (design §3.8: the reference is changed in Scelte > Data, where "Imposta come riferimento" and "Torna automatico" live). The Home own link was removed, so there is one link; it now also shows for a definitive date, as T3 decided. Test: exactly one link, none without a date. |
| DES-38 | Fixed: two stacked columns from 768 px (countdown + next step | payments + news or welcome), no shared grid rows, so no hole. One column below, same reading and tab order. |
| DES-44 | Fixed: an overdue task now reads "Previsto per il 10 apr 2026. Hai ancora tempo per recuperare." (payments keep "Scaduto il ..." because that is a fact about money). |

## Response (developer, T10 items)

| ID | Response |
|---|---|
| DES-35 | Fixed: partner step "Potrà cambiarlo al primo accesso." / "Riceve un link e sceglie il suo codice." I also removed the other gendered phrasing in onboarding, Impostazioni and Profili: "i dati di accesso li gestisce da sé", "gestisce la propria email da sé", "la cambia solo il tuo partner", "Invita il tuo partner", "Rieccoti, riprendiamo dal passo N di 8" (was "Bentornato"). |
| DES-36 | Onboarding summary and Impostazioni use `DateScenarioList`, so the T3 `scenarioTitle` fallback applies; the summary no longer builds its own raw-date title. |
| DES-40 | Soft warning with icon is the T3 `DateField` fix; the period variant in the onboarding scenario editor (`ScenarioEditor.tsx`) is plain amber text without icon: left as is, it appears only for periods starting before 3 Sep 2027. |
| DES-42 | Fixed: "Scegli l'aspetto della tua app" (and "Quando vorresti sposarti?"); links and texts now say "Altro > Invito al partner". |
