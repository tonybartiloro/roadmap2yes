# FEAT-2026-003 — Invitati: anagrafica, gruppi/famiglie, tavoli facoltativi: implementation plan

| Brief | Design | Size | Status |
|---|---|---|---|
| brief.md (approvato 2026-11-25) | design.md (finale F2) | L | in discussion |

## Current state
- **Permessi**:
  - `private.role_permissions(role, area, action ∈ {read, write})` è popolata solo per `partner` (`supabase/migrations/20261201100000_core.sql:246-269`);
  - ogni policy usa `public.has_permission(wedding_id, area, action)` (`core.sql:357-373`).
- **Schema delle tabelle di dominio** (tasks, budget):
  - trigger `set_audit_cols`, `bump_version`, `guard_row` e `audit_row` (`core.sql:44-91, 311-340`; `20261201300000_budget_notifications.sql:170-253`);
  - scritture dirette con grant di colonna più RLS (`budget_notifications.sql:305-322`), RPC solo per le operazioni multi-riga (`move_budget_items`, `:330`).
- **Eliminazione logica**:
  - `deleted_at`/`deleted_by` stampati da un trigger (`task_rules`, `20261201200000_decisions_timeline.sql:486-496`);
  - nessun `DELETE` concesso e nessuna purga;
  - UI con Annulla ed "Eliminati di recente" (`src/features/timeline/actions.ts:172-186`, `Notices.tsx:195-223`).
- **Audit**:
  - `audit_log` è append-only anche per la chiave segreta (`core.sql:300-303`);
  - `audit_row` copia la riga intera, escluse le colonne passate come argomento del trigger (`core.sql:322-323`);
  - "Novità" legge solo `AUDIT_TABLES = tasks, budget_versions, payments` (`src/features/home/data.ts:356`).
- **Concorrenza**: `versionedUpdate` (`src/lib/supabase/versioned-update.ts`) con il dialogo di conflitto (`src/features/budget/data.ts:250-273`, `use-conflict.tsx`, `src/components/ConflictDialog.tsx`).
- **Letture lunghe**: `src/lib/supabase/all-pages.ts` (pagine da 500, `max_rows` = 1000 in `supabase/config.toml:14`).
- **Oracoli del catalogo**:
  - SQL `supabase/tests/qa_catalog_matrix.test.sql`, TypeScript `tests/acceptance/support/matrix.ts` (`TableSpec.delete: boolean`, `:28`), usati da `grants.test.ts:57-61` e `rls-api.test.ts:309, 403, 549`;
  - oggi l'unica tabella con `DELETE` è `option_reactions`.
- **Export**:
  - `src/features/export/data.ts:69-171` legge colonne esplicite;
  - il CSV usa `;`, BOM, CRLF e neutralizza con `'` il testo che inizia con `= + - @`, tab o CR (`src/domain/export/csv.ts:1-24`);
  - il bundle contiene json, compiti e budget (`src/domain/export/build.ts:42-61`).
- **Navigazione**:
  - 6 voci con "Guida" ultima (`src/components/AppNav.tsx:24-31`), il layout non legge il DB (`src/app/(app)/layout.tsx:11-21`);
  - "Profili" in Opzioni usa l'icona `Users` (`src/app/(app)/altro/page.tsx:36`);
  - `e2e/guida.nav.spec.ts:69` verifica 6 voci e la larghezza delle etichette a 320 px.
- **Fascia invitati**: `weddings.guest_band` è letta da impostazioni, onboarding ed export; `settings/model.ts:49` la segna "da definire" se vuota.
- **Rilascio**:
  - `migrate.yml` applica le migrazioni in produzione al merge, in parallelo al deploy Vercel (`.github/workflows/migrate.yml:17-19`);
  - lo staging le riceve solo a mano e da `main` (`docs/technical/ambienti-e-rilascio.md:181`).
- **Limiti**: body delle server action di 1 MB (`node_modules/next/dist/docs/.../serverActions.md:59-63`); Postgres 17 (`config.toml:20`).

## Solution
Nuovo modulo `guests` costruito come budget e timeline, senza nuove dipendenze né servizi. Regole sui dati personali in ADR-0002 (`docs/adr/0002-dati-personali-invitati.md`).

**Dati** (migrazione `20261202100000_guests.sql`, solo additiva):
- **`guest_groups`**: `id`, `wedding_id`, `name` 1-80, `import_batch_id`, `deleted_at`/`deleted_by`, `version` e colonne di audit; `unique (id, wedding_id)`.
- **`guest_tables`**:
  - `id`, `wedding_id`, `name` 1-60, `capacity` 1-50 null;
  - campi per R-06 (BR10): `shape` (`round` | `rect`, default `round`), `pos_x`/`pos_y` numeric null (null = non posizionato);
  - `deleted_*`, `version`, audit; `unique (id, wedding_id)`;
  - nessun `sort_order`: l'elenco è per nome, R-06 aggiungerà ciò che le serve.
