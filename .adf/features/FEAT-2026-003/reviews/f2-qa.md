# FEAT-2026-003 — F2 challenge, QA (round 1)

Read: brief.md (23 AC), plan.md, design.md, ADR-0002 draft, project.md, existing `e2e/`, `tests/`. Severity: `blocking` / `should` / `note`. Verdict: plan sound and proportionate; 2 blocking gaps (one unowned CI oracle, one AC with no design).

## AC to test map (as planned, with gaps)
| AC | Level planned | Gap |
|---|---|---|
| AC1, AC3, AC9 | e2e + component | none |
| AC2 | Vitest validation + component | `tel`/`email` keyboard attributes (`type`, `inputmode`) not named; DB CHECK boundaries not in the pgTAP list (QA-6) |
| AC4 | not named | stored value A/B/both/null, not the name: add integration assert (QA-6) |
| AC5 | pgTAP (family RPC) + e2e | ok; >100 rows collapsed: Vitest |
| AC6 | e2e 2 contexts + integration | also tables (AC6 names them): T10 |
| **AC7** | e2e "azioni di massa" | **"con Annulla" for assign has no design (QA-1)** |
| AC8 | Vitest counts | ok; add e2e: delete lowers the summary |
| AC10 | pgTAP + e2e (person) | group restore in e2e; table delete/restore belongs to T10, not T8 (QA-8) |
| AC11 | pgTAP + integration | "no automatic expiry" has no test (QA-6) |
| AC12 | integration + e2e 1200 | full export of 1200 (`export/data.ts`) not named (QA-6) |
| AC13 | pgTAP + acceptance | seed fake names, log/error leak not tested (QA-5, QA-6) |
| AC14-16 | Vitest seating + T10 | all-tables-deleted = hidden fields; add to Vitest |
| AC17-19 | Vitest parser + e2e | gaps in QA-7 |
| AC20 | pgTAP + e2e | `undo_guest_import` with another wedding's batch (QA-6) |
| AC21-22 | Vitest round trip + integration + e2e | gaps in QA-7 |
| AC23 | guida.nav/guida specs | HelpLink map and Opzioni "Guida" card untested; see QA-2, QA-3 |

## Objections

**QA-1 (blocking) — AC7 "Annulla" on mass assign is not designed, so it is untestable.**
Evidence: AC7 says assign group / assign table / delete apply to all "con Annulla". Plan "Scritture" gives Annulla only for delete (restore by id). Assignments are `update ... in (ids)` with last-write-wins; nothing stores the previous `group_id`/`table_id`.
Proposal (architect): the action returns the previous values per id and Annulla re-applies them (last-write-wins, ignoring ids deleted meanwhile), or the brief narrows AC7. Then tests: Vitest on the undo payload, integration (assign, undo, values back), e2e (select 2, assign group, Annulla).

**QA-2 (blocking) — the existing acceptance oracle `tests/acceptance/support/matrix.ts` is owned by no task.**
Evidence: `grants.test.ts:57-61` asserts catalog tables/functions equal `TABLES`/`FUNCTIONS`; `rls-api.test.ts` loops over `TABLES` with a `family` actor (line 285). T1/T12 list only the SQL twin `qa_catalog_matrix.test.sql`. 3 tables + 3 RPC will turn CI red. `TableSpec.delete` is "own rows only" and cannot express "DELETE only on soft-deleted rows" (first domain DELETE).
Proposal: T1 and T12 own `matrix.ts` entries (like the SQL oracle); extend `TableSpec` with a conditional delete (`deleteWhen`) and QA verifies it. Entries give family/other-wedding/anon denial for free; `tests/acceptance/guests.test.ts` then only adds audit and "Novità".

**QA-3 (should) — the Guida move touches more tests than T3 lists.**
Evidence and exact changes:
- `e2e/guida.nav.spec.ts`: `measure()` swaps the label at `items.length - 2` (was Opzioni; becomes Invitati: fix index or target by name) and asserts `OPTIONS_SECTION_LABEL` among 6 rows; it is already the 12 themes × 320/768/1024 matrix. **Only update it**; T17 "matrice nav 320/768/1024" is a duplicate: drop it.
- `e2e/guida.spec.ts`: "Guida is last of 6 items" (73-93), `nav.getByRole("link",{name:"Guida"})` at 124, 136, 217 (touch target) must become: Guida card in Opzioni, Opzioni `aria-current` on `/guida/**` (P5), 44 px on the card.
- `e2e/altro.spec.ts:40-59`: asserts Opzioni active on `/altro` routes; not owned by T3, add it (or confirm unchanged).
- `src/components/interactive.test.tsx` (T3): 6 items, order, Invitati hidden without permission.
Proposal: T3 updates those files to stay green in S1; QA adds only new files (`e2e/invitati.nav.spec.ts`: 6 items at 320 and desktop, no Guida, family sees no Invitati and gets the "su invito" panel, HelpLink href on the 6 sections and one click-through, Guida card in Opzioni). Plus a Vitest test that every HelpLink route maps to an existing `docs/functional` slug.

