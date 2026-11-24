---
# p49 ADF project memory. The front matter is read by the ADF scripts; keep keys as they are.
adf: 1
language:
  interaction: "it"
  docs: "it"
git:
  base_branch: main
  branch_pattern: "{type}/{ticket}-{slug}"
  commit_convention: conventional
  merge_strategy: squash
docker: true
commands:
  setup: "npm ci && npm run db:start && npm run db:reset"
  start: "npm run dev"
  lint: "npm run lint"
  typecheck: "npm run typecheck"
  test: "npm run test"
  build: "npm run build"
  e2e: "npm run e2e"
deploy:
  staging: "Vercel preview deployment per ogni PR"
  production: "automatico al merge su main (Vercel Hobby); per ora la produzione fa anche da staging"
  merge_deploys_production: true
  production_commands: "vercel --prod,vercel deploy --prod,vercel promote"
docs:
  provider: "markdown"
  functional: "docs/functional"
  technical: "docs/technical"
  adr: "docs/adr"
  plans: ""
tracker:
  type: "none"
  url: ""
---

# Project memory — roadmap2yes

## What this project is
Web app personale per organizzare e tracciare il matrimonio di Tony e Jessica: guida passo passo ogni scelta (data, location, fornitori, invitati, abiti, testimoni, lista nozze…), con budget versionato e decisioni rivedibili nel tempo. Più avanti: sito per gli invitati (RSVP) e area live del giorno del matrimonio (foto/video, guestbook).
Data desiderata: 3 settembre 2027 (non prima); alternative maggio-giugno o settembre 2028 in base alla disponibilità della location. Nulla è ancora deciso.

## Stack and architecture
Approvato al Gate B di FEAT-2026-001 (2026-11-24), ADR `docs/adr/0001-stack-auth-ambienti.md`: Next.js 16 App Router + TypeScript su Vercel Hobby (dub1); Supabase free eu-west-1 (Postgres, Auth email + codice d'accesso, RLS come unico livello di autorizzazione; Storage solo più avanti, nessun object storage esterno); Tailwind v4 + shadcn/ui; Resend come unico provider email, acceso solo quando esiste il dominio (senza Resend nessuna email e avviso in app). Primo utente creato da variabili d'ambiente `R2Y_BOOTSTRAP_*` (solo creazione). Tutto deve restare **gratuito**; il dominio è l'unica spesa, a carico dello sviluppatore.

## Conventions
Conventional commits, squash merge, branch `{type}/{ID}-{slug}`. Da definire con la prima feature.

## UI and design system
Mobile-first, shadcn/ui; 12 temi runtime (variabili CSS su `[data-theme]`, predefinito "Giardino", chiaro e scuro), scelti per matrimonio in onboarding. Tono informale ("tu"). Dettagli in `.adf/features/FEAT-2026-001/design.md`.

## Tests
Vitest (unit), pgTAP (DB/RLS), Playwright e2e sullo stack Supabase locale in Docker, axe per l'accessibilità. Orologio iniettabile: funzioni pure con `today`/`now`; cookie e2e `r2y-test-now` solo con `E2E_CLOCK=1` e senza `VERCEL`.

## Environments and delivery
Repo pubblico GitHub tonybartiloro/roadmap2yes (CI GitHub Actions, minuti illimitati). Un solo progetto Vercel: Preview per PR = staging, collegato a un secondo progetto Supabase free con soli dati finti; merge su main = produzione (oggi fa anche da staging della coppia). Sviluppo locale tutto in Docker (stack Supabase CLI con mail catcher).

## Gotchas
- Repo **pubblico**: mai committare dati reali di invitati, segreti, `.env`; seed solo con dati finti.
- Supabase free mette in pausa i progetti dopo ~7 giorni di inattività del DB (ripristino manuale): keep-alive con cron giornaliero Vercel + workflow GitHub settimanale.
- Codice d'accesso: minimo 10 caratteri con lettere e cifre, imposto da Supabase Auth; nessun CAPTCHA in R1.
- Utenti: Tony e Jessica (pari permessi); previsti ruoli futuri famiglia e wedding planner (opzionale).
