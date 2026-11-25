# FEAT-2026-002 — Guida d'uso nell'app: piano di implementazione

<!-- Owner: architect. Approvato al Gate B. -->

| Brief | Design | Size | Status |
|---|---|---|---|
| brief.md (Gate A via R-02, 2026-11-25) | design.md (F2 finale) | S | draft |

Gate B approvato il 2026-11-25: **Q7** = "Opzioni" (icona `Settings`, "Impostazioni nozze" resta); **Q8** = URL `/altro` invariato; dipendenze `react-markdown@10.1.0` e `remark-gfm@4.0.1` approvate; T11 = lo sviluppatore entra da sé sull'anteprima nel browser integrato, poi QA controlla.

## Current state
- **Menu**: 5 voci in `NAV_ITEMS` (`src/components/AppNav.tsx:15-21`), `flex-1` (`:43`), `text-xs`; `isActivePath` per prefisso (`:23-26`). Font del corpo per tema (`src/app/themes.css:5,51,97`).
- **"Altro"**: `src/app/(app)/altro/page.tsx` (titolo `:17`, H1 `:79`, voci `:24-73`); "Torna ad Altro" e "Altro > …" in pagine, onboarding, login, email (elenco in `design.md` → "Rinomina di Altro").
- **URL `/altro`**: ~25 riferimenti in `src` (guard del cambio codice `src/features/auth/guards.ts:59`, `post-login.ts:17`, URL nelle email già inviate `src/features/jobs/run-daily-job.ts:275`, 6 `revalidatePath`) e ~60 in `e2e/`, `tests/`.
- **Dinamico**: layout legge il tema per richiesta (`src/app/layout.tsx:29-30`), proxy `no-store` (`src/proxy.ts:44`), default-deny senza sessione (`guards.ts:112-116`). Nessun `outputFileTracingIncludes` (`next.config.ts:54-60`), nessuna libreria Markdown (`package.json:10-30`).
- **Docs**: 12 pagine + `docs/functional/README.md` (tabella `:5-18`); rimandi tecnici in `README.md:3`, `accesso-e-codici.md:46`, `promemoria-email.md:43-45` (già coperto da `docs/technical/ambienti-e-rilascio.md:233-235`). Pattern 404: `src/app/(app)/scelte/[key]/not-found.tsx`.

