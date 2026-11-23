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
docker: false
commands:
  setup: ""
  start: ""
  lint: ""
  typecheck: ""
  test: ""
  build: ""
  e2e: ""
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
Greenfield (nessun codice al 2026-11-23). Direzione approvata: frontend React (Next.js + TypeScript proposto), Tailwind + shadcn/ui, Supabase (Postgres, Auth, RLS) su piano free, hosting Vercel Hobby. Tutto deve restare **gratuito**. Media pesanti (foto/video giorno del matrimonio) su object storage gratuito esterno (da decidere nel piano: candidato Backblaze B2 10 GB free).

## Conventions
Conventional commits, squash merge, branch `{type}/{ID}-{slug}`. Da definire con la prima feature.

## UI and design system
Da definire nella prima feature: mobile-first, "cool", elegante; shadcn/ui.

## Tests
Da definire nella prima feature.

## Environments and delivery
Repo pubblico GitHub tonybartiloro/roadmap2yes (CI con minuti illimitati). Vercel preview per PR = staging; merge su main = produzione (oggi produzione = staging di fatto).

## Gotchas
- Repo **pubblico**: mai committare dati reali di invitati, segreti, `.env`; seed solo con dati finti.
- Supabase free mette in pausa i progetti dopo ~7 giorni di inattività del DB: serve un keep-alive.
- Utenti: Tony e Jessica (pari permessi); previsti ruoli futuri famiglia e wedding planner (opzionale).
