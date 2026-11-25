# Code review 6 - FEAT-2026-003 / T5 (Persone UI at /invitati) + closure of code-4

Reviewer: adf:reviewer. Commit 7555fb6 (T5), plus 8f0d557 (code-4 fixes). Round 1.

**Verdict: changes requested** (0 blocking, 4 should, 4 nit). The screen follows the design and the privacy
rules; the "should" items are a covered end of list in selection mode, a selection that outlives its
filter, a duplicate group on retry, and re-rendering cost at 1200 people.

## code-4 closure (verified in 8f0d557)
- REV-17 closed: `bulkGuests` returns `partial` when the rollback fails or restores fewer rows (`data.ts:637-641`),
  `undo` returns `PARTIAL_UNDO` after a first batch, `partial` is in `STALE_CODES`, tests added. The UI reloads on it
  (`use-guest-actions.ts:36`) and shows the server text.
- REV-18 closed: `MAX_SELECTION` 5,000 with its own fixed text; the UI also disables the actions (`SelectionBar.tsx:57`).
  Open for the coordinator: the "per selection, not per wedding" note in the brief's Decision 10.
- REV-19 closed (`unique` by id, `data.ts:190`). REV-20 closed (`versioned`: same version = `forbidden`).
- Question 2 answered (partial Svuota message). Question 1 (ADR-0002 line) still with the coordinator/technical-writer.

## Verified OK (no finding)
Privacy: no search term, filter or name in URLs (state only in React), no `console`, no storage, Ripristina/Elimina
definitivamente send only kind/id/version; names appear only in local toasts/labels. Themes: no hard-coded colours
(grep). A11y basics are in place: 44 px rows/buttons, `role="search"` with label, `aria-expanded/controls` on groups,
`Seleziona {nome}`, `role="status"` count, AlertDialog with Annulla first, Annulla toast >= 8 s, chips with
"Rimuovi filtro", fixed texts for every failure. Route files match the other sections (`error.tsx` with `reset`, same
as 8 existing boundaries; `loading.tsx`; "su invito" in page; `not_migrated` card). `useConflict` from budget: already
imported by settings, so a precedent; moving it to a shared place is a later clean-up, no action here.
Extension points exist: `menuActions`, `emptyExtra` (screen), `extra` (row, Summary), `extraActions` (SelectionBar).

## Findings

**REV-24 (should)** `GuestsScreen.tsx:313`, `SelectionBar.tsx:79`, layout `pb-28` (`(app)/layout.tsx:32`) - in selection
mode the bar sits at `bottom: 4.5rem` and wraps to 3 rows at 320 px (about 8 rem), but the page only reserves 7 rem, so
the last rows and "Mostra altre 100" are covered and cannot be scrolled into view; and "Seleziona" needs to reach them.
The FAB also overlaps the right end of the last row. Why: reachability of content (design §7, 320 px). Fix: when
`selecting`, add bottom padding to the screen wrapper (e.g. `pb-44`), and a little (`pb-12`) for the FAB; check at 320 px.

**REV-25 (should)** `GuestsScreen.tsx:105,280` / `SelectionBar.tsx:59` - the selection is kept when filters change, and
`selectedIds` includes people no longer visible. "Elimina" then acts on people the user cannot see (Annulla exists, but
this is a destructive action on a hidden set), and `allSelected = selectedCount >= filteredCount` shows "Deseleziona
tutti" when 5 hidden people are selected and 3 are shown, none of them selected. Fix: either clear the selection in
`setFilters` while selecting, or intersect `selectedIds` with the filtered ids and say "{n} selezionati (di cui m
nascosti dai filtri)"; compute `allSelected` on the intersection. Add a test (select, change the filter, delete).

**REV-26 (should)** `SelectionBar.tsx:61-73` - with "Nuovo gruppo..." the group is created by `resolveGroup`, then if
`onAssignGroup` fails (conflict, network) the choice stays `{kind:"new"}`, so "Assegna" on retry creates a second group
with the same name. `GuestSheet.tsx:187` handles this exact case ("stays chosen") but the bar does not. Fix: after
`resolved`, if `choice.kind === "new"` call `setChoice({kind:"existing", id: resolved.groupId})`. Test it.