- **`guests`**:
  - `id`, `wedding_id`, `first_name` 1-80 (non vuoto dopo trim), `last_name` ≤80;
  - `category` (`adult` | `child` | `infant`, default `adult`; `check` estendibile, DES-16);
  - `side` (`A` | `B` | `both` | null);
  - `phone` (`^[0-9+()./ -]{6,20}$`), `email` citext con la regex di `core.sql:143`, `notes` ≤500;
  - `group_id`, `table_id`, `import_batch_id`, `deleted_*`, `version`, audit;
  - FK composte `(group_id, wedding_id)` e `(table_id, wedding_id)` con `on delete set null (group_id)` / `(table_id)` (PG ≥ 15);
  - indici `(wedding_id) where deleted_at is null`, `(group_id)`, `(table_id)`.
- **Trigger**:
  - `set_audit_cols`, `bump_version`, `guard_row`;
  - stampa di `deleted_*` come `task_rules`;
  - rifiuto dell'assegnazione a un gruppo o tavolo eliminato (`group_deleted` / `table_deleted`);
  - `audit_row` con le colonne personali escluse (ADR-0002 §1).
- **Permessi**:
  - si allarga il `check` di `role_permissions.action` a `delete`;
  - righe `partner × guests × {read, write, delete}` (BR8).
- **RLS e grant**:
  - select/insert/update con `has_permission(…,'guests','read'|'write')`;
  - `DELETE` solo `using (deleted_at is not null and has_permission(…,'guests','delete'))`;
  - grant di colonna (mai `wedding_id`, `version` e audit in update);
  - nessun grant `anon`.
- **RPC** (nella migrazione `guests`):
  - `create_guest_family(p_name text, p_side text, p_rows jsonb) → {group_id, guest_ids}`: gruppo e persone in una transazione (AC5);
  - `guests_bulk(p_ids uuid[], p_op text, p_target uuid default null) → {previous: [{id, group_id, table_id, deleted}], changed}`:
    - `p_op` ∈ `assign_group`, `assign_table`, `delete`, `restore`;
    - è `SECURITY INVOKER`, quindi valgono RLS e grant di colonna;
    - gli id passano nel body perché "Seleziona tutti i filtrati" può superare 1000 id, troppi per un filtro `in` in URL;
  - `guests_bulk_undo(p_previous jsonb) → {restored}`:
    - riscrive `group_id`, `table_id` e lo stato di eliminazione salvati;
    - salta gli id che non esistono più e, per le assegnazioni, quelli eliminati nel frattempo;
    - l'ultimo salvataggio vince (AC7).

**Eliminazione di gruppi e tavoli** (AC10): è logica e **mantiene il puntatore**. "Senza gruppo" / "Senza tavolo" si calcolano come `id null o elemento eliminato`, quindi il ripristino rimette dentro i membri senza memorizzare nulla. "Elimina definitivamente" e "Svuota" (per sezione o in totale) fanno un `DELETE` fisico; le FK azzerano i riferimenti dei vivi.

**Letture**:
- `src/features/guests/data.ts` carica gruppi, tavoli e invitati (anche eliminati) con `all-pages.ts`, ordinando per `id` (AC12, nessun tetto);
- filtri, conteggi e duplicati sono funzioni pure in `src/domain/guests/` sui dati caricati;
- sopra 100 righe i gruppi sono chiusi e ogni elenco (sezione, lista piatta, Eliminati di recente, anteprima import) mostra 100 righe alla volta con "Mostra altre 100 (ne restano N)"; i conteggi sono sempre sul totale (design §2.1);
- nessuna virtualizzazione;
- una tabella non ancora migrata (`42P01`/`PGRST205`) dà in `/invitati` un `ErrorState` con "Riprova" e nelle impostazioni una lista vuota.

**Scritture** (server action con zod e `ActionResult`, come budget):
- **modifica da modulo** di invitato, gruppo e tavolo: `versionedUpdate` più `ConflictDialog` (AC6, BR9);
- **assegnazioni rapide** di un solo invitato: `update` diretto;
- **azioni di massa** e "Aggiungi un gruppo intero": `guests_bulk`; l'Annulla (≥ 8 s) chiama `guests_bulk_undo` con il `previous` ricevuto;
- **elimina e ripristina** (un elemento, di qualsiasi tipo): `deleted_at`;
- **elimina definitivamente e svuota**: `delete` diretto (AC11);
- **errori**: codici e messaggi fissi; mai `message`/`details` del DB, che possono contenere la riga, nel risultato o nei log (QA-5).

**Tavoli (S2)**:
- la scheda Tavoli è sempre visibile, con il vuoto "Crea tavolo" (AC16);
- campo tavolo, filtro, "Assegna a tavolo" e conteggi compaiono solo con almeno un tavolo vivo;
- occupazione = invitati vivi del tavolo esclusi gli `infant` (AC14);
- "Oltre la capienza di N" in testo (AC16).

**Import (S3)**:
- **Parsing nel browser** (funzione pura `src/domain/guests/csv-import.ts`):
  - `TextDecoder('utf-8', {fatal: true})`, con ripiego su `windows-1252`; si toglie il BOM;
  - separatore `;`/`,` rilevato, virgolette RFC 4180 (anche CRLF dentro un campo);
  - la prima riga è un'intestazione solo se tutte le sue celle sono nomi di colonna noti (con "nome"), altrimenti è dati;
  - si toglie un `'` iniziale seguito da `= + - @`, tab o CR (inverso esatto di `csvCell`).
