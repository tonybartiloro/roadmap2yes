# Code review 12 - DES-03 desktop columns and two-column import preview (commit 81b95bd)

Verdict: **approved with one should-fix** (0 blocking, 1 should, 2 nit). Checked against design.md section 7 and DES-03 (design-1.md). Read only: no build, no e2e, tests not run (the commit adds markup tests).

## Verified OK
- Nothing structural changes below 768 px: the header is `hidden md:grid`, the grid classes are all `md:`-prefixed, the row is still `flex-col` with the details wrapping under the name. The row is still one button (or one label with the checkbox), same `onOpen`/`onSelect`, no `aria-label` (QA-2: the name is the visible text).
- Selection: the checkbox is `size-6` (1.5rem) plus `gap-3` plus `px-3` = 3rem, which is exactly the header's `md:pl-12`; without selection `md:pl-3` matches `px-3`. "Mostra altre" (`ShowMore`) and `GroupHeader` are outside the row and untouched.
- Columns: Gruppo only in the flat list (`groupNames !== null`, the group title says it otherwise); Tavolo only with a live table (`handlers.tableLabels !== null`, which the screen sets from `hasTables`). Cells use explicit `col-start`, so a row without group or table keeps the other columns aligned.
- Performance: `GuestRow` stays `memo`; the two new props are booleans, so no extra re-renders; `rowColumns` returns a constant string per row; no measuring, no effects. 500+ rows add one small CSS grid per row and nothing else (still paged by 100).
- Import preview: `md:grid-cols-2` on the card list and a 44 rem panel (`cn` merges with the 28 rem default, `md:max-h-none` still applies); 704 px fits at 768.

## Findings
**REV-60 (should)** `GuestRow.tsx` (`CELL`, `md:after:content-none`) and `GuestList.tsx:55-64` (`aria-hidden` header): on desktop the accessible name has no cell boundaries. Below 768 the `·` pseudo-element is part of the name ("Luca Rossi · Bambino · Tony · Famiglia Rossi · Tavolo 1"); from 768 it is removed and the header that labelled the columns is `aria-hidden`, so a screen-reader user hears "Luca Rossi Bambino Tony Famiglia Rossi Tavolo 1", where the group and the surname run together (a guest "Anna" in group "Maria Rossi" reads as "Anna Maria Rossi"). The `aria-hidden` header itself is fine (it only repeats the visible labels), but it makes the separators the only cue. Fix: keep the separator in the name at every width and hide it visually at `md`: `md:after:ml-0 md:after:inline-block md:after:w-0 md:after:overflow-hidden` instead of `md:after:content-none` (the text stays in the accessible name, takes no space). Cells need no labels or a real table. Then re-run the QA-2 axe check (`label-content-name-mismatch`) on `/invitati` at 1100 px, with and without tables, in selection mode too.

**REV-61 (nit)** `GuestRow.tsx` `CELL`: the group cell uses `md:truncate` (ellipsis, no way to read the rest visually) and the fixed 7/8 rem tracks give Lato and Tavolo no wrapping rule. Use `min-w-0 break-words` on all cells (also below 768, where the cells are now flex items, so an unbroken long token no longer wraps as it did inside the old single text span) and drop `truncate`.

**REV-62 (nit)** `GuestList.tsx:55`: `Rows` renders the column header once per group section, so with 10 groups it repeats 10 times. Render it once above the first section in grouped mode (or sticky under the filters), and keep it per list in flat mode.

Note for QA: the tests are markup-only; 768 and 1100 px visuals, 500 guests timing and axe in selection mode are still to be done in the browser (the developer said so).
