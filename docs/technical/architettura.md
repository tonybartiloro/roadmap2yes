# Architettura

Questo documento descrive come è costruita l'app. Le decisioni che la fissano sono in [ADR-0001](../adr/0001-stack-auth-ambienti.md).

## Stack

| Area | Scelta | Note |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript in modalità strict | Server components e server actions. Il proxy è in `src/proxy.ts` |
| UI | Tailwind CSS v4, shadcn/ui (Radix), react-hook-form, zod 4 | Mobile first. Temi come variabili CSS su `[data-theme]` |
| Dati e accesso | Supabase: Postgres, Auth (password), RLS | `@supabase/ssr` per le sessioni nei cookie, `supabase-js` per le chiamate |
| Email | `EmailSender` con tre trasporti: `none`, `smtp` (solo locale e CI), `resend` | Resend è l'unico fornitore in produzione, quando esiste il dominio |
| Hosting | Vercel Hobby, regione `dub1` (Dublino); un solo progetto con ambienti Preview e Production | Il cron giornaliero è in `vercel.json` |
| Database | Supabase free, regione `eu-west-1` (Irlanda); un progetto di produzione e uno di staging | Il progetto di staging contiene solo dati finti |
| Test | Vitest, pgTAP, Playwright, axe | Vedi [Sviluppo locale e test](sviluppo-locale-e-test.md) |

Nessuno storage di file: R1 non carica file. Lo storage, quando servirà (R6), sarà Supabase Storage.

## Dove vive il codice

| Cartella | Contenuto |
|---|---|
| `src/app` | Route: pagine pubbliche `(public)`, onboarding, area `(app)`, route API del cron |
| `src/features` | Logica per funzione: `auth`, `accounts`, `invitations`, `onboarding`, `timeline`, `decisions`, `budget`, `home`, `notifications`, `export`, `jobs`, `guide` |
| `src/domain` | Funzioni pure del dominio (Percorso, budget, promemoria, esportazione), con `today` e `now` come parametri |
| `src/lib` | Infrastruttura: client Supabase (`lib/supabase`), email (`lib/email`), configurazione (`app-config.ts`), orologio (`clock.ts`) |
| `src/content` | Contenuti: catalogo delle tappe, categorie di budget, frasi di stile, codici deboli |
| `supabase/migrations` | Migrazioni SQL, additive |
| `supabase/tests` | Test pgTAP |
| `scripts` | Bootstrap, generazione dei temi, controllo dei font, keep-alive, controllo degli indirizzi di test |

## Come arriva una richiesta

