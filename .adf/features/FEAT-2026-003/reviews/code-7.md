# Code review 7 - T9 tables (commit 8c90a12)

Verdict: **approved with should-fix items** (0 blocking, 3 should, 2 nit). Checked against AC6, AC10 (tables), AC14-AC16, BR10, Decision 7, P2, PO-2, PO-5.

## Verified OK
- Seats exclude infants (`seating.ts:56-66`, `occupancyByTable`), over-capacity allowed and shown as text plus icon (`TableCard.tsx:43`), capacity 1-50 or none in domain, zod and the DB check (`guests.sql:58`).
- Deleted table = "Senza tavolo" via `liveTableOf` (P2); restore brings members back (FK `table_id` only cleared on a hard delete, `on delete set null`).
- Conditional UI: table filter dropped without a live table (`GuestsScreen.tsx` `visible`), "Assegna a tavolo" only with `tables.length > 0`; Tavoli tab always present with an empty state.
- Tabs are the Radix primitive (tablist, arrows, roving focus); targets `h-11`/`min-h-11`; "Rimuovi dal tavolo {nome}" contains its visible text (QA-2 ok); card name = visible text.
- Privacy: only fixed texts in toasts/errors, no personal values logged. Conflict: versioned update, RLS-denied = `forbidden`, dialog via `useConflict`.

## Findings
**REV-32 (should)** `tables-data.ts:70-115`: duplicates `versioned`/`conflictResult` logic of `data.ts`. Two copies of the conflict/forbidden rule will drift. Fix: once A exports them, delete the copy and call them (keep only `tableSchemas`, `addTable`, thin `updateTable`).

**REV-33 (should)** `RecentlyDeleted.tsx` `purgeConsequence`: only tables name the member count; PO-5 asks for it on groups too. Agree with the coordinator: add the count for groups (same wording pattern, "restano senza gruppo"), keep people unchanged, and have QA update the S1 e2e assertion. Do not keep a code comment justifying wording by a test.

**REV-34 (should)** `TableAddPeople.tsx:94-99, 228-235`: silent no-ops. A group with no live members, or "Lascia dove sono" when nobody is free (`toSeat` empty), calls `seat([])` which returns with no message and leaves the sheet open. Fix: if there is nothing to seat show a short line/toast ("Nessuno da aggiungere: sono già tutti seduti.") and close; disable "Aggiungi il gruppo" for an empty group or note the member count in the option.

**REV-35 (nit)** `TablesTab.tsx:27`: comparator never returns 0 and ignores Italian collation; use `a.name.localeCompare(b.name, "it")` like groups (`TableAddPeople.tsx:79`).

**REV-36 (nit)** `TableAddPeople.tsx:233`: `Sposta` when the plan has only `alreadyElsewhere` is fine; add a test for the "Lascia dove sono" no-op path together with REV-34.

## Developer notes
1. Duplicate: remove (REV-32). 2. Add the group count (REV-33). 3. `tables-data.ts` and `TableAddPeople.tsx` accepted as extra files: cohesive, keep `data.ts` from growing; update the plan file list.

Questions: none blocking.

## Risposte
- **REV-32**: fatto. `updateTable` ora chiama `versioned` di `data.ts` (conflitto, `forbidden` e errori in un solo posto); in `tables-data.ts` restano `tableSchemas`, `addTable` e il piccolo mappatore dei campi per il dialogo di conflitto. Test d'integrazione invariati e verdi.
- **REV-33**: fatto, per i gruppi come per i tavoli; tolto il commento sull'e2e. Testo nuovo dei gruppi: "Non si può annullare. Le N persone che ne fanno parte restano, senza gruppo." (N=1: "La persona che ne fa parte resta, senza gruppo."; N=0: "Nessuna persona ne fa parte."). Le persone restano invariate ("Spariscono anche dalle esportazioni."). Test aggiunto.
- **REV-34**: fatto. Nessuno da sedere ("Lascia dove sono" con tutti già seduti): toast "Nessuno da aggiungere: sono già tutti seduti." e lo sheet si chiude. Gruppo senza persone vive: nota "Questo gruppo non ha ancora persone: aggiungine prima dal gruppo." e nessuna scrittura; la nota sparisce cambiando gruppo.
- **REV-35**: fatto, `localeCompare(..., "it")`.
- **REV-36**: fatto, due test (nessuno libero; gruppo vuoto) più quello sul conteggio dei gruppi.

## Closure (reviewer; b245703, a0d626d, 42adaff, 841a683)
- REV-32 CLOSED: `tables-data.ts:75-87` calls the shared `versioned`; the duplicate is gone.
- REV-33 CLOSED: `RecentlyDeleted.tsx:74-82` gives the count for groups and tables; test added.
- REV-34 CLOSED: `TableAddPeople.tsx` toast and close when nothing to seat, note for an empty group, no write.
- REV-35 CLOSED: `TablesTab.tsx:27` uses `localeCompare("it")`. REV-36 CLOSED: both no-op paths tested.
- a0d626d (QA-3): no regression found. `onDone` is the table sheet's `onClose`, which sets the sheet to null, so both
  sheets unmount together and no stale local state is left. Annulla undoes through `actions.bulk` previous values, so
  moved people return to their old table. Focus: sheets are state-opened (no trigger); Radix returns focus to the
  previously focused table card, which stays mounted. Not verified in a browser (no e2e run).
- `components.test.tsx`: 42/42 pass. New findings: none.

Verdict: **approved**.