- **Lato**, in quest'ordine:
  1. `entrambi`;
  2. nome del partner A, poi del B (senza maiuscole e accenti; se i due nomi coincidono o un partner non ha nome, i nomi sono ambigui ed errore di riga);
  3. le lettere `A`/`B`.
  - L'export scrive il nome del partner, oppure la lettera se il nome è ambiguo o assente: l'andata e ritorno resta esatta.
- **Limiti**:
  - max 500 righe (AC19);
  - payload serializzato ≤ 900 KB, sotto il limite di 1 MB delle server action. 500 righe realistiche pesano circa 50-150 KB; il caso peggiore teorico (tutti i campi al massimo, caratteri a 4 byte) arriva a ~1,5 MB e dà l'errore "Il file è troppo grande: dividilo in due".
- **Server action**:
  - rivalida le righe con lo stesso schema;
  - chiama `import_guests(p_rows jsonb) → {batch_id, guests, groups}` (migrazione `20261202200000_guests_import.sql`), che crea in una transazione gruppi nuovi e invitati con lo stesso `import_batch_id`;
  - un gruppo esistente si riconosce per nome normalizzato.
- **Annulla importazione** (AC20): `undo_guest_import(p_batch_id)` cancella fisicamente gli invitati del lotto e i gruppi del lotto rimasti senza altri membri. Il toast dice "Annulla importazione (rimuove le N persone importate)".
- Il file non lascia mai il browser.

**Export (S3)**:
- **CSV invitati** (`src/domain/guests/csv-export.ts`, con `toCsv`):
  - stesse colonne dell'import;
  - **tutti gli invitati vivi, indipendentemente dai filtri**, mai gli eliminati;
  - generato nel client da "Invitati" e come quarto file dell'export completo;
  - testo visibile "Esporta tutti i {N} invitati, anche se hai dei filtri attivi" (AC21).
- **JSON completo**: `guests`, `guestGroups` e `guestTables`, con gli eliminati di recente marcati (`deleted: true`, AC22).

**Navigazione e Guida (AC23)**:
- `NAV_ITEMS` = Home, Percorso, Scelte, Budget, **Invitati** (icona `UsersRound`), Opzioni; "Profili" passa a `UserCog`, così le due icone non si confondono (DES-23);
- su `/guida/**` è attiva Opzioni;
- il layout diventa `async` e nasconde Invitati senza `has_permission(…,'guests','read')`;
- `/invitati` senza permesso mostra in pagina il pannello "Questo spazio è su invito", senza redirect: le guardie rimandano i membri via da `/su-invito` (`src/features/auth/guards.ts:14`);
- `src/components/HelpLink.tsx`:
  - mappa route → pagina della Guida;
  - testo "Aiuto" da 360 px, solo icona sotto;
  - presente nelle 6 sezioni e nelle sottopagine di Opzioni che hanno una pagina;
- carta "Guida" distinta in cima a Opzioni (design §1).

**Fascia e Percorso**:
- impostazioni: con invitati vivi, testo "Sei a N persone: fascia X" e link alla lista (BR6), con `bandOf(count)` puro; `guest_band` non si scrive;
- Percorso (Decisione 9): mappa `template_key → href` in `src/features/timeline/links.ts` e link "Vai a Invitati" nel dettaglio del compito.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Gruppo/tavolo eliminato azzera `group_id` e l'Annulla rimette gli id | Nessun calcolo "senza gruppo" | Il ripristino da "Eliminati di recente" (giorni dopo) non saprebbe chi rimettere | Il puntatore mantenuto copre AC10 |
| Annulla delle azioni di massa tenuto nel client (valori letti dallo stato locale) | Nessuna RPC | Lo stato locale può essere vecchio; gli id oltre 1000 non entrano in un filtro URL | `guests_bulk` restituisce i valori reali precedenti |
| Gruppo come testo sull'invitato | Una tabella in meno | R-04 vuole link per gruppo con id stabile | BR5 |
| Parsing CSV sul server (upload del file) | Un solo punto di validazione | Il file con dati personali passa dalla rete; limiti di body e durata su Hobby | Parsing nel client più rivalidazione sul server |
| Alzare `serverActions.bodySizeLimit` a 2 MB | Nessun errore "file troppo grande" | Il limite vale per tutte le action, login compreso | Il caso peggiore non è realistico; meglio un errore chiaro |
| Libreria CSV (papaparse) | Parser maturo | Nuova dipendenza | Parser proprio, con i test |
| Audit escluso del tutto | Più semplice | Si perde chi/quando anche per i dati strutturali | ADR-0002 |
| Virtualizzazione (TanStack Virtual) | Liste enormi fluide | Nuova dipendenza; a11y più delicata | "Mostra altre 100" basta |
| `delete` mappato su `write` | Nessun cambio al `check` | BR8 chiede un permesso proprio | Allargare il `check` è additivo |

## Impacts
- **Dati**:
  - 2 migrazioni additive (3 tabelle, 1 `check` allargato, righe di permesso, 5 RPC); **nessuna distruttiva**;
  - niente rollback dello schema: si corregge in avanti;
  - `database.types.ts` rigenerato.