**REV-27 (should)** `GuestList.tsx:53-64`, `GuestsScreen.tsx:121,220`, `view.ts:92` - performance at 500-1200. `GuestRow` is
not memoised and `Rows` passes fresh closures, so every keystroke in the search and every checkbox toggle re-renders all
shown rows (up to 1200 after "Mostra altre"; each has a Radix checkbox in selection mode). `buildSections` copies the
array on every guest (`[...(members.get(key) ?? []), guest]`, O(n^2) for a big group) and `liveGroupId` does `groups.find`
per guest. Fix: `useDeferredValue(filters.query)` for the filter; `memo(GuestRow)` with `onSelect(id, on)`/`onOpen(guest)`
passed by stable reference (use the `handlers` from `useMemo`/`useCallback`, the row binds its own id); push into the
array and build a `Map` of groups once. Measure with 1200 rows.

**REV-28 (nit)** `GroupPicker.tsx:75`, `RenameGroupSheet.tsx:87` - `maxLength={80}` literal; use `LIMITS.name` like
`FamilySheet.tsx:127` (single source, REV-1).

**REV-29 (nit)** `RecentlyDeleted.tsx:158` - `as never` hides the section typing; type the array (`Section[]`) instead. The
lists are unbounded (hundreds of deleted people render at once): acceptable now, "Svuota" is the escape; note it.

**REV-30 (nit)** `GuestsScreen.tsx:274-317`, `SelectionBar.tsx:69-71` - after "Assegna" the bar unmounts while its sheet
is closing, so focus drops to `body`; send it to the list heading or the "Altro" button. `Summary.tsx:36` announces
the count at every keystroke; debounce through the deferred query of REV-27.

**REV-31 (nit)** Copy: `use-guest-actions.ts:92` "Annullato: 1 ripristinati" (use `plural`); `SelectionBar.tsx:87`
"Seleziona tutti i 40 filtrati" when no filter is active (say "tutti i 40"). Tests missing for `forbidden` (toast, no
reload) and for assign-to-group from the bar; add them with REV-25/26.

## Risposte
- **REV-24**: fatto. Il contenitore della schermata ha `pb-44` in selezione (barra fino a 3 righe) e `pb-12` altrimenti (FAB). Non misurato a 320 px nel browser: lo verifica l'e2e di QA.
- **REV-25**: scelta la prima strada: `setFilters` svuota la selezione (ricerca e filtri). Così "Elimina" agisce solo su ciò che si vede e `allSelected` resta coerente. Test: seleziona tutti, scrivi nella ricerca, "0 selezionati", Elimina disattivato.
- **REV-26**: fatto. Dopo `resolveGroup`, se la scelta era "Nuovo gruppo" diventa `existing` con l'id creato. Test: primo "Assegna" fallisce, il secondo non richiama `addGroupAction` (1 chiamata) e usa `target: g-new`.
- **REV-27**: fatto. `GuestRow` in `memo` con `onSelect(id, on)`/`onOpen(guest)` stabili (`useCallback`); `useDeferredValue` sulla ricerca (anche il conteggio annunciato segue il valore differito, REV-30); `buildSections` lineare (push + `Set` dei gruppi vivi); `groupNames` con una `Map`. Non misurato con 1200 righe nel browser (lo fa l'e2e desktop di QA).
- **REV-28**: fatto, `LIMITS.name` in `GroupPicker` e `RenameGroupSheet`.
- **REV-29**: fatto, tipo `SectionDef`, niente `as never`. Liste non paginate: annotato nel codice, "Svuota" è la via d'uscita.
- **REV-30**: fatto. `stopSelecting` rimanda il focus al pulsante "Altro" (`id` sul trigger di `ActionMenu`).
- **REV-31**: fatto. "Annullato: N persona/persone ripristinata/e" con `plural`; "Seleziona tutti i N" senza filtri e "... filtrati" con filtri. Test aggiunti per `forbidden` (toast, nessun reload) e per assegna-a-gruppo dalla barra.

## AC coverage
AC1 empty state ok; AC2/AC3/AC4 sheet, validation, duplicate warning ok; AC5 family and groups ok (REV-26 retry);
AC6 conflict dialog tested; AC7 multi-select, Annulla, partial/too-large handled (REV-24/25); AC8 summary ok; AC9 filters
and chips ok; AC10 recently deleted ok; AC12 collapse above 100 and "Mostra altre" ok (REV-27 for speed); AC23 "su
invito" in page ok (no e2e seen for it in this commit). T9/T13 hooks are present.

## Questions for the developer
1. Is the e2e for the "su invito" panel (`e2e/invitati.nav.spec.ts`, QA) going to cover a user without `guests/read`?
