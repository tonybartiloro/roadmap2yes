# Sviluppo locale e test

Come si lancia ciascuna suite, cosa richiede e quali limiti ha in locale. Il setup dell'ambiente locale (Docker, porte, `.env.local`) è nel [runbook](ambienti-e-rilascio.md#setup-locale-con-docker).

## Comandi principali

| Comando | Cosa fa | Richiede |
|---|---|---|
| `npm run dev` | App in sviluppo su `http://127.0.0.1:3000` | `db:start`, `.env.local` |
| `npm run lint` | ESLint (guardie su `use cache`, `text-accent`, import di `admin.ts`) e controllo che ogni email nel repository sia `@example.test` | Nulla |
| `npm run typecheck` | `next typegen` e `tsc --noEmit` | Nulla |
| `npm test` | Vitest, progetto `unit`: codice puro, nessun database | Nulla |
| `npm run test:tz` | Come `npm test`, ripetuto con `TZ=UTC` e `TZ=America/Los_Angeles` | Nulla |
| `npm run build` | Build di produzione di Next.js | Variabili pubbliche di Supabase (in CI, valori segnaposto) |
| `npm run gen:themes` | Rigenera `src/app/themes.css` dai token dei temi | Nulla |
| `npm run check:fonts` | Controlla che ogni tema non superi il budget di font | Build fatta |
| `npm run test:integration` | Vitest, progetto `integration`: `tests/integration` e `tests/acceptance` | `db:start`, variabili da `db:env`, Mailpit |
| `npm run db:test` | pgTAP su `supabase/tests` | `db:start` e `db:reset` |
| `npm run db:types` | Rigenera `src/lib/supabase/database.types.ts` | `db:start` |
| `npm run e2e` | Playwright, tutti i progetti selezionati | Build, variabili da `db:env`, `npm run e2e:install` |

Una PR passa la CI solo se tutte le suite sono verdi. Il controllo di `database.types.ts` e di `themes.css` fallisce se il file committato non è quello generato.

## Unit

`npm test` esegue i file `src/**/*.test.{ts,tsx}`, `scripts/**/*.test.ts`, `tests/unit/**` e `tests/lint-fixtures/**`. Non apre connessioni di rete né al database. Le date si testano con `today` e `now` passati come parametri: nessun test dipende dall'orologio reale.

Le suite di date girano anche con `TZ=UTC` e `TZ=America/Los_Angeles`, con gli stessi vettori usati da pgTAP (`tests/fixtures/date-offset-vectors.json`).

## Documenti della Guida

I test unitari leggono i file veri di `docs/functional` (non copie). Se una regola non è rispettata, `npm test` fallisce e la CI si ferma:

- `source.test.ts`: ogni `*.md` della cartella è nella tabella di `README.md`, ogni riga cita un file esistente, e nome e descrizione non sono vuoti (`checkIndex`).
- `guide-docs.test.tsx`: ogni pagina, senza "Storico delle modifiche", viene resa e non deve contenere link fuori dalla cartella (diventano testo semplice), il testo "docs/technical", né più di un H1 o salti di livello.
- `markdown.test.ts`: le regole dei link (`resolveGuideHref`, `parseIndexTable`, `stripChangelog`) con i casi limite.

Per aggiungere una pagina: create il file in `docs/functional`, aggiungete la sua riga alla tabella di `README.md`, e linkate solo altre pagine della cartella. Il titolo e la descrizione della riga diventano la scheda dell'indice.

Il comando mirato è `npm run test -- src/features/guide`.

## Integration e acceptance

`npm run test:integration` esegue i file in `tests/integration/**` e `tests/acceptance/**`. Richiedono lo stack locale avviato e le variabili esportate da `npm run -s db:env`.

- I file girano **uno alla volta** (`fileParallelism: false`), perché leggono e scrivono stato globale: contatori del limitatore, heartbeat.
- Il test `tests/acceptance/headers.test.ts` controlla le intestazioni dell'app **compilata**. Senza build viene saltato; con `HEADERS_REQUIRED=1` la mancanza della build fa fallire il test. In CI è obbligatorio.
- Per le email servono Mailpit e `SMTP_HOST`, `SMTP_PORT=54425`, `MAILPIT_API_URL`, `EMAIL_TRANSPORT=smtp`. Le variabili di bootstrap di test sono nella configurazione della CI.

