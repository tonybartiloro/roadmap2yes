# roadmap2yes

Web app per organizzare e tracciare il nostro matrimonio, passo dopo passo.

> Repository pubblico: non committare mai dati reali degli invitati, segreti o file `.env`.

## Sviluppo locale

Requisiti: Node 24 (`.nvmrc`), npm 11, Docker. La CLI di Supabase è una devDependency: nessuna installazione globale.

```bash
npm ci
npm run db:start      # stack Supabase locale in Docker + catcher email (Mailpit)
npm run db:reset      # applica migrazioni e seed (dati finti)
cp .env.example .env.local
npm run -s db:env >> .env.local   # aggiunge URL e chiavi dello stack locale (valori solo tuoi, mai nel repo)
npm run dev           # http://127.0.0.1:3000
```

Per fermare lo stack: `npm run db:stop`.

Porte locali (diverse dai default di Supabase, per convivere con altri progetti): API `54421`, DB `54422`, Mailpit web `54426` (Auth: `54424`), SMTP app `54425`.

Email dell'app in locale e in CI (Mailpit): `SMTP_HOST=127.0.0.1`, `SMTP_PORT=54425`, `MAILPIT_API_URL=http://127.0.0.1:54426` (UI e API, usate dagli e2e).

Il primo utente si crea dalle variabili `R2Y_BOOTSTRAP_*` (vedi `.env.example`, solo valori finti `@example.test`): al primo accesso con quell'email oppure a mano con `npm run bootstrap`.

### Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint (guardie: `use cache`, `text-accent`, import di `admin.ts`) + controllo email `@example.test` su tutto il repo |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm test` | Vitest, progetto `unit` (nessun DB). `npm run test:tz` lo ripete con `TZ=UTC` e `TZ=America/Los_Angeles` |
| `npm run test:integration` | Vitest, progetto `integration` (richiede `db:start`; cartelle `tests/integration` e `tests/acceptance`) |
| `npm run db:test` | pgTAP (`supabase/tests`) |
| `npm run db:types` | rigenera `src/lib/supabase/database.types.ts` (non si modifica a mano) |
| `npm run e2e` | Playwright; richiede `npm run build` e le variabili in `.env.local`. Progetti: `mobile`, `desktop`, `webkit-smoke`, `time`, `degraded`, `email-off` (convenzione dei nomi dei file in `playwright.config.ts`) |
| `npm run bootstrap`, `gen:themes`, `check:fonts`, `keepalive:check` | script dichiarati in anticipo: i file `scripts/*.ts` corrispondenti arrivano con i rispettivi task |

### Sicurezza del repository

- Solo email `@example.test`: lo verifica `npm run check:test-emails` (anche in CI).
- Scansione segreti con gitleaks su tutta la cronologia (CI, `.gitleaks.toml`).
- La chiave segreta di Supabase è importabile solo da `src/lib/supabase/admin.ts`, a sua volta importabile solo da 4 ambiti (regola ESLint).
