# Code review 8 - T14 full export (commit c1d87a2)

Verdict: **approved** (0 blocking, 0 should, 2 nit). Checked against AC21, AC22, ADR-0002 point 6, plan T14, brief export text.

## Verified OK
- Paging and dedupe: `gatherGuests` (`features/export/data.ts:80-120`) reuses `loadGuests` (`guests/data.ts:176-229`): `allPages` ordered by `id`, `unique` by id, so no 1000-row truncation and no repeats. Test at `tests/integration/export.data.test.ts` covers 1200 rows.
- Deleted items: JSON carries `deleted` + `deletedAt` for guests, groups and tables (`build.ts` `buildExportJson`); the CSV goes through `guestsToCsv`, which filters `deletedAt` and writes a guest of a deleted group with no group (`csv-export.ts:65,74`). `FORBIDDEN_KEYS` does not touch guest fields.
- Side column: `guestsCsvOf` (`build.ts:138-157`) derives names exactly as the Invitati page does (`invitati/page.tsx:11-18`: `displayName(first_name, label)`, fallback "Partner A/B"), then `usableSideNames` writes the letter when a name is missing, shared (accents/case ignored) or reserved (`a`, `b`, `both`, `entrambi`); import `sideOf` (`csv-import.ts:276-297`) is its exact inverse, and a shared name gives a clear row error, not a silent mismatch. Both-partners-same-name and no-first-name cases round trip. Partner renamed after the export: the old name is a per-row error "lato non riconosciuto: scrivi X, Y o Entrambi", never a wrong side; acceptable, worth a line in the docs (T16).
- Formulas: leading `+` neutralised by `toCsv` (`csv.ts:12`); test asserts `'+39 333 1234567` and `'=cmd` (`export.test.ts:268`); import removes the `'`.
- Errors / privacy (ADR-0002): `ExportLoadError("invitati", undefined, infra)` carries no cause, so no database message with personal values reaches logs or the result; `failure()` now reads `error.infra` (`data.ts:406`). `not_migrated` gives empty lists. Spy on `console` in `data.test.ts`.
- Scope of data: no `wedding_id` filter, relies on RLS like the rest of the module (single wedding per user); the same pattern as every other read here.
- Generic `ExportPanel` loop, so the fourth button works with no extra wiring.

## Findings
**REV-37 (nit)** `ExportPanel.tsx:33-36`: the plan (line 132) asks for "Esporta tutti i {N} invitati, anche se hai dei filtri attivi"; the hint has no N and "Gli eliminati non ci sono." reads curt. The panel has no count today, so the explicit "tutti ... anche se hai dei filtri attivi" is met; if N is cheap (guests count already read in `prepareExport`/page) add it, else change the plan. Suggested wording: "Gli eliminati non sono inclusi."

**REV-38 (nit)** `src/domain/export/export.test.ts`: the CSV test uses one partner setup. Add a `buildExport` -> `parseGuestsCsv` round trip with (a) a partner with no first name and (b) both partners with the same name, since the contract between `guestsCsvOf` and `sideOf` is the fragile part. Developer A's import may still change: pin it with a test.

Questions: none.

## Risposte

- **REV-37**: Testo corretto in "Gli eliminati non sono inclusi.". Il numero {N} NON e' aggiunto (respinto): la pagina `altro/esporta/page.tsx` carica solo "ultimo export" e non e' tra i miei file; per avere N servirebbe una lettura in piu' (conteggio invitati) nella pagina. Il testo "Esporta tutti gli invitati, anche se hai dei filtri attivi" soddisfa l'AC21; la riga del piano con {N} vale per il pulsante in Invitati (T13), dove il conteggio e' gia' a schermo.
- **REV-38**: Aggiunti due test in `export.test.ts` (`buildExport` -> `parseGuestsCsv`): partner senza nome (esportato come "Partner A", riletto come A) e due partner con lo stesso nome (nel CSV solo lettere, il nome non compare; riletto come A/B). Entrambi verificano anche `invalid === 0` e che "Entrambi" e "Non indicato" tornino uguali. Se A cambia l'import e i test si rompono, lo segnalo.