1. **`src/proxy.ts`** verifica la sessione con `getClaims()`, applica le intestazioni di sicurezza, rimanda al login o alla pagina "Questo spazio è su invito", e con errori di rete o con il servizio in pausa riscrive su `/servizio` senza leggere il database. Su `/rsvp/{token}` controlla anche la forma del token, chiama il gate delle conferme di presenza e risponde da sé con la pagina neutra 404 o con il 429 (vedi [Conferme di presenza](#conferme-di-presenza-rsvp)).
2. **Le pagine autenticate sono dinamiche.** Nessun dato utente viene messo in cache: una regola di lint vieta `use cache` nelle aree autenticate.
3. **Le scritture passano da server actions** con validazione zod. La server action chiama l'RPC o la tabella con il **JWT dell'utente**. Lo stato delle transizioni (per esempio scegliere una data) lo cambia una funzione SQL atomica.
4. **La decisione è del database.** Il codice non ricontrolla i permessi: se la RLS o la funzione dicono no, la richiesta fallisce.

## Autorizzazione

- **La Row Level Security e i privilegi di colonna sono l'unico confine di autorizzazione.** Il codice applicativo non decide chi può vedere o scrivere cosa.
- Ogni dato di dominio ha `wedding_id`. Le policy usano `public.has_permission(p_wedding_id, p_area, p_action)`, che incrocia `memberships` con `private.role_permissions`. Oggi il ruolo è solo `partner`; i ruoli futuri (famiglia, wedding planner) si aggiungono con nuove righe di mappatura, senza riscrivere le policy.
- L'API espone solo lo schema `public`. Lo schema `private` non è esposto.
- La **matrice delle scritture** dice cosa il client può scrivere direttamente (vedi [Modello dati](modello-dati.md#matrice-delle-scritture)). Il resto passa da RPC o trigger.
- Le funzioni eseguibili dal ruolo `authenticated` sono una allowlist verificata da un test. Il ruolo `anon` non ha funzioni.

## La chiave segreta

`SUPABASE_SECRET_KEY` bypassa la RLS. Per questo:

- è letta solo in `src/lib/supabase/admin.ts`, marcato `server-only`;
- una regola ESLint permette di importare `admin.ts` solo da cinque ambiti: login e bootstrap (`features/auth/{login,bootstrap}.ts`), operazioni sugli account (`features/accounts/admin-ops.ts`), job (`features/jobs/**`), disattivazione email (`app/(public)/email/**`), pagina pubblica RSVP (`features/rsvp/public-rpc.ts`, solo le tre RPC pubbliche);
- la stessa chiave è anche la chiave HMAC del limitatore di login (vedi [Sicurezza](sicurezza.md#r27--residui-del-limitatore-e-del-bootstrap)).

## Configurazione

`src/lib/app-config.ts` legge le variabili **a runtime**, con accesso `process.env[...]`, mai con un letterale `NEXT_PUBLIC_*` che il bundler inlinerebbe. Così la stessa build può girare con configurazioni diverse (per esempio i server e2e `degraded` ed `email-off`). Gli errori dicono quale variabile manca, mai il valore.

Le variabili e i loro valori per ambiente sono nel [runbook](ambienti-e-rilascio.md#variabili-dambiente).

## Orologio iniettabile

- Le funzioni di dominio ricevono sempre `today` e `now` come parametro. Non chiamano `new Date()` da sole.
- Solo ai bordi (server component, server action, job) si chiama `getNow()` di `src/lib/clock.ts`.
- `getNow()` legge il cookie `r2y-test-now` **solo se** `E2E_CLOCK=1` **e** la variabile `VERCEL` non è definita. Il doppio controllo impedisce che il tempo di test si sposti in produzione.
- "Oggi" per scadenze e conto alla rovescia è calcolato nel fuso di Europe/Rome.
- L'aritmetica delle date è solo di calendario (mesi con adeguamento a fine mese, poi settimane e giorni). TypeScript e SQL usano gli stessi casi di test (`tests/fixtures/date-offset-vectors.json`).

## Email

Tutto passa da `EmailSender`. `emailEnabled()` è l'unico interruttore: è vero solo per `resend` con chiave e mittente, o per `smtp` con un host. Con `EMAIL_TRANSPORT` assente o `none` le email sono spente e si usa `NullSender`. `smtp` è rifiutato in `VERCEL_ENV=production`. Dettagli in [Email e job](email-e-job.md).

## Stati di servizio

Se Supabase è in pausa o non risponde, il proxy e il layout riscrivono su `/servizio`, una pagina che non legge il database. `global-error.tsx` è autosufficiente e non importa dati.

## Modulo invitati (`guests`)

Costruito come budget e Percorso, senza dipendenze nuove. Le regole sui dati personali sono in [ADR-0002](../adr/0002-dati-personali-invitati.md).

| Parte | Dove | Cosa fa |
|---|---|---|
| Dominio puro | `src/domain/guests` | Conteggi per categoria e lato, filtri, duplicati, validazioni, `bandOf`, occupazione dei tavoli, parser CSV (`csv-import.ts`), CSV di export (`csv-export.ts`). Nessuna chiamata di rete |
| Letture | `src/features/guests/data.ts`, `tables-data.ts` | Gruppi, tavoli e invitati (anche eliminati) con `all-pages.ts`, ordinati per `id`, senza tetto. Una tabella non ancora migrata dà `not_migrated` |
| Scritture | `actions.ts`, `tables-actions.ts`, `import-actions.ts` | Server action con zod e `ActionResult`. Modifiche da modulo con `versionedUpdate` e `ConflictDialog`; assegnazioni rapide con `update` diretto; massa e Annulla con `guests_bulk` e `guests_bulk_undo`; eliminazione logica con `deleted_at`; `DELETE` fisico solo per "Elimina definitivamente" e "Svuota" |
| Importazione | `import-actions.ts` più `import_guests` | Il file si legge nel browser. La server action rivalida le righe con lo stesso schema e chiama la RPC |
| Esportazione | `src/domain/guests/csv-export.ts`, `src/features/export` | CSV dei vivi generato nel client; nel JSON completo `guests`, `guestGroups`, `guestTables` |
| Navigazione | `src/components/AppNav.tsx`, `HelpLink.tsx`, `src/app/(app)/layout.tsx` | Sei voci. Invitati è nascosta senza permesso `guests/read`; `/invitati` senza permesso mostra il pannello "Questo spazio è su invito" |

Limiti per non rompere il rendering e il body delle server action:

- liste a 100 righe per volta, con "Mostra altre 100"; i gruppi grandi sono chiusi;
- importazione: 500 righe, payload sotto 900 KB (il body delle server action è 1 MB);
- `guests_bulk`: 1000 id per chiamata, e il client lavora a lotti; la selezione totale ha un tetto di 5000 id.

Gli errori mostrano codici e messaggi fissi. Né il database né il server restituiscono `message` o `details` di Postgres, perché possono contenere la riga.

## Conferme di presenza (RSVP)

Il link personale è l'unica area pubblica con dati di terzi. Le regole di accesso sono nell'[ADR-0003](../adr/0003-link-rsvp-token-derivato-accesso-pubblico.md), la sicurezza in [Sicurezza](sicurezza.md#pagina-pubblica-rsvp-adr-0003).

| Parte | Dove | Cosa fa |
|---|---|---|
| Token | `src/features/rsvp/token.ts` | Token derivato da `RSVP_LINK_SECRET` e dall'id del link; forma, hash e URL. Il segreto si legge con `readRsvpLinkSecret()` in `app-config.ts` |
| Bordo pubblico | `src/proxy.ts`, `public-rpc.ts`, `limiter.ts` | Il proxy chiama `rsvp_gate` con timeout di 3 secondi, fail-open. Un blocco dà 429 con `Retry-After`; un link che non funziona dà la 404 neutra scritta a mano (`neutral-html.ts`). Il proxy imposta `x-r2y-theme` con il tema del matrimonio e toglie quella del client |
| Pagina pubblica | `src/app/(public)/rsvp/[token]/`, `src/features/rsvp/public/` | Pagina senza JavaScript obbligatorio, con `RsvpShell` e il modulo con `submitRsvp`. `not-found` non esiste: la neutra è del proxy, e la pagina mostra `LinkUnavailable` in 200 se il gate scade, se un invio arriva su un link morto o revocato durante la compilazione (ADR-0003, Arbitrato S3) |
| Lato coppia | `src/features/rsvp/actions.ts`, `data.ts`, `view.ts`, `LinkSheet.tsx` | Azioni sui link (crea, copia, rigenera, revoca, "Condiviso il"), stati calcolati in `view.ts`, lettura di `rsvp_status` |
| Esportazione | `src/features/export/data.ts` | `rsvpResponses` e `rsvpLinks` nel JSON, mai il token né l'hash |

Regole di invariante: `p_now` arriva dal server (`resolveNow()`) e mai da un parametro del client; il cookie di test `r2y-test-now` vale solo con `E2E_CLOCK` e senza `VERCEL`. Le RPC pubbliche sono solo per `service_role`. La pagina pubblica non ha un `loading.tsx`, perché uno streaming darebbe 200 a un link morto.

## Guida d'uso (`/guida`)

La **Guida** sta in cima alla pagina Opzioni (non più nella barra) e mostra le pagine di `docs/functional`. Il contenuto arriva dagli stessi file Markdown, senza copie nel codice: un file modificato appare alla build successiva.

- **Route**: `src/app/(app)/guida/`. `page.tsx` è l'indice (la tabella di `docs/functional/README.md`, nel suo ordine); `[...pagina]/page.tsx` è una pagina. Stessa area autenticata delle altre pagine, senza guard nuovi.
- **Lettura**: `src/features/guide/source.ts` (`server-only`) legge la cartella da `process.cwd()`. In produzione il risultato è tenuto in memoria per istanza; in sviluppo si rilegge a ogni richiesta. Una cartella mancante è un errore visibile, mai una Guida vuota.
- **Tracciamento per Vercel**: nessun import porta i file nella funzione. `outputFileTracingIncludes` in `next.config.ts` include `./docs/functional/**/*.md` per `/guida` e `/guida/*`.
- **Pagine ammesse**: solo i nomi reali dei file (`^[a-z0-9-]+\.md$`, `README.md` escluso). Il segmento dell'URL non costruisce mai un percorso; un nome fuori elenco o più segmenti è `notFound()`.
- **Renderer**: `GuideMarkdown.tsx`, Server Component con `react-markdown@10.1.0` e `remark-gfm@4.0.1`, `skipHtml`, senza `rehype-raw`. Nel browser non arriva JavaScript del Markdown.
- **Link**: una sola regola, `resolveGuideHref` in `markdown.ts`. Un `.md` noto diventa un link interno; `README.md` va all'indice; `http(s)` e `mailto` aprono una nuova scheda; ancore, percorsi fuori dalla cartella e `.md` sconosciuti sono testo semplice.
- **Focus**: il layout della Guida (`src/app/(app)/guida/layout.tsx`) con `FocusHeading.tsx` (client) porta il focus sull'H1 solo dopo una navigazione interna, non al primo caricamento.
- **Sezione nascosta**: "Storico delle modifiche" non viene mostrato (`stripChangelog`).
- **Test che bloccano la CI**: vedi [Sviluppo locale e test](sviluppo-locale-e-test.md#documenti-della-guida).

## Storico delle modifiche

| Data | Feature | Modifica |
|---|---|---|
| 2026-11-24 | FEAT-2026-001 | Prima stesura (F4, T18) |
| 2026-11-25 | FEAT-2026-002 | Guida d'uso in app: route, lettura dei file, tracciamento Vercel, renderer e regole dei link |
| 2026-11-25 | FEAT-2026-003 | Modulo invitati: dominio, letture, scritture, importazione ed esportazione; Guida in Opzioni; link Aiuto |
| 2026-11-28 | FEAT-2026-004 | Conferme di presenza: bordo pubblico nel proxy, quinto ambito della chiave segreta, lato coppia ed esportazione |