- **Contratti** (RPC nuove, `authenticated`):
  - `create_guest_family(text, text, jsonb)`, `guests_bulk(uuid[], text, uuid)`, `guests_bulk_undo(jsonb)`, `import_guests(jsonb)`, `undo_guest_import(uuid)`;
  - errori `P0001` con codice stabile (`invalid_row`, `too_many_rows`, `payload_too_large`, `group_deleted`, `table_deleted`) e `42501` per i dinieghi.
- **Export**: JSON con le chiavi `guests`, `guestGroups`, `guestTables`; un file in più nel bundle.
- **Prestazioni**: lettura paginata (3 richieste per 1200 invitati); DOM limitato a 100 righe per elenco; il layout fa una chiamata RPC in più.
- **Sicurezza**:
  - nuova area di permessi e primo `DELETE` su dati di dominio (ADR-0002);
  - **round di sicurezza del reviewer obbligatorio**.
- **Dipendenze e configurazione**: nessuna dipendenza, variabile, servizio o modifica a `next.config.ts`.
- **FEAT-2026-002**:
  - la Guida esce dalla barra (Decisione 1);
  - cambiano `guida.nav.spec`, `guida.spec`, `altro.spec`, `interactive.test.tsx` e le pagine funzionali sul menu.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Dati personali in `audit_log`, nei log o nei messaggi d'errore | M | H | Esclusione nel trigger + pgTAP; messaggi fissi; test con spia su `console` (T4); round di sicurezza |
| La preview non si può provare: lo staging riceve la migrazione solo dopo il merge | H | M | **Decisione dello sviluppatore** (D-A) |
| Codice nuovo sullo schema vecchio per 1-2 minuti al merge | H | L | ErrorState con Riprova; impostazioni ed export completo trattano "tabella assente" come vuoto; controllo post-deploy dopo il job verde |
| Lista lenta con 1000+ invitati su telefoni modesti | M | M | 100 righe per elenco, filtri memoizzati, e2e 500 < 1 s; virtualizzazione solo con approvazione |
| Cancellazione definitiva irreversibile per errore | L | H | Solo da "Eliminati di recente", conferma con numero e conseguenze sui membri, RLS solo su righe già eliminate |
| Rilevamento della codifica sbagliato | L | M | Decodifica `fatal` + ripiego; byte Windows-1252 costruiti nel test, con la verifica che non siano UTF-8 valido |
| Annulla importazione dopo modifiche alle righe importate | L | L | Cancella solo per `import_batch_id`, entro il toast; il testo lo dice |
| Test flaky esistente `percorso.spec.ts:334` dopo le modifiche a Percorso | M | L | Rieseguito da solo e registrato come preesistente (QA-9); correzione fuori ambito salvo ok dello sviluppatore |
| Postgres remoto < 15 (`set null (col)`) | L | M | T1 verifica la versione remota; altrimenti trigger `before delete` |

## Steps
| Step | Tasks | What the developer can see or check at the end |
|---|---|---|
| S1 | T1-T8 | In locale: barra con Invitati, Guida in Opzioni, "Aiuto"; aggiungere, famiglia, filtri, conteggi, azioni di massa con Annulla, eliminare/ripristinare/cancellare definitivamente (persone e gruppi); conflitto; 1200 invitati; fascia calcolata; pgTAP e oracoli verdi |
| S2 | T9-T10 | Scheda Tavoli sempre presente (vuoto con "Crea tavolo"); assegnare persone o un gruppo intero, "Oltre la capienza", neonati senza posto; tavoli in "Eliminati di recente"; campo, filtro e conteggi dei tavoli solo con tavoli |
| S3 | T11-T17 | Import da testo e CSV (anche Windows-1252) con anteprima, saltate, Annulla importazione; Esporta CSV e reimport identico; export completo; documentazione; run QA finale |