## Solution
1. **Lettura** (`src/features/guide/source.ts`, `server-only`): `loadGuide()` legge `docs/functional` da `process.cwd()` (memo di modulo solo in produzione); funzioni pure `listSlugs(fileNames)` (`^[a-z0-9-]+\.md$`, escluso `README`) e `checkIndex(readme, slugs): string[]` (problemi: file non in tabella, riga che cita un file assente, etichetta/descrizione vuota). Una pagina si apre solo se lo slug è nell'elenco (R3). Cartella mancante = errore (`error.tsx`), mai elenco vuoto.
2. **Logica pura** (`src/features/guide/markdown.ts`): `stripChangelog(md)` (da `## Storico delle modifiche` al prossimo `## ` o alla fine), `extractTitle(md)`, `parseIndexTable(readme)` → `{slug,label,description}[]` in ordine, `resolveGuideHref(href, slugs)` → `internal` (`x.md` noto → `/guida/x`, `README.md` → `/guida`) | `external` (`http(s):`, `mailto:`) | `text` (tutto il resto: `#ancora`, `../`, `.md` sconosciuto) (R4). È l'unica regola sui link, usata anche dai test (niente regex separate).
3. **Renderer** (`GuideMarkdown.tsx`, Server Component, `server-only`): `react-markdown` + `remark-gfm`, `skipHtml`, niente `rehype-raw`. `components`: `h1` `id="guida-titolo"` `tabIndex={-1}`; `a` interno → `next/link`, esterno → `target=_blank rel="noopener noreferrer"` + icona `ExternalLink` `aria-hidden` + "(si apre in una nuova scheda)" nascosto, `text` → `<span data-guide-unresolved>`; link sempre `underline underline-offset-2` colore `--primary`; `table` in regione scorrevole (`role="region"`, `tabIndex=0`, `aria-label`), `th` con `scope="col"`; `code` `overflow-wrap:anywhere`, `pre` scorrevole focalizzabile. Solo token del tema (niente plugin typography né `globals.css`). 0 KB di Markdown nel client.
4. **Route** `src/app/(app)/guida/`: `page.tsx` (H1 "Guida", frase del design, schede da `parseIndexTable`), `loading.tsx`, `error.tsx`; `[...pagina]/page.tsx` (più di un segmento o slug fuori elenco → `notFound()`, anche `/guida/a/b`) e `[...pagina]/not-found.tsx` ("Pagina non trovata" + "Torna alla Guida"). `generateMetadata` → `"{Titolo} · Guida"` (il template root aggiunge "· roadmap2yes"); `params` è `Promise` (Next 16). "← Guida" in cima; `FocusHeading.tsx` (client) focalizza l'H1 dopo una navigazione interna, non al primo caricamento. Stato HTTP 404 non garantito (lo stream di `loading.tsx` può essere partito): conta il contenuto. Stati vuoti del design: fuori piano (DES-18, irraggiungibili per i test sui file veri).
5. **Bundle Vercel**: `outputFileTracingIncludes: { "/guida": ["./docs/functional/**/*.md"], "/guida/*": [stesso] }` (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md:93-137`).
6. **Menu**: 6ª voce `{ href: "/guida", label: "Guida", icon: BookOpen }` e `px-0.5` sotto `md` (S1); poi etichetta e icona della sezione da Q7, stesso `href: "/altro"` (S2). L'etichetta vive in una costante (`src/components/section-label.ts`) letta da `AppNav`, `altro/page.tsx` e dai test unit ed e2e.
7. **Rinomina** (AC7): titolo/H1, "Torna a {nome}", ogni "Altro > X" visibile → "{nome} > X", email di promemoria e pagina di disattivazione comprese (link invariati). Non toccare "Altro" come valore (`PersonForm.tsx:39`, `budget/model.ts:44`, `content/style-tips.ts:60`).
8. **URL (proposta, Q8)**: `/altro` resta (vedi Current state: ~85 riferimenti, guard, email già spedite); l'utente vede l'etichetta, non l'URL. Se servirà: chore XS con `redirects()` permanenti.
9. **Sorgenti** in F3 (i test leggono i file veri): S1 toglie i 3 rimandi tecnici e scrive in `README.md` le 3 convenzioni (ogni file in tabella; link solo dentro la cartella; "Storico delle modifiche" nascosto in app); S2 rinomina `altro.md` → `{slug del nome}.md`.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Spostare `/altro` + redirect 308 | URL coerente | ~85 modifiche, guard, churn e2e | beneficio estetico (Q8) |
| Prebuild → modulo TS | niente tracing | codegen in dev/build | tracing + Preview bastano |
| `marked` | 0 dipendenze | `dangerouslySetInnerHTML` + sanitizer | superficie XSS |
| Parser a mano | 0 dipendenze | ogni costrutto GFM è lavoro (AC4) | fragile |

## Impacts
- **Dati/migrazioni**: nessuno. **Contratti**: nuove route `/guida`, `/guida/[...pagina]`; URL esistenti invariati.
- **Performance**: ~13 file letti una volta per istanza; JS client solo `FocusHeading`.
- **Sicurezza**: nessun cambio ad auth (`PUBLIC_PREFIXES` invariato); allowlist degli slug; HTML grezzo scartato; esterni `noopener noreferrer`.
- **Testi visibili fuori dalla Guida** (PO-3, da dire al Gate B): email di promemoria, pagina di disattivazione, onboarding e login cambiano dicitura, non link.
- **Dipendenze (da approvare)**: `react-markdown@10.1.0`, `remark-gfm@4.0.1`, esatte, solo server (~60 transitive; peer `react >=18`).
- **Configurazione**: `outputFileTracingIncludes`. Nessuna variabile d'ambiente.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `docs/functional` assente nella funzione Vercel (in locale c'è sempre) | media | alto | tracing su entrambe le route; cartella mancante = errore visibile; controllo Preview e post-deploy |
| 6 etichette a 320/768 px con font diversi per tema | media | medio | nome corto (Q7) + `px-0.5`; e2e 12 temi × 320/768/1024 |
| "Altro > …" residuo | media | basso | review: `grep "Altro >\|Altro &gt;\|Torna ad Altro"` vuoto in `src` e `docs/functional` |
| Futuro file con link fuori cartella o "Storico" rinominato | media | basso | test sui file veri falliscono in CI; convenzioni nel README |
| Markdown nel bundle client | bassa | medio | importato solo da `GuideMarkdown.tsx` (`server-only`) |

## Steps
| Step | Tasks | What the developer can see or check at the end |
|---|---|---|
| S1 | T1–T6 | In locale: 6ª voce "Guida" (etichette intere a 320 px); indice, pagina con tabella, link interni, 404; niente rimandi tecnici né "Storico". `npm test` verde |
| S2 (dopo Q7) | T7, T8 | La sezione ha il nome scelto in menu, pagine, onboarding, email e docs |
| S3 | T9–T11 | e2e verdi; Preview: Guida visibile su Vercel |

## Tasks
| # | Task | Owner | Files (owned) | Depends on | AC |
|---|---|---|---|---|---|
| T1 | Dipendenze fissate | developer A | `package.json`, `package-lock.json` | — | AC2 |
| T2 | Logica pura + test | developer A | `src/features/guide/markdown.ts`, `markdown.test.ts` | — | AC1, AC3, R4 |
| T3 | Lettura + `checkIndex` + test (file veri e fixture) | developer A | `src/features/guide/source.ts`, `source.test.ts` | T2 | AC4, R2, R3 |
| T4 | Renderer, indice, focus; test di render e sui file veri; coppie di contrasto | developer A | `src/features/guide/{GuideMarkdown,GuideIndex,FocusHeading}.tsx`, `GuideMarkdown.test.tsx`, `guide-docs.test.tsx`, `src/themes/contrast.test.ts` | T1, T2 | AC2, AC3, AC6 |
| T5 | Route Guida + tracing | developer A | `src/app/(app)/guida/**`, `next.config.ts` | T3, T4 | AC1, AC5, AC6 |
| T6 | Voce "Guida" + `px-0.5`; pulizia dei 3 rimandi; convenzioni README | developer B | `src/components/AppNav.tsx`, `src/components/interactive.test.tsx`, `docs/functional/{README,accesso-e-codici,promemoria-email}.md` | — | AC1, AC3, AC7 |
| T7 | Costante del nome; rinomina in UI ed email | developer A | `src/components/section-label.ts`, `AppNav.tsx`, `interactive.test.tsx`, `src/app/(app)/altro/{page,impostazioni/page,profili/page,invito/page}.tsx`, `src/features/onboarding/{steps,Summary}.tsx`, `src/features/auth/LoginForm.tsx`, `src/app/(public)/email/disattiva/html.ts`, `src/lib/email/templates/{reminders,templates.test}.ts` | S1, Q7 | AC7 |
| T8 | Docs: `altro.md` → `{slug}.md`, link `altro.md` in tutti i file e riga README (nome e descrizione), "Altro > X", Guida in `panoramica.md` | developer B | `docs/functional/**` | S1, Q7 | AC7, R6 |
| T9 | e2e Guida | qa-engineer | `e2e/guida.spec.ts`, `e2e/{login,cache,a11y,themes}.spec.ts` | S1 | AC1–AC6 |
| T10 | e2e menu e sezione | qa-engineer | `e2e/guida.nav.spec.ts`, `e2e/altro.spec.ts` | S2 | AC1, AC7 |
| T11 | Controllo Preview (Release plan) | qa-engineer + developer | — | T9, T10, PR | NFR |

In parallelo: S1 → A (T1→T5) e B (T6); S2 → A (T7) e B (T8); T9 può partire dopo S1. `AppNav.tsx` passa da T6 a T7 in step diversi.

## Test plan
| Level | What | Cases (incl. edge cases) | AC covered | Owner |
|---|---|---|---|---|
| Unit | `markdown.ts` | Storico in mezzo/in fondo/assente; titolo con grassetto; tabella README (ordine, riga malformata); href `x.md`, `README.md`, `x.md#a`, `../technical/…`, `#a`, `javascript:`, `https:`, `mailto:` | AC1, AC3, R4 | developer |
| Unit | `source.ts` | file veri: `checkIndex` vuoto (ogni `*.md` in tabella e viceversa, etichette non vuote); fixture: `.md` non in tabella e riga su file assente → problema; slug `../package`, `README`, `Budget`, `budget.md` rifiutati | AC4, R2, R3 | developer |
| Unit | `GuideMarkdown` | regione tabella `tabIndex=0` con nome; `th scope="col"`; HTML grezzo non reso; link interno/esterno (icona, `rel`)/testo; classe di sottolineatura; H1 con `id` | AC2, AC3, AC6 | developer |
| Unit | `guide-docs.test.tsx` (stesso parser) | per ogni file vero, dopo `stripChangelog`: 0 `[data-guide-unresolved]`, nessun "docs/technical" nel testo, un solo H1 non vuoto, nessun salto di livello; fixture che falliscono: `../technical/x.md`, testo "docs/technical", H1→H3; `https://` ammesso | AC3, AC6 | developer |
| Unit | contrasto | coppie usate dal renderer (`--primary`/sfondo, `--foreground`/`--muted`, `--muted-foreground`/sfondo) verificate in `contrast.test.ts` nei 12 temi | AC2 | developer |
| Unit | `AppNav` | 6 voci, "Guida" ultima e attiva su `/guida/budget`; sezione (costante) attiva su `/altro/x` | AC1, AC7 | developer |
| E2E | `guida.spec.ts` | indice in ordine README; link interno: URL in `/guida`, `toBeFocused()` sull'H1 (non al primo caricamento), `goBack()`; nessun "Storico"; 320 px su `budget` e `temi-e-aspetto`: `scrollWidth ≤ 320`, Tab fino alla tabella, `ArrowRight` → `scrollLeft > 0`, `textDecorationLine` underline; altezza ≥ 44 px su voce "Guida", scheda, "← Guida", "Torna alla Guida"; titolo documento; H1 + gerarchia su 2 pagine; `/guida/xyz`, `/guida/a/b` (e `..%2Fpackage` se arriva alla route) → "Pagina non trovata" + "Torna alla Guida", "Guida" `aria-current` | AC1–AC6 | qa-engineer |
| E2E | anonimo | `/guida`, `/guida/budget`, `/guida/xyz` nella lista di `login.spec.ts` → `/accesso`; `request.get(…, {maxRedirects:0})` → 3xx, corpo senza testi della Guida; `/guida` in `cache.spec.ts` | AC5 | qa-engineer |
| E2E / a11y | axe su `/guida`, `/guida/budget`, `/guida/temi-e-aspetto` (`a11y.spec.ts`); `/guida/budget` in `SCREENS` di `themes.spec.ts` (ciclo 12 × chiaro/scuro esistente) | AC2, AC6 | qa-engineer |
| E2E | `guida.nav.spec.ts` | 12 temi × 320/768/1024 px, solo chiaro, un seed e un login; dopo `document.fonts.ready` larghezza del testo (`Range`) ≤ quella del `li`; una prova locale con "Impostazioni" deve fallire; `altro.spec`: H1 e voce nav = costante, `aria-current`, nessuna voce "Altro" | AC1, AC7 | qa-engineer |

Unit a fine step; e2e mirati, poi suite completa una volta. Niente matrice browser né `E2E_AXE_MATRIX`.

## Documentation plan
| Type | Destination | What changes |
|---|---|---|
| Functional (F3, T6+T8) | `docs/functional/` | pulizia, convenzioni, file rinominato, Guida in panoramica; righe "Storico" in F4 |
| Technical (F4) | `docs/technical/{architettura,sicurezza,sviluppo-locale-e-test,ambienti-e-rilascio}.md` | route, lettura + tracing, renderer e allowlist, test sui docs che bloccano la CI; "Altro > …" → nome nuovo (`ambienti-e-rilascio.md:90,201,266,284`, `sicurezza.md:207`) |
| Root | `README.md:26` | nome della sezione, "Guida" |
| ADR | — | non serve: S, pattern esistenti |

## Release plan
- Path: PR → Preview Vercel (staging, dati finti) → T11 → Gate C → merge → produzione · merge deploys production: **sì**
- Migrazioni: nessuna. Feature flag: nessuno.
- **T11 Preview**: lo sviluppatore accede lui stesso alla Preview (Vercel e app, account di test dello staging) nel browser integrato; gli agenti non digitano mai credenziali. Poi QA controlla: indice con schede, `/guida/budget` con tabella e testo (nessuna pagina d'errore), redirect anonimo in una finestra senza sessione. Alternativa: lo sviluppatore segue la stessa checklist da solo.
- Rollback: revert della PR o promozione del deploy precedente dal pannello Vercel (comando di produzione: serve approvazione).
- Post-deploy: `/guida` e `/guida/budget` in produzione; menu a 6 voci su telefono; `/altro/promemoria` da un link email funziona.

## Decisions
| # | Decision | By | Date |
|---|---|---|---|
| D1 | URL `/altro` invariato | sviluppatore, Gate B (Q8) | 2026-11-25 |
| D2 | `/guida/[...pagina]` catch-all con 404 propria | architect | 2026-11-25 |
| D3 | Pulizia e rinomina docs funzionali in F3 (i test leggono i file veri) | architect | 2026-11-25 |
| D4 | Nome del file della sezione = slug del nome confermato (Q7) | architect | 2026-11-25 |

## Change log
| Date | Change | Why | Approved by |
|---|---|---|---|
| 2026-11-25 | Round 1 F2 (vedi log) | DES-14…19, PO-1…4, QA-1…9 | — |

## Outcome