**QA-4 (should) — T3 depends on T1.** The layout calls `has_permission(…,'guests','read')`; without T1's permission rows Invitati is hidden and `guida.nav.spec` (6 labels) fails. Mark T3 depends on T1, or write T3 so the nav test seeds the permission.

**QA-5 (should) — personal data leaks beyond the audit log are not tested.**
Evidence: a Postgres CHECK failure returns `DETAIL: Failing row contains (…name, phone…)` to the client; server actions or `console.error` can echo it. ADR-0002/NFR forbid personal data in logs.
Proposal: integration tests on `guests.actions` with a console spy: an invalid phone/email/name action returns a stable code and no log line or result contains the name/phone/email/notes. Vitest guard that `supabase/seeds/04_guests.sql` uses only `@example.test` emails and obviously fake phones (public repo).

**QA-6 (should) — add these cases to the pgTAP/integration lists (cheap, high risk).**
- CHECK boundaries: name empty/spaces/80/81, notes 500/501, phone 5/6/20/21 chars and forbidden chars, email invalid, enums `category`/`side`/`shape`, `capacity` 0/1/50/51/null.
- Stored side is `A|B|both|null`, never a name (AC4).
- `create_guest_family` atomic: one invalid row, no group left behind. Group/table of another wedding: composite FK rejects.
- Delete of a group with live members (set null) and RLS `DELETE` on a live row refused for group, table and guest.
- No auto expiry (AC11): set `deleted_at` to 400 days ago, run the existing cron/cleanup functions, row survives.
- `undo_guest_import` with another wedding's batch id deletes nothing; `import_guests`/`undo` as `family` give 42501.
- Full export (`export/data.ts`) with 1200 guests returns all (page > 1000) and omits the permanently deleted.

**QA-7 (should) — parser/exporter test list gaps (T11).**
- UTF-8 BOM at file start must be stripped or the `nome` header is missed; our own export writes a BOM.
- `csv.ts` neutralises also leading tab and CR; the planned inverse handles only `'` + `= + - @`. Cover tab/CR or declare them out.
- `lato` ambiguity: partner named "A", "B" or "Entrambi", identical first names, partner B not yet created, accents; define precedence and test the round trip.
- Header ambiguity (a guest called "Nome" without header), missing/extra columns, blank and trailing-separator lines, CRLF inside quoted notes, 500/501 boundary.
- Worst-case payload: 500 rows with all fields at max length and multibyte characters must stay under the 1 MB server-action limit (plan says ~600 KB, unproven).
- Windows-1252 fixture: do not commit a binary `.csv`; build bytes in the test (`Buffer.from(text, "latin1")`), otherwise editors/git normalise it and the test passes vacuously. Add a check that the fixture is NOT valid UTF-8.

**QA-8 (should) — ownership and traceability.**
- AC10 and AC6 for tables are mapped only to T8 (S1); table delete/restore and table conflict go in T10.
- T10 needs seed helpers (`addGuestTable`, assign) in `e2e/support/seed.ts`, which is owned by T8: list the file under T10 as well (same owner).
- Axe: the plan says "Tavoli, sheet, import" in a11y, but T10/T15 do not own `e2e/a11y.spec.ts`. Add it to their file lists, or run `support/axe.ts` inside their specs.
- A `family` user in e2e: create it as `rls-api.test.ts:211` does (service insert into memberships) in a `support` helper; state it in T8.

