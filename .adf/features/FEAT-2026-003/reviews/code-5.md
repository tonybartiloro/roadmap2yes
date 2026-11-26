# Code review 5: T6 computed band and Percorso link (02a5d9b) + fixes of code-3 (ed244ab)

Verdict: **approved with should-fix items** (0 blocking, 1 should, 2 nit). Not run: e2e, browser.

BR6 and Decisions 4/9: covered. Band computed only when `guestCount > 0` (non-deleted count, `head` count), editable while empty, missing table (42P01/PGRST205) = 0, other errors surface. Link only for `lista-invitati-preliminare` and `raccogli-conferme` (both keys exist in `milestones/it.ts`), no status change (tested). Fix of code-3: all six closed (see there).

## Findings

**REV-21 (should)** `SettingsForm.tsx:126-134,143`. While the band is computed, the save body still sends `value.guestBand`. That is the stored value, but it comes from `initial`, which can be a restored local draft (Drafted) holding a band chosen while the list was empty. Saving the rite then silently writes that band: `guest_band` is written while computed, against ARC-10/BR6 (the "never saved" intent, and it can conflict on a field the user cannot see). Fix: when `view.guestCount > 0`, send `view.guestBand` (and in `mine`), or drop the field from the draft. Add a test (draft with another band + guestCount > 0 sends the saved band).

**REV-22 (nit)** `guests-nav.test.ts`. The timeout path (abort by signal) is not exercised, only errors and a throw; the abort rejection lands in the same `catch`, so behaviour is right, but add one case with `timeoutMs: 1` and a never-resolving double that rejects on the signal, so the contract "slow DB = item shown" is pinned.

**REV-23 (nit)** `e2e/guida.spec.ts` (last assertion) and `settings/data.ts` MISSING_TABLE_CODES. (a) The final e2e step is commented as checking that "Cos'è?" is a different control, but only counts the Aiuto links; rename the comment or assert the `reference-help` button has no `Aiuto` name. (b) `PGRST202` means "function not found", not a table: remove it from the set, or comment why.

## Checked and fine
- Security: no new entry point; count read goes through RLS; no personal data logged; link is a static route.
- Shared `AbortSignal.timeout` on both reads: correct (starts once, covers the pair; losing request is aborted); fail-open semantics clear and documented; layout comment states the reload consequence.
- A11y: `Info` and `CircleHelp` are `aria-hidden` with visible text; the two controls no longer share an icon.
- Users without guests read see a count of 0 and an editable band: acceptable.

## Risposte

| ID | Risposta |
|---|---|
| REV-21 | Fatto. Con `guestCount > 0` il salvataggio (e `mine` nel conflitto) usa `view.guestBand`, mai il valore della bozza. Test con bozza che contiene un'altra fascia. |
| REV-22 | Fatto. Caso con `timeoutMs: 1` e doppio che non risponde mai e rifiuta solo al segnale: l'elemento resta visibile. |
| REV-23 | Fatto. (a) L'e2e ora verifica che `reference-help` non abbia il nome "Aiuto" (se presente: esiste solo con una data di riferimento). (b) `PGRST202` tolto da `MISSING_TABLE_CODES`: restano 42P01 e PGRST205. |
