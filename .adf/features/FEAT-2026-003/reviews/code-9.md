# Code review 9 - T11 CSV domain (89231d8 import, 05599d1 export, 4058f7a acceptance fix)

Verdict: **changes requested (minor)**: 0 blocking, 3 should, 3 nit. Checked against AC17-AC19, AC21, plan T11. Tests not run.

## Verified OK
- Decoding (`csv-import.ts:46-67`): UTF-8 strict, then Windows-1252; UTF-8 and UTF-16LE/BE BOM removed; a UTF-8/1252/odd-length UTF-16 text with a NUL gives `null` (unreadable). Invalid UTF-16 falls to 1252, whose NULs are then caught.
- Separator (`detectSeparator`, 82-111): first non-blank line, outside quotes, tie or none = `;`. A first line without separators does not turn later `Rossi, Mario` lines into columns.
- Tokenizer: RFC 4180 doubled quotes, quoted `;`/CR/LF, CR-only, CRLF, empty last line (no phantom record), blank records skipped but counted in line numbers. A very long field is bounded by `MAX_INPUT_CHARS` (4M) and the 500/900 KB checks.
- Limits (366, 460): 500 counts non-blank data records including error rows, not the header or blank lines; payload bytes are measured on `JSON.stringify({p_rows})` of ready rows, with 124 KB margin under 1 MB.
- Rows: tipo/lato words per AC18; ambiguous side = row error asking for A or B, never a guess (`sideOf` is the exact inverse of `usableSideNames`; checked with code-8); duplicates are warnings only (against live guests and inside the file); validity comes from `validateGuest` (single source). Error texts hold no cell values.
- Export side (`csv-export.ts`): live guests only, deleted-group guests with no group, same columns as the import.

## Findings
**REV-39 (should)** `csv-import.ts:169-171` vs `export/csv.ts:11-12`: not an exact inverse for user text that already starts with `'` plus a trigger char (a note like `'=ok`). `toCsv` does not guard it (first char is `'`), the import strips the apostrophe, so the round trip changes the data (AC21) and stores a value beginning with `=`. Fix: in `neutralise`, also prefix when `/^'[=+\-@\t\r]/` matches (`'=ok` is exported `''=ok`, import strips one and gets `'=ok` back); add the case to the round-trip test. The guard is then injective.

**REV-40 (should)** `csv-import.ts:81-82` and T12: `groupKey` (`\s+` collapse, `trim`, `toLowerCase`, accents kept) is the contract T12's SQL must reproduce, and JS and Postgres differ: JS `\s`/`trim` cover NBSP and Unicode spaces, Postgres `btrim` trims only spaces and `lower()` depends on the DB collation. Require in T12: `lower(regexp_replace(btrim_all(name), '\s+', ' ', 'g'))` on LIVE groups only (deleted ones ignored), one group per key within a batch, and an integration test with NBSP, tabs, `È`/`è`, and a deleted group of the same name. Question for T12's owner: confirmed?

**REV-41 (should)** `csv-import.ts:353-361`: a NUL typed or pasted in text is not removed (the check only runs on decoded files, and not for UTF-16). Postgres rejects `\u0000` in jsonb, so one cell can fail the whole `import_guests` call with a generic error. Fix: reject (row error "carattere non valido") or strip `\u0000` in `parseGuestsCsv` for every source, and run the NUL check for UTF-16 too (`:65`).

**REV-42 (nit)** `headerMap` (259-267): a near-miss header is data. Multi-column ones (`E-mail`, `Cellulare`) show as row errors, but a single-column header such as `Nome e cognome` imports as a guest named "Nome e cognome" with no warning. Fix: accept aliases (`e-mail`, `mail`, `cellulare`, `tel`) and warn when the first record of a single-column list looks like a header.

**REV-43 (nit)** Line numbers are record indexes (`line: index + 1`), so after a multi-line quoted field "Riga N" no longer matches the editor; an unclosed quote swallows the rest of the file in one error row (its `source` can be megabytes). Fix: count physical lines, and cap `source` (e.g. 500 chars plus "...") or say "le righe seguenti sono incluse".

**REV-44 (nit)** Warnings `c'è già {nome cognome}` (`:439`) and the side error with the partner's name carry personal values by design for the UI. T12 must never log `ImportRow.errors/warnings` or `source`, and the server action should answer with counts and fixed texts only (ADR-0002, point 6). Add a spy-on-console test there.

Test-only commit 4058f7a (acceptance export keys) is fine.