**QA-9 (should) — keep the added e2e lean (full suite is ~33 min locally; `percorso.spec.ts:334` is flaky).**
- Run each flow in one project by file suffix (config already splits `.mobile.spec`/`.desktop.spec`): CRUD/famiglia/filtri, tavoli, import = `.mobile` (sheet-heavy); conflict (2 contexts), export/download, scale = `.desktop`. Do not double every spec. A 320 px check uses `setViewportSize`, as `guida.nav.spec` does (project is 360 px).
- Seeding: never through the UI nor `import_guests`. Add `seedGuests(w, rows)` in `support/seed.ts`: one `founderClient.insert` per 500 rows (insert is not capped by `max_rows`); ~12 named guests for flows, 500 then +700 in the same wedding to serve both "500 < 1 s" and "1200 all counted".
- Scale assertions without scrolling: summary text "1200 persone", exported CSV has 1201 lines and the same name set as the seed, a search finds a guest from the 1001st+ page, groups >100 closed. Never 12 themes here.
- 1 s: measure in the page (navigation start to first row visible), median of 3 reloads, desktop only; CI runs 2 workers with 1 retry that reports flaky: do not assert on wall-clock around Playwright calls.
- Annulla 8 s: do not copy `percorso.spec.ts:291-305` (`waitForTimeout(8000)`). Test the shared constant and the toast with Vitest fake timers (visible at 7.9 s, for guest, group, table and import toasts if they share the hook); e2e only clicks Annulla at once.
- `percorso.spec.ts:334`: T3 (PercorsoHeader) and T6 (TaskSheet) touch that screen. At the end of S1 run `percorso.spec.ts` once; if :334 fails, re-run only it and record it as the known pre-existing flaky test, not a regression. Propose to give its fix to QA (a flaky test is a bug), out of this feature's scope unless the developer agrees.

**QA-10 (note) — themes.** One run in T17 is justified only for new colour roles (warning "Oltre la capienza", error text in import cards, filter chips, selected rows): seed one wedding with those states visible and test `/invitati` once per theme, light/dark; not per sheet.

**QA-11 (note) — T17 full run.** Plan matches testing.md 12 (full plan once on the integrated result, then only failed tests). Keep `webkit-smoke` out locally unless `e2e:install` was done; run with `E2E_PORT=3300`.

## Risposte (architetto, 2026-11-25)
- **QA-1: accettata.** Nuove RPC `guests_bulk(ids, op, target)` → `previous` per id e `guests_bulk_undo(previous)` (`SECURITY INVOKER`, l'ultimo salvataggio vince, salta id spariti o eliminati); id nel body perché "tutti i filtrati" può superare 1000. Test: pgTAP, integrazione, e2e (plan P6, T1, T4, T5, T8).
- **QA-2: accettata.** T1 e T12 possiedono `matrix.ts`; `TableSpec.delete: boolean | "soft_deleted"`, interpretato da T1 in `rls-api.test.ts`; T8 lo verifica.
- **QA-3: accettata.** T3 possiede anche `altro.spec.ts` e `HelpLink.test.tsx` (route → file esistente). La matrice nav di T17 è tolta; QA aggiunge `invitati.nav.spec.ts`.
- **QA-4: accettata.** T3 dipende da T1 (e da T7 per `invitati.md`).
- **QA-5: accettata.** Messaggi fissi, mai `message`/`details` del DB; integrazione con spia su `console` (T4); guardia Vitest del seed (T1).
- **QA-6: accettata.** Tutti i casi elencati entrano nella riga pgTAP/integrazione del test plan.
- **QA-7: accettata, con una modifica.** BOM, tab/CR, precedenza del lato, regola dell'intestazione e fixture 1252 costruita nel test sono nel piano. Il caso peggiore di 500 righe arriva a ~1,5 MB, quindi non "resta sotto 1 MB": c'è una guardia a 900 KB con errore chiaro, testata, senza alzare il limite globale (P3).
- **QA-8: accettata.** Tavoli: AC6/AC10 in T9 e T10; T10 possiede `seed.ts` dopo T8; axe con `support/axe.ts` dentro le specifiche; helper `family` in T8.
- **QA-9: accettata.** Specifiche `.mobile`/`.desktop`, `seedGuests`, asserzioni di scala senza scroll, misura nella pagina, Annulla con timer finti; il flaky di `percorso.spec.ts:334` va registrato come preesistente.
- **QA-10 e QA-11: accettate** (T17).

## Coverage verdict
AC with no test as planned: **AC7 undo** (QA-1), **AC11 "no expiry"**, **AC4 stored value**, **AC13 seed/log leak**, **AC23 HelpLink + Guida card**. Others are covered at a sensible level; no heavy matrix is required beyond the existing nav matrix and one themes pass.
