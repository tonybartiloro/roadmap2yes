# FEAT-2026-003 — product-owner challenge, F2 round 1

Verdict: plan covers AC1-AC23 and BR1-BR10 and respects the scope (no RSVP, no room map; only shape/position columns as BR10 asks). 0 blocking, 3 should, 4 nit. No new business question; D-A is the developer's call (proposal below).

| ID | Severity | Evidence | Finding | Proposal | Response (author) | Closed |
|---|---|---|---|---|---|---|
| PO-1 | should | AC10 (groups and tables also restorable from "Eliminati di recente"); T5 owns `RecentlyDeleted.tsx` and T4 covers delete/restore of guests and groups; T9 lists only AC14-AC16 | Restoring a deleted **table** (toast and "Eliminati di recente") has no task, no file owner and no test; AC10 is not in T9/T10 | Add AC10 to T9 and T10 and give T9 the table part of `RecentlyDeleted.tsx` (or T5 renders all three kinds from a generic list); e2e: delete table, members become "Senza tavolo", restore brings them back | | |
| PO-2 | should | AC16 "scheda Tavoli sempre presente con vuoto calmo, campo/filtro/conteggi solo con tavoli"; plan S2 and T10: "nessuna traccia dei tavoli finché non ne esistono" | Contradicts AC16 (the tab itself must exist, with "Crea tavolo") | Reword S2 and T10: tab always visible with empty state; only field, filter and counts are conditional. Also T5 must hide "Assegna a tavolo" in the bulk bar until a table exists (S1 ships before S2) | | |
| PO-3 | should | AC21 "in Invitati e in Opzioni > Esportazione, sempre tutti, con testo esplicito, anche con filtri attivi"; plan: client CSV from "Invitati" + a fourth button in the export panel | Not stated: the guest CSV generated from loaded data must contain all guests regardless of filters, exclude recently deleted ones, and the export panel must carry the explicit "tutti gli invitati, anche con filtri" text; "eliminati di recente marcati" applies only to the full JSON (AC22) | Add these three points to T11/T14 and to the e2e of T15 | | |
| PO-4 | nit | BR4/DES-13: duplicate warning inline in the form and as "avviso" in the import preview | T2 has the pure function, but T5/T13 do not mention showing the warning (non-blocking) | Mention it in T5 (sheet) and T13 (preview cards) with a test | | |
| PO-5 | nit | AC11 "Svuota" | Permanently deleting a group or table leaves living members "Senza gruppo/tavolo": the confirmation should say so, not only the number of persons | Dialog text covers members affected | | |
| PO-6 | nit | `guest_tables.sort_order` in the model | Not in any AC or BR (no reordering in R-03; R-06 may use it) | Drop it, or keep it and say "unused, for R-06" in the plan | | |
| PO-7 | nit | AC20 / P4: undo deletes the batch's guests physically | Rows edited after the import are deleted too (risk already accepted) | Fine; make the toast text say "Annulla importazione (rimuove le N persone importate)" | | |

## Risposte (architetto, 2026-11-25)
- **PO-1: accettata.** Elimina/ripristina/definitivo dei tavoli in T4; `RecentlyDeleted` in tre sezioni; AC10 in T9 e T10, con l'e2e "elimina tavolo → membri senza tavolo → ripristino".
- **PO-2: accettata.** S2, T9 e T10 riformulati: la scheda Tavoli è sempre visibile con il vuoto; solo campo, filtro, "Assegna a tavolo" e conteggi sono condizionali.
- **PO-3: accettata.** Il CSV contiene tutti gli invitati vivi, indipendentemente dai filtri e senza eliminati; c'è il testo esplicito in Invitati e in Opzioni; gli eliminati sono marcati solo nel JSON (T11, T14, T15).
- **PO-4: accettata** (T5 sheet, T13 anteprima).
- **PO-5: accettata.** Le conferme dicono anche le conseguenze sui membri (T5).
- **PO-6: accettata.** `sort_order` tolto; R-06 aggiungerà ciò che serve.
- **PO-7: accettata.** Testo del toast nel piano (Import).

## Question for the developer
- **D-A (staging)**: proposal **(a)**: you apply the migrations to staging from your machine (fake data only) before trying the preview. It is the safest of the three; (c) leaves Gate C untested on the shared database.