## pgTAP

`npm run db:test` esegue `supabase/tests`. Copre:

- RLS attiva su tutte le tabelle del `public`;
- isolamento tra matrimoni;
- scritture vietate dalla matrice;
- allowlist delle funzioni eseguibili;
- immutabilità delle tabelle append-only;
- vincolo dei due partner;
- `authorize_account_op`, con solo l'altro partner dello stesso matrimonio;
- le corse tra accettazione e revoca di un invito (nessun errore `40P01`);
- i vettori delle date.

Il database va riportato allo stato delle migrazioni con `npm run db:reset` prima di lanciare i test, perché i test presuppongono i seed locali.

## E2E (Playwright)

Gli e2e girano su una build di produzione e sullo stack locale. Prima di lanciarli:

```
npm run e2e:install
npm run build
npm run -s db:env >> .env.local
```

Progetti (definiti in `playwright.config.ts`, con la convenzione dei nomi dei file):

| Progetto | File | Cosa copre | Porta |
|---|---|---|---|
| `mobile` | `e2e/*.spec.ts` (esclusi i casi speciali) | Chromium con profilo Pixel 7 a 360 × 740 | `E2E_PORT` (3000) |
| `desktop` | `e2e/*.spec.ts` (esclusi i `.mobile`) | Chromium a 1280 × 800 | `E2E_PORT` (3000) |
| `webkit-smoke` | `e2e/cross-browser.spec.ts` | Login, onboarding e Percorso a 390 px, con il motore WebKit di Playwright | `E2E_PORT` (3000) |
| `time` | `e2e/*.time.spec.ts` | Test sul tempo, seriali, con il cookie `r2y-test-now` (`E2E_CLOCK=1`) | `E2E_PORT` (3000) |
| `degraded` | `e2e/degraded.spec.ts` | Secondo server, con un backend non raggiungibile (`E2E_DEGRADED_SUPABASE_URL`, predefinito `127.0.0.1:54499`) | `E2E_DEGRADED_PORT` (3201) |
| `email-off` | `e2e/email-off.spec.ts` | Terzo server senza `EMAIL_TRANSPORT` | `E2E_EMAIL_OFF_PORT` (3202) |

Esempi:

```
npx playwright test --project=mobile
npx playwright test --project=time
E2E_PORT=3100 npx playwright test --project=mobile
```

Sulla macchina di sviluppo del progetto la porta 3000 è occupata da un'altra app Docker, e Playwright riusa il server che la occupa (test falliti in massa). Per gli e2e locali usate:

```
E2E_PORT=3300 npm run e2e
```

con `npm run db:start` attivo. `webkit-smoke` richiede `npm run e2e:install`; senza, resta alla CI.

I server `degraded` ed `email-off` si avviano solo quando il loro progetto è selezionato, oppure con `E2E_ALL_SERVERS=1`.

### Matrice dei temi (axe)

`e2e/themes.spec.ts` controlla i 12 temi in chiaro e in scuro con axe (contrasto e dimensione dei target).

- Senza flag: solo la Home.
- Con `E2E_AXE_MATRIX=1`: anche Percorso e Budget, cioè 12 temi × 2 modalità × 3 schermate.

In CI la matrice completa gira solo nel job notturno (`e2e-full` con `schedule`). Su una PR va lanciata a mano con il flag.

### Retry e test instabili

In CI ogni test ha un tentativo in più (`retries: 1`). Un test che passa solo al secondo tentativo viene **segnalato come instabile**: è un bug da correggere, non un verde silenzioso.

## Limiti noti in locale