## Tasks
| # | Task | Owner | Files (owned) | Depends on | AC |
|---|---|---|---|---|---|
| T1 | Migrazione `guests` (tabelle, trigger, audit con esclusioni, permessi + `delete`, RLS/grant, `create_guest_family`, `guests_bulk`, `guests_bulk_undo`); pgTAP con i casi di QA-6; oracoli SQL e TS (`TableSpec.delete: boolean \| "soft_deleted"`, interpretato in `rls-api.test.ts`); seed finto + guardia Vitest (email `@example.test`, telefoni finti); tipi; verifica PG remoto | developer A | `supabase/migrations/20261202100000_guests.sql`, `supabase/tests/guests_{rls,model}.test.sql`, `supabase/tests/{core_schema,qa_catalog_matrix}.test.sql`, `tests/acceptance/support/matrix.ts`, `tests/acceptance/rls-api.test.ts`, `supabase/seeds/04_guests.sql`, `tests/unit/guests-seed.test.ts`, `src/lib/supabase/database.types.ts` | — | AC2, AC4, AC5, AC7, AC10, AC11, AC13, BR5, BR8, BR10 |
| T2 | Dominio puro: tipi, validazioni (nome, telefono, email), conteggi per categoria e lato, filtri e ricerca, duplicati, `bandOf` | developer B | `src/domain/guests/{types,validation,counts,filters,duplicates,band,index}.ts` + test | — | AC2, AC8, AC9, BR1, BR4, BR6 |
| T3 | Nav e aiuto: `NAV_ITEMS` e icone, layout con permesso, Opzioni attiva su `/guida`, `HelpLink` + mappa (test: ogni route punta a un file di `docs/functional`), "Aiuto" nelle intestazioni, carta Guida, icona Profili; aggiornare i test esistenti | developer C | `src/components/{AppNav,HelpLink,HelpLink.test,interactive.test}.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/altro/**/page.tsx`, `src/app/(app)/scelte/page.tsx`, `src/features/home/HomeScreen.tsx`, `src/features/timeline/PercorsoHeader.tsx`, `src/features/budget/BudgetOverview.tsx`, `e2e/guida.nav.spec.ts`, `e2e/guida.spec.ts`, `e2e/altro.spec.ts` | T1, T7 (`invitati.md`) | AC23 |
| T4 | Dati e server action: lettura paginata (tabella assente = codice `not_migrated`); CRUD invitati e gruppi con versioned update; azioni di massa e Annulla via RPC; elimina/ripristina/definitivo/svuota per **persone, gruppi e tavoli**; famiglia. Integrazione con spia su `console`: nessun valore personale in log o risultati | developer A | `src/features/guests/{data,actions,schemas,field-labels,server}.ts`, `tests/integration/guests.{data,actions}.test.ts` | T1, T2 | AC2-AC7, AC10-AC12 |
| T5 | UI Persone: `/invitati` (+ `loading`), riepilogo e "Per lato", lista per gruppi con "Mostra altre 100", sheet invitato (Salva e aggiungi un altro, avviso duplicato), Nuova famiglia, filtri e chip, selezione multipla con Annulla, Eliminati di recente in tre sezioni (conferme con numero e conseguenze sui membri), pannello "su invito", ErrorState, "Aiuto"; menu Altro con Seleziona ed Eliminati di recente; test dei componenti (anche Annulla visibile a 7,9 s con timer finti) | developer B | `src/app/(app)/invitati/**`, `src/features/guests/{GuestsScreen,Summary,GuestList,GroupHeader,GuestRow,GuestSheet,FamilySheet,FiltersSheet,SelectionBar,RecentlyDeleted,ShowMore}.tsx`, `src/features/guests/components.test.tsx` | T2, T3, T4 | AC1-AC10, AC23 |
| T6 | Fascia calcolata in Impostazioni (tabella assente = lista vuota, con test) e link di Percorso verso Invitati | developer C | `src/features/settings/{data,model,SettingsForm}.ts(x)` + test, `src/features/timeline/{links.ts,TaskSheet.tsx}` | T2, T3 | BR6, Decisione 9 |
| T7 | Documentazione S1: `invitati.md` (bozza Persone), riga README della Guida, Guida in `opzioni.md` e `panoramica.md`, fascia in `opzioni.md`/`onboarding.md`, link in `percorso.md` | technical-writer | `docs/functional/{invitati,README,opzioni,panoramica,onboarding,percorso}.md` | — | AC23, doc |
| T8 | QA S1, specifiche divise per progetto (QA-9): Persone e azioni di massa in `.mobile`; conflitto e scala in `.desktop` (1200 invitati contati, cercabili ed esportati dall'export completo; 500 < 1 s misurato nella pagina, mediana di 3); nav (6 voci a 320, Guida da Opzioni, "Aiuto" di ogni sezione, `family` senza voce e con pannello); axe con `support/axe.ts`; helper `seedGuests` e `addFamilyMember`; accettazione API (audit e "Novità" senza dati personali) | qa-engineer | `e2e/invitati.mobile.spec.ts`, `e2e/invitati.desktop.spec.ts`, `e2e/invitati.nav.spec.ts`, `e2e/support/seed.ts`, `tests/acceptance/guests.test.ts` | T3, T5 | AC1-AC13, AC23 |
| T9 | Tavoli: dominio dell'occupazione; creazione e modifica dei tavoli con versioned update (conflitto in integrazione); schede Persone/Tavoli con Tavoli sempre visibile; carta, sheet "Aggiungi persone/gruppo intero" con conferma (via `guests_bulk`); campo, filtro, colonna, "Assegna a tavolo" e riepilogo "oltre capienza" condizionali | developer B | `src/domain/guests/seating.ts` (+test), `src/features/guests/{tables-actions,TablesTab,TableCard,TableSheet}.ts(x)`, `tests/integration/guests.tables.test.ts`, e in sequenza dopo T5: `GuestsScreen`, `GuestList`, `GuestRow`, `GuestSheet`, `FiltersSheet`, `SelectionBar`, `Summary` | T4, T5 | AC6, AC10 (tavoli), AC14-AC16 |
| T10 | QA S2: capienza, neonati, gruppo già seduto, eliminazione e ripristino del tavolo (membri "Senza tavolo" e di ritorno), nessun tavolo = solo scheda vuota; axe nella stessa specifica; helper di seed dei tavoli | qa-engineer | `e2e/invitati.tavoli.mobile.spec.ts`, `e2e/support/seed.ts` (dopo T8) | T9 | AC10, AC14-AC16 |
| T11 | Dominio CSV: import (BOM, codifiche, separatore, intestazione, lato, errori e avvisi per riga, inverso della neutralizzazione con tab/CR, guardia 900 KB) ed export (tutti i vivi, lettera se il nome è ambiguo); andata e ritorno (`+39`, "Niccolò" con byte 1252 costruiti nel test, 500/501, caso peggiore di dimensione) | developer A | `src/domain/guests/{csv-import,csv-export}.ts` + test | T2 | AC17-AC19, AC21 |
| T12 | Migrazione import: `import_guests`, `undo_guest_import` (500 righe, dimensione, permesso; lotto di un altro matrimonio = nulla; `family` = 42501); pgTAP; oracoli SQL e TS | developer A | `supabase/migrations/20261202200000_guests_import.sql`, `supabase/tests/guests_import.test.sql`, `supabase/tests/{core_schema,qa_catalog_matrix}.test.sql`, `tests/acceptance/support/matrix.ts`, `src/lib/supabase/database.types.ts` | T1, T11 | AC19, AC20 |
| T13 | UI e action import: sheet a passi, anteprima a carte (100 alla volta, avvisi duplicati, gruppi nuovi), Torna indietro, "Copia le righe saltate", "Scarica un modello", toast "Annulla importazione"; "Importa" ed "Esporta CSV" nel menu Altro e "Importa" nello stato vuoto | developer B | `src/features/guests/{ImportSheet,ImportPreview,import-actions,ExportButton}.ts(x)` + test, `GuestsScreen.tsx` (dopo T9) | T9, T11, T12 | AC1, AC17-AC21 |
| T14 | Export completo: invitati, gruppi e tavoli nel JSON (eliminati marcati) e CSV degli invitati vivi; quarto pulsante con testo esplicito | developer C | `src/features/export/{data,ExportPanel}.ts(x)` + test, `src/domain/export/{build,types}.ts`, `src/domain/export/export.test.ts`, `tests/integration/export.data.test.ts` | T1, T11 | AC21, AC22 |
| T15 | QA S3: import (testo, CSV 1252, errori, Torna indietro, annulla senza salvare, Annulla importazione) ed export (andata e ritorno, export completo, testo "tutti") | qa-engineer | `e2e/invitati.import.mobile.spec.ts`, `e2e/export.spec.ts` | T13, T14 | AC17-AC22 |
| T16 | Documentazione finale: `invitati.md` (tavoli, import/export), `esportazione.md`; tecnica `modello-dati.md`, `sicurezza.md`, `architettura.md`, `ambienti-e-rilascio.md` (controlli post-deploy), `sviluppo-locale-e-test.md`; ADR-0002 → accepted | technical-writer | `docs/functional/{invitati,esportazione}.md`, `docs/technical/*.md`, `docs/adr/0002-dati-personali-invitati.md` | T13, T14 | doc |
| T17 | Run QA finale una volta (`E2E_PORT=3300`, WebKit solo con `e2e:install`): tutti i progetti; un passaggio dei temi su `/invitati` seminato con stati colorati visibili (oltre capienza, errori di import, chip, selezione), 12 temi × chiaro/scuro; poi solo i test falliti | qa-engineer | `e2e/themes.spec.ts`, `reviews/qa-1.md` | T15, T16 | tutti |

**Parallelismo**:
- S1: T1, T2 e T7 subito; T3 dopo T1 e T7; T4 (A) dopo T1 e T2; T5 (B) dopo T3 e T4; T6 (C); T8 per ultimo.
- S2: T9 da solo, poi T10.
- S3: T11 (A) e T14 (C) in parallelo, poi T12 (A), T13 (B), infine T15-T17.
- I file condivisi passano tra i task in sequenza: oracoli e tipi da T1 a T12, `e2e/support/seed.ts` da T8 a T10, i file UI di Persone da T5 a T9 a T13.

## Test plan
| Level | What | Cases (incl. edge cases) | AC covered | Owner |
|---|---|---|---|---|
| DB (pgTAP) | RLS, grant, audit, trigger, RPC | Dinieghi: anon, altro matrimonio e `family` su select/insert/update/delete. DELETE: rifiutato su riga viva (persona, gruppo, tavolo). Audit: nessuna chiave personale dopo insert/update/delete/svuota. Limiti dei CHECK (nome vuoto/80/81, note 500/501, telefono 5/6/20/21 e caratteri vietati, enum, capacità 0/1/50/51/null). Lato salvato come A/B/both/null. Integrità: FK cross-wedding, `set null` dopo il definitivo, famiglia atomica con una riga errata. Massa: `guests_bulk` e undo (id di altri matrimoni ignorati, eliminati saltati). Nessuna scadenza (riga eliminata 400 giorni fa sopravvive al job). Import: 500 sì/501 no, gruppo esistente riusato, undo con lotto altrui = nulla. Allowlist e oracolo | AC4, AC5, AC7, AC10, AC11, AC13, AC19, AC20 | developer (T1, T12) |
| Unit (Vitest) | Dominio puro e componenti | Conteggi con neonati e "Senza lato"; filtri combinati e "12 di 42"; duplicati con accenti; `bandOf` ai confini; telefono; occupazione e oltre capienza; tutti i tavoli eliminati = campi nascosti. Parser: BOM, `;`/`,`, virgolette, intestazione ambigua, una colonna, righe vuote, 1252, `'+39`, tab/CR, lato ambiguo. Andata e ritorno; guardia 900 KB. Componenti: Annulla a 7,9 s (timer finti), "Salva e aggiungi un altro", "Mostra altre 100", ErrorState, mappa di `HelpLink`, guardia del seed | AC2-AC9, AC14-AC18, AC21, AC23 | developer |
| Integration | Action e letture sullo stack locale | 1200 righe lette tutte; export completo con 1200 righe, senza i cancellati; conflitto invitato/gruppo/tavolo; massa e Annulla (valori ripristinati); svuota; errori senza valori personali (spia su `console`) | AC6, AC7, AC11, AC12, AC13, AC22 | developer |
| Acceptance (API) | PostgREST con JWT reali | Oracolo TS esteso (dinieghi gratis per anon, altro matrimonio e `family`; `DELETE` solo su eliminati); audit e "Novità" senza dati personali | AC13 | developer (T1) / qa-engineer (T8) |
| E2E (Playwright) | Percorsi critici, un progetto per flusso (`.mobile`/`.desktop`), seed via `seedGuests`, mai via UI | Stato vuoto; aggiunta e famiglia; Annulla cliccato subito; eliminati → ripristino → definitivo; massa + Annulla; conflitto (2 contesti); 1200 e 500 < 1 s (desktop); tavoli; import/export; nav e "Aiuto"; `family` | AC1-AC23 | qa-engineer |
| A11y | axe | Dentro le specifiche (`support/axe.ts`); 12 temi una sola volta in T17. La matrice nav resta solo in `guida.nav.spec` | NFR | qa-engineer |

Lo stato "schema non migrato" si prova con test dei componenti e d'integrazione, non in e2e: Playwright non può intercettare le letture lato server (DES-22).

## Documentation plan
| Type | Destination | What changes |
|---|---|---|
| Functional | `docs/functional/invitati.md` (nuova), `README.md`, `opzioni.md`, `panoramica.md`, `esportazione.md`, `onboarding.md`, `percorso.md` | Nuova sezione; Guida dentro Opzioni e "Aiuto"; fascia calcolata; export invitati; link dal Percorso |
| Technical | `docs/technical/modello-dati.md`, `sicurezza.md`, `architettura.md`, `ambienti-e-rilascio.md`, `sviluppo-locale-e-test.md` | Tabelle e area `guests`; dati personali, `DELETE` e audit; modulo guests e RPC di massa; controlli post-deploy; seed e test di scala |
| ADR | `docs/adr/0002-dati-personali-invitati.md` | Bozza (proposed): primo dato di terzi, primo `DELETE` fisico, precedente per R-04/R-06; accepted al Gate B |

## Release plan
- **Percorso**: PR → preview (staging) → Gate C → merge su `main` = **deploy di produzione** (merge_deploys_production: true).
- **Migrazioni**:
  - `20261202100000_guests.sql`, poi `20261202200000_guests_import.sql`, applicate da `migrate.yml` al merge;
  - sono additive e il codice precedente le ignora;
  - per 1-2 minuti il codice nuovo può girare sullo schema vecchio (vedi Risks).
- **Staging**: nessuna prova in preview (D-A = c). Gate C sul risultato locale (verify + run QA finale), poi merge e controlli post-deploy in produzione.
- **Feature flag**: nessuno.
- **Rollback**:
  - Instant Rollback di Vercel: torna la barra con Guida e le tabelle restano inutilizzate;
  - nessun rollback dello schema, si corregge in avanti;
  - i dati restano nel DB.
- **Controlli post-deploy (produzione)**:
  - job `migrate` verde;
  - `/invitati` mostra lo stato vuoto;
  - aggiunta e cancellazione definitiva di un invitato finto;
  - export completo con `guests`;
  - barra a 320 px con 6 voci, Guida da Opzioni;
  - nel pannello Supabase, l'ultima riga `audit_log` di `guests` senza nome.

## Decisions
| # | Decision | By | Date |
|---|---|---|---|
| P1 | Azione `delete` nuova (si allarga il `check`) invece di mappare su `write` | architect | 2026-11-25 |
| P2 | Gruppi e tavoli eliminati mantengono il puntatore; "senza gruppo/tavolo" è calcolato | architect | 2026-11-25 |
| P3 | Parsing CSV nel browser, rivalidazione nella server action, inserimento atomico con RPC; payload ≤ 900 KB senza alzare il limite globale | architect | 2026-11-25 |
| P4 | "Annulla importazione" = cancellazione fisica del lotto | architect | 2026-11-25 |
| P5 | `/guida` attiva Opzioni nella barra; `/invitati` senza permesso mostra il pannello in pagina | architect | 2026-11-25 |
| P6 | Azioni di massa e loro Annulla via `guests_bulk`/`guests_bulk_undo` (`SECURITY INVOKER`, valori precedenti restituiti dal DB) | architect | 2026-11-25 |
| P7 | Icone: Invitati `UsersRound`, Profili `UserCog` | architect | 2026-11-25 |
| D-A | Come provare la preview prima del Gate C. **(a) consigliata**: lo sviluppatore applica le migrazioni allo staging da locale (`supabase link` allo staging + `db push`, solo dati finti). (b) Avvio di `migrate.yml` per lo staging anche dal branch: va cambiata la regola di branch dell'environment, meno sicuro. (c) Gate C solo in locale e verifica in produzione dopo il merge. **Scelta: (c)** — "vai direttamente in produzione, siamo ancora in sviluppo" | sviluppatore | 2026-11-25 |

## Change log
| Date | Change | Why | Approved by |
|---|---|---|---|
| 2026-11-25 | F2 round 1: RPC di massa con Annulla (QA-1, DES-20); oracolo TS e `DELETE` solo su eliminati (QA-2); proprietà di test e file riallineate (QA-3/4/8, DES-17/18/21); "Mostra altre 100" (DES-19); errori senza valori (QA-5); casi pgTAP e parser (QA-6/7); e2e snelli (QA-9/10/11); scheda Tavoli sempre visibile (PO-2); dettagli export (PO-3); `sort_order` tolto (PO-6); icone (DES-23) | Obiezioni F2 di QA, designer e PO | — |
| 2026-11-25 | F3 S1: `supabase/tests/qa_cross_wedding.test.sql` passa a T1 (e poi a T12), il suo oracolo copre ogni tabella di `public`; `src/domain/guests/normalize.ts` aggiunto a T2; PG remoto verificato 17.12 (prod e stage); T3 aggiunge `src/components/guests-nav.ts` (+test); T5 aggiunge `src/features/guests/{view,use-guest-actions}.ts`, `GroupPicker.tsx`, `RenameGroupSheet.tsx`, `src/app/(app)/invitati/{error,LoadError}.tsx` (passano a T9/T13 come gli altri file UI); T9 aggiunge `src/features/guests/{tables-data.ts,TableAddPeople.tsx}`; QA-4 (contrasto del toast condiviso, tutti i temi) assegnato a developer C come task extra di S2; limiti per azione 5.000 selezionati e 100 per famiglia (REV-7, REV-18); P5: il ruolo `family` viene già reindirizzato dal proxy esistente a `/su-invito`, quindi il pannello in pagina vale solo per chi arriva a `/invitati` senza permesso (QA-1, accettato: il brief chiede la schermata "su invito" esistente) | Proprietà dei file mancanti nel piano | coordinatore (nessun cambio di soluzione) |
| 2026-11-25 | F3 S3: T11 modifica anche `src/domain/export/csv.ts` (guardia delle formule esatta all'andata e ritorno, REV-39); T14 aggiunge `src/features/export/data.test.ts`; `tests/acceptance/rls-api.test.ts` adattato da A al nuovo `ExportInput`; T13 aggiunge `disabled`/`description` a `MenuAction` e la prop `importNames` alla pagina `/invitati`; `undo_guest_import` cancella fisicamente il lotto (P4), con eccezione nel test "nessuna funzione purga gli invitati" | Proprietà dei file e dettagli emersi in revisione | coordinatore (nessun cambio di soluzione) |

## Outcome
Chiusa il 2026-11-26: Gate C approvato dallo sviluppatore, PR #5 mergiata (squash `fd4680e`, 14:19 UTC) e in produzione lo stesso giorno.
- **Consegnato**: tutti e tre gli step (23 AC). Persone (anagrafica, famiglie/gruppi, filtri, azioni di massa con Annulla, eliminati di recente, 1200+ invitati senza tetto), Tavoli facoltativi (capienza, neonati senza posto), import CSV/testo con Annulla importazione ed export CSV e JSON, navigazione con Invitati e Guida in Opzioni, fascia calcolata, link dal Percorso. Colonne desktop (DES-03) costruite su richiesta dello sviluppatore.
- **Dati**: 2 migrazioni additive (`20261202100000_guests.sql`, `20261202200000_guests_import.sql`), 5 RPC, ADR-0002 accepted.
- **Decisioni di F3**: azioni per-richiesta limitate (massa 5.000, famiglia 100), non un tetto agli invitati; REV-47 esito d'importazione ignoto = messaggio, nessun nuovo tentativo; REV-53 `undo_guest_import` toglie solo persone intatte del lotto; DES-02 toast sopra la barra mobile; D-A = (c) nessuna prova su staging.
- **Verifica**: `adf verify` pass sull'ultimo contenuto; e2e invitati 27/27; revisioni codice e design chiuse.
- **Aperti**:
  - smoke WebKit non eseguito in locale (WebKit non installato): resta alla CI;
  - `partner.spec.ts:415` fallisce in locale perché la Supabase CLI locale invia il modello di recupero predefinito; non viene da questo branch;
  - follow-up R-06 (Sala: disposizione visuale dei tavoli, usa `shape`/`pos_x`/`pos_y` già presenti);
  - controlli post-deploy in produzione: non registrati nella cartella della feature (da verificare a mano in /invitati).
