# roadmap2yes

Web app per organizzare e tracciare il nostro matrimonio, passo dopo passo: onboarding, Percorso con le scadenze, scelte (data e location), budget ed esportazione.

> **Repository pubblico.** Non committare mai dati reali di invitati, segreti, codici d'accesso, email vere o file `.env`. Ogni dato di esempio è finto e usa `@example.test`. Lo controllano `npm run check:test-emails` e gitleaks in CI.

## Setup locale

Requisiti: Node 24 (`.nvmrc`), npm 11, Docker. La CLI di Supabase è una devDependency.

```bash
npm ci
npm run db:start              # stack Supabase locale in Docker, più Mailpit per le email dell'app
npm run db:reset              # migrazioni e seed con dati finti (solo locale)
cp .env.example .env.local
npm run -s db:env >> .env.local   # aggiunge le chiavi dello stack locale, solo sul tuo computer
npm run dev                   # http://127.0.0.1:3000
```

Per fermare lo stack: `npm run db:stop`. Il primo utente si crea dalle variabili `R2Y_BOOTSTRAP_*` in `.env.local` (solo valori finti): al primo accesso con quell'email, oppure a mano con `npm run bootstrap`.

Comandi principali: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run db:test`, `npm run e2e`. L'elenco completo e i limiti locali sono in [sviluppo locale e test](docs/technical/sviluppo-locale-e-test.md).

## Documentazione

- **Uso dell'app**: [`docs/functional`](docs/functional/README.md). Accesso e codici, onboarding, Percorso, Scelte, Budget, Home, Opzioni, promemoria email, esportazione. Le stesse pagine si leggono dentro l'app, nella voce **Guida**.
- **Tecnica**: [`docs/technical`](docs/technical/README.md). [Architettura](docs/technical/architettura.md), [modello dati](docs/technical/modello-dati.md), [sicurezza](docs/technical/sicurezza.md), [email e job](docs/technical/email-e-job.md), [ambienti e rilascio (runbook)](docs/technical/ambienti-e-rilascio.md), [sviluppo locale e test](docs/technical/sviluppo-locale-e-test.md).
- **Decisioni**: [`docs/adr`](docs/adr/0001-stack-auth-ambienti.md). Stack, accesso con codice e ambienti.

## Stack

Next.js 16 (App Router) con React 19 e TypeScript su Vercel; Supabase per Postgres, Auth e RLS; Tailwind CSS e shadcn/ui. Email con Resend solo quando esiste un dominio: senza, l'app funziona e mostra un avviso.

## Storico delle modifiche

| Data | Feature | Modifica |
|---|---|---|
| 2026-11-24 | FEAT-2026-001 | Setup essenziale che rimanda alla documentazione (F4, T18) |
| 2026-11-25 | FEAT-2026-002 | Voce Guida nell'app; "Altro" diventa "Opzioni" |