- **WebKit non è Safari.** Il progetto `webkit-smoke` usa il motore WebKit di Playwright, con un profilo di dispositivo, e copre solo login, onboarding e Percorso. Non verifica Safari su iPhone, né il comportamento dei cookie e dei download di Safari reale. Il lancio di WebKit in locale dipende da Playwright e dal sistema: un fallimento locale non è una prova su Safari. In CI WebKit gira nel job `e2e-full`. Una verifica sul WebKit reale in CI è un punto aperto del rilascio.
- **Email.** Gli e2e che leggono le email usano Mailpit (`MAILPIT_API_URL`). Senza Mailpit avviato quei test falliscono, perché non trovano il messaggio.
- **Fuso orario.** Gli e2e girano con `timezoneId: "Europe/Rome"` e locale `it-IT`.
- **Porta occupata.** Playwright riusa un server già attivo sulla porta fuori da CI. Fermate il processo che occupa la porta prima di lanciare.
- **Stato condiviso.** I test creano utenti e matrimoni unici con email `@example.test` casuali. Non si puliscono i dati dopo ogni test, perché le tabelle di storico sono append-only. Il database locale si può sempre riportare allo stato iniziale con `npm run db:reset`.
- **Orologio.** `E2E_CLOCK=1` abilita il cookie `r2y-test-now`. Con `VERCEL` definita il cookie è ignorato. Il flag non deve mai essere impostato su Vercel.
- **Email reali.** Nessun test invia email vere: l'unico trasporto usato è Mailpit (o nessun trasporto).

## Invitati (FEAT-2026-003)

Dove stanno i test del modulo, per livello:

- **Seed**: `supabase/seeds/04_guests.sql` (applicato da `npm run db:reset`) con nomi inventati, telefoni finti ed email `@example.test`. Una guardia Vitest (`tests/unit/guests-seed.test.ts`) controlla che resti così.
- **pgTAP**: `guests_rls.test.sql` (dinieghi, `DELETE` solo su righe eliminate), `guests_model.test.sql` (vincoli, audit senza dati personali, trigger, operazioni di massa e relativo undo) e `guests_import.test.sql` (500 sì, 501 no, lotti, undo di un altro matrimonio). Richiedono `npm run db:reset`.
- **Unit** (`npm test`): `src/domain/guests/*.test.ts` per parser CSV, export, occupazione dei tavoli, conteggi e filtri; `src/features/guests/*.test.tsx` per i componenti, incluso Annulla visibile a 7,9 secondi con timer finti. `src/components/HelpLink.test.tsx` controlla la mappa del pulsante Aiuto.
- **Integration** (`npm run test:integration`): `tests/integration/guests.data.test.ts`, `guests.actions.test.ts`, `guests.tables.test.ts`, e `export.data.test.ts` per l'export completo. Richiedono lo stack locale e girano uno alla volta.
- **E2E**: `e2e/invitati.mobile.spec.ts` (persone e azioni di massa), `invitati.desktop.spec.ts` (conflitto e scala), `invitati.tavoli.mobile.spec.ts` (tavoli) e `invitati.nav.spec.ts` (barra e Aiuto). I dati si preparano con gli helper `seedGuests`, `addFamilyMember` e quelli dei tavoli in `e2e/support/seed.ts`, mai dalla UI.
- Gli e2e girano sulla build: dopo ogni modifica lanciate `npm run build`, poi `E2E_PORT=3300 npm run e2e` come nel resto del documento.

## Stato al termine di F3

Riferimento dal log della feature, non un contratto: unit circa 850, integration circa 740, pgTAP circa 950, e2e 209 su 210 con un test di avvio a freddo poi reso deterministico. I numeri cambiano con il codice.

## Regola sui test e sui dati

- Nessun dato reale, nemmeno come esempio, nei test.
- `npm run check:test-emails` (anche in CI) fallisce se nel repository compare un'email che non sia `@example.test`.
- I segreti dei test sono finti e marcati come tali. Non si usano mai segreti di produzione in locale.

## Storico delle modifiche

| Data | Feature | Modifica |
|---|---|---|
| 2026-11-24 | FEAT-2026-001 | Prima stesura: suite, progetti e2e, matrice dei temi, limiti noti (F4, T18) |
| 2026-11-25 | FEAT-2026-002 | Test dei documenti della Guida; porta e2e locale (`E2E_PORT=3300`) |
| 2026-11-25 | FEAT-2026-003 | Test del modulo invitati per livello, seed finto e helper e2e |
