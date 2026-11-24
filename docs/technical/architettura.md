# Architettura

Questo documento descrive come è costruita l'app. Le decisioni che la fissano sono in [ADR-0001](../adr/0001-stack-auth-ambienti.md).

## Stack

| Area | Scelta | Note |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript in modalità strict | Server components e server actions. Il proxy è in `src/proxy.ts` |
| UI | Tailwind CSS v4, shadcn/ui (Radix), react-hook-form, zod 4 | Mobile first. Temi come variabili CSS su `[data-theme]` |
| Dati e accesso | Supabase: Postgres, Auth (password), RLS | `@supabase/ssr` per le sessioni nei cookie, `supabase-js` per le chiamate |
| Email | `EmailSender` con tre trasporti: `none`, `smtp` (solo locale e CI), `resend` | Resend è l'unico fornitore in produzione, quando esiste il dominio |
| Hosting | Vercel Hobby, regione `fra1`; un solo progetto con ambienti Preview e Production | Il cron giornaliero è in `vercel.json` |
| Database | Supabase free, regione `eu-central-1`; un progetto di produzione e uno di staging | Il progetto di staging contiene solo dati finti |
| Test | Vitest, pgTAP, Playwright, axe | Vedi [Sviluppo locale e test](sviluppo-locale-e-test.md) |

Nessuno storage di file: R1 non carica file. Lo storage, quando servirà (R6), sarà Supabase Storage.

## Dove vive il codice

| Cartella | Contenuto |
|---|---|
| `src/app` | Route: pagine pubbliche `(public)`, onboarding, area `(app)`, route API del cron |
| `src/features` | Logica per funzione: `auth`, `accounts`, `invitations`, `onboarding`, `timeline`, `decisions`, `budget`, `home`, `notifications`, `export`, `jobs` |
| `src/domain` | Funzioni pure del dominio (Percorso, budget, promemoria, esportazione), con `today` e `now` come parametri |
| `src/lib` | Infrastruttura: client Supabase (`lib/supabase`), email (`lib/email`), configurazione (`app-config.ts`), orologio (`clock.ts`) |
| `src/content` | Contenuti: catalogo delle tappe, categorie di budget, frasi di stile, codici deboli |
| `supabase/migrations` | Migrazioni SQL, additive |
| `supabase/tests` | Test pgTAP |
| `scripts` | Bootstrap, generazione dei temi, controllo dei font, keep-alive, controllo degli indirizzi di test |

## Come arriva una richiesta

1. **`src/proxy.ts`** verifica la sessione con `getClaims()`, applica le intestazioni di sicurezza, rimanda al login o alla pagina "Questo spazio è su invito", e con errori di rete o con il servizio in pausa riscrive su `/servizio` senza leggere il database.
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
- una regola ESLint permette di importare `admin.ts` solo da quattro ambiti: login e bootstrap (`features/auth/{login,bootstrap}.ts`), operazioni sugli account (`features/accounts/admin-ops.ts`), job (`features/jobs/**`), disattivazione email (`app/(public)/email/**`);
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

## Storico delle modifiche

| Data | Feature | Modifica |
|---|---|---|
| 2026-11-24 | FEAT-2026-001 | Prima stesura (F4, T18) |