## Risposte (developer A)
- **REV-39**: fatto, ma con una correzione alla soluzione proposta. `'=ok` -> `''=ok` -> strip di un apostrofo darebbe ancora `''=ok` se lo strip guardasse solo `'` + trigger. Quindi la regola e' iniettiva cosi': `neutralise` (in `export/csv.ts`, unica modifica fuori dai miei file, autorizzata) antepone `'` se il testo inizia con `'*` + carattere trigger; `stripFormulaGuard` toglie un apostrofo da `'+` + trigger. Andata e ritorno testata con note `'=ok` e `''+1`.
- **REV-40**: confermato e fatto in T12. Chiave calcolata in SQL (non inviata dal client: servirebbe comunque in SQL per i gruppi esistenti, e una chiave del client sarebbe un'altra cosa di cui fidarsi): `private.guest_group_key` = lower di (spazi collassati e tagliati) con l'insieme degli spazi scritto per esteso (TAB LF VT FF CR, spazio, U+00A0, U+1680, U+2000-200A, U+2028/9, U+202F, U+205F, U+3000, U+FEFF = `\s` di JS). Solo gruppi vivi; un gruppo per chiave nel lotto; nome nuovo tagliato con lo stesso insieme. pgTAP: NBSP, tab, U+3000, `È`/`è`, gruppo eliminato con lo stesso nome, un gruppo per chiave. Residuo documentato nella migrazione: `lower()` segue la locale del DB (I con punto, sigma finale): al piu' si crea un gruppo invece di riusarlo.
- **REV-41**: fatto: NUL tolto dal testo in `parseGuestsCsv` per ogni sorgente; `decodeCsvBytes` rifiuta il NUL anche in UTF-16. Test.
- **REV-42**: fatto: alias `E-mail`, `mail`, `Cellulare`, `tel`, `cell` nell'intestazione; in una lista a colonna singola, una prima riga come "Nome e cognome" / "Invitati" / "Nominativo" ... da' un avviso ("sembra un titolo"), senza saltarla in silenzio.
- **REV-43**: fatto: `line` e' la riga fisica (conta gli a capo dentro le virgolette, CRLF una volta); `source` di una virgoletta non chiusa e' tagliato a 500 caratteri e l'errore dice che il testo seguente e' incluso. Test.
- **REV-44**: preso, spetta a B (azione di import): nessun log di errori/avvisi/source; risposta con conteggi e testi fissi; test con spia su `console`.

## Closure (reviewer, c22fb95)
- REV-39 CLOSED, and A's version is the right one: mine was not injective (`''=ok` would have come back as `'=ok`). Checked: export `e(v) = "'" + v` iff `v` matches `^'*T`; import strips one apostrophe iff the cell matches `^'+T`, a strict subset of `^'*T`. Case 1 (v matches): `e(v)` matches `^'+T`, strip gives `v`. Case 2 (v does not match): `e(v) = v` does not match `^'+T`, unchanged. Exact inverse (`csv.ts:14`, `csv-import.ts` `stripFormulaGuard`); a `+` is still neutralised; test with `'=ok` at `csv-import.test.ts:406`. Only trim-level normalisation remains (a leading TAB is trimmed on import, as every text field is).
- REV-40 CLOSED in `20261202200000_guests_import.sql` (see code-11).
- REV-41 CLOSED (`decodeCsvBytes` rejects NUL for every encoding; `parseGuestsCsv` drops it).
- REV-42 CLOSED: aliases and "sembra un titolo" warning (only on the first row of a one-column list). New nit REV-52: `HEADER_ALIASES[name]` is a plain object lookup, so a header cell `constructor` yields a function from the prototype; harmless today (it fails `COLUMN_SET.has` and the line is data) but use `Object.hasOwn` or a `Map`.
- REV-43 CLOSED: physical lines (CRLF once, quoted breaks counted) with a test (`:103`); unclosed-quote `source` capped at 500 and the message says the rest is included. A single huge, properly closed field still has its full `source` (see REV-48 in code-10, cap it where it is rendered).
- REV-44 stays with T13: `import-actions.ts` logs nothing and returns fixed texts (checked in code-10); the console-spy test is T13's.
- `csv-import.test.ts` and `export.test.ts`: 58/58 pass. Verdict for T11: **approved** (REV-52 nit open).

## Risposta REV-52 (developer A)
- **REV-52**: fatto. La ricerca nell'alias usa `Object.hasOwn`; test con intestazioni `constructor` e `toString` (restano dati).
