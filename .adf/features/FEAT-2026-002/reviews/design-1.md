# FEAT-2026-002 — design review, round 1

Verdict: approved (no blocking, 0 should, 4 notes)
Scope reviewed: S1+S2 on branch `feature/FEAT-2026-002-guida-in-app`, dev server on :3301 with a seeded fake account, built-in browser. Measured with DOM probes (widths, computed colours, focus) plus screenshots at 320 (default and dark themes) and 768; 1024 by DOM probe.

| ID | Severity | Evidence | Finding | Why it matters | Proposal | Owner | Response (author) | Closed |
|---|---|---|---|---|---|---|---|---|
| DES-20 | note | `src/features/guide/FocusHeading.tsx:7`; probe: /budget -> nav Guida: focus stays on body; Guida -> Budget -> Guida again: focus on H1 "Guida" | REV-4 confirmed. Focus to the H1 depends on history: first entry from the nav does nothing, later entries move it. | Predictable focus. My DES-8 intent was focus on H1 only after navigation inside the Guida (card -> page, page -> page, "Torna alla Guida"). Entering from the nav should behave like every other section (no focus move). | Move focus only when the previous pathname was `/guida*` (track last path in the module/context, ignore first mount). Then the nav entry never moves focus, deterministically. Acceptable to ship as is if the dev prefers; it is not an a11y barrier. | developer | | ❌ |
| DES-21 | note | `/guida/xyz`: no H1, title "Pagina non trovata" in an `H2` (EmptyState) | The not-found page has no H1. | AC6 asks one H1 per Guida page; screen-reader heading nav starts at H2. Same EmptyState pattern exists elsewhere in the app. | Optional: give the not-found a real H1 (heading level prop on EmptyState). | developer | | ❌ |
| DES-22 | note | `/guida/budget` has no table (design assumed one); tables only in `percorso`, `temi-e-aspetto` | At 320 px no current table overflows (288/288). Forced `min-width:600px` test: region scrolls alone, page does not (hscroll false), region is Tab-focusable with visible ring. | Scroll behaviour is verified only by simulation. | None. Covered by the forced test; keep as a regression case in e2e if wanted. | — | | ✅ |
| DES-23 | note | "Percorso" label 51-52 px (Work Sans, semibold) in a 49 px content box at 320 | Label is whole, li grows to ~54.9 px, ~1 px slack, no overlap with neighbours (slack 8+ px). Tightest case of the 4 fonts tried. | Little margin if a wider font is added or user text scale grows. | None now; if a theme with a wider font appears, re-measure. | — | | ✅ |

## Visual acceptance checks
- Bar 320 px: 6 items, "Guida" last and `aria-current`, "Opzioni" with gear; labels whole, no overflow in giardino, provenza (Work Sans), vivace (Public Sans), amalfi (Outfit), light and dark. Items 53 px wide, 56 px tall. 360/390 px not probed separately (wider than 320, which passes). ✅
- Rail 768 (63 px content box, widest label 51) and 1024 (191 px rows): labels whole, Guida last and active. ✅
- Index: 12 cards in README order, each 68 px tall, whole card is the link, one H1 "Guida", title "Guida · roadmap2yes". ✅
- Page: one H1 (tabindex -1), no heading skips, "← Guida" and "Torna alla Guida" 44 px, underlined links, internal links stay in /guida/*, no "Storico"/technical text; titles "{Pagina} · Guida · roadmap2yes". Focus ring visible on link and table region (keyboard). ✅
- Slug `xyz` and `..%2Fpackage`: "Pagina non trovata" + "Torna alla Guida", Guida still active; anonymous request -> 307 to login. ✅
- Contrast (link, body, h2, nav, active nav) in giardino, vivace, art-deco, provenza, light and dark: all >= 5.7:1. Axe and 200% zoom not run (e2e a11y spec covers axe). ✅/partial
- `/altro`: title "Opzioni · roadmap2yes", H1 "Opzioni", nav active; no visible "Altro" left in `src/` (only code comments and excluded strings). ✅
- No horizontal page scroll at 320 on any page checked (index, budget, temi, percorso, panoramica, opzioni, accesso, promemoria). ✅

## AC coverage
AC1 ✅ · AC2 ✅ (tables by simulation) · AC3 ✅ (internal links, focus on card -> page) · AC5 ✅ · AC6 ✅ (404 without H1: DES-21) · AC7 ✅

## Questions for the developer
1. DES-20: keep as is, or restrict focus move to navigation inside the Guida?
