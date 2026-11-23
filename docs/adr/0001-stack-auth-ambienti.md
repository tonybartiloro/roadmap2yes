# ADR-0001 — Stack applicativo, modello di accesso e ambienti

| Status | Date | Deciders | Related feature | Supersedes |
|---|---|---|---|---|
| proposed | 2026-11-23 | architect (proposta); sviluppatore (approvazione al Gate B) | FEAT-2026-001 (`.adf/features/FEAT-2026-001/plan.md`) | — |

## Context
- **App**: web app privata per due persone (i partner), con ruoli futuri "famiglia" e "wedding planner". Frontend React, mobile-first, interfaccia in italiano.
- **Costo**: tutto deve restare gratuito (unica spesa: il dominio della coppia, non ancora acquistato).
- **Repository pubblico**: niente segreti, email reali o dati personali, nemmeno nei log e negli artefatti CI.
- **Fornitori**:
  - per dati, autenticazione e storage solo Supabase (D8);
  - un solo fornitore email, Resend free, attivabile solo quando esiste il dominio (D11, D27);
  - fino ad allora l'app deve funzionare **senza alcuna email**.
- **Accesso** (requisito dello sviluppatore al Gate B):
  - email + **codice d'accesso**;
  - il primo utente (email, codice, ruolo sposo/sposa) è definito da **variabili d'ambiente**;
  - il primo utente crea l'account del partner con un codice da consegnare di persona, modificabile dopo;
  - con Resend attivo è possibile anche l'invito via email.
- **Ambienti**: un solo progetto Vercel con Preview e Production (D13); le preview non devono toccare i dati reali.
- **Vincoli dei piani gratuiti**:
  - Supabase free va in pausa dopo ~7 giorni di inattività;
  - non c'è blocco degli account dopo tentativi falliti;
  - la protezione dalle password trapelate è a pagamento;
  - Vercel Hobby non ha hook dopo il deploy e consente cron al massimo giornalieri.
- **Requisiti che fissano un precedente** (brief FEAT-2026-001):
  - isolamento dei dati nel database (AC10, AC11);
  - accesso solo su invito senza enumerazione degli account;
  - storico immutabile (BR4);
  - keep-alive (AC44).

## Decision
1. **Stack**: Next.js (App Router, TypeScript strict) su Vercel Hobby, regione `fra1`. Tailwind CSS + shadcn/ui. Supabase (Postgres + Auth) in `eu-central-1`.
2. **Autorizzazione**: la Row Level Security, insieme ai privilegi di colonna, è l'**unico confine di autorizzazione**.
   - Ogni dato di dominio ha `wedding_id`.
   - Le policy usano `private.has_permission(wedding_id, area, action)` (`memberships` × `role_permissions`): i ruoli futuri si abilitano aggiungendo righe di mappatura.
   - Una **matrice delle scritture** nel DB definisce ciò che il client può scrivere direttamente: privilegi di colonna, trigger che rendono immutabili `wedding_id` e `created_by`, foreign key composte `(id, wedding_id)`, allowlist delle funzioni eseguibili. Il resto passa da RPC o trigger.
   - L'API espone solo lo schema `public`.
   - La chiave segreta di Supabase è usata solo in 4 ambiti server-only, imposti da una regola di lint sugli import:
     1. login: limitatore e bootstrap;
     2. operazioni sull'account del partner, autorizzate prima dal DB con il JWT dell'utente;
     3. job giornaliero;
     4. disattivazione delle email.
3. **Accesso con email + codice d'accesso**:
   - Il codice è la password di Supabase Auth, hashata da Supabase e mai salvata dall'app.
   - Nessun magic link né OTP via email in R1; registrazione pubblica chiusa.
   - **Policy imposta dal server Auth**: almeno 10 caratteri, con lettere e cifre. L'app aggiunge una lista di codici deboli e il divieto di contenere email o nomi.
   - **Limitatore applicativo** per email (hash) e per IP, con blocco temporaneo e messaggi identici per email esistenti e non. Si somma al limite per IP di Supabase Auth.
   - **Bootstrap**:
     - variabili `R2Y_BOOTSTRAP_EMAIL`, `R2Y_BOOTSTRAP_ACCESS_CODE`, `R2Y_BOOTSTRAP_ROLE` (solo server, mai nel repo);
     - creazione **idempotente e create-only** dell'utente fondatore (`app_metadata.r2y_founder`), eseguita nella server action di login quando l'email coincide con quella di bootstrap, perché Vercel non ha un hook dopo il deploy;
     - lo stesso codice è disponibile come `npm run bootstrap` per locale e staging;
     - un codice cambiato in app non viene mai sovrascritto.
   - **Partner**:
     - il fondatore crea l'account del partner con email e codice iniziale (sempre possibile), oppure, con le email attive, invia un invito con link monouso dove il partner sceglie il codice;
     - la membership nasce al primo accesso del partner, e un vincolo unico garantisce al massimo 2 partner;
     - un codice dimenticato lo reimposta l'altro partner con un codice temporaneo, che va cambiato al login successivo; con le email attive anche tramite link di recupero;
     - ogni operazione sugli account lascia un evento visibile all'altro partner.
4. **Email opzionali**:
   - tutto passa da un'interfaccia `EmailSender`;
   - `EMAIL_TRANSPORT` assente significa **nessuna email**, con un avviso persistente in app e le opzioni solo-email nascoste;
   - in produzione, con il dominio: Resend per le email dell'app e come SMTP di Supabase Auth, solo per il recupero del codice;
   - in locale e in CI: il mail catcher dello stack Supabase.
5. **Ambienti**:
   - locale: stack Supabase CLI in Docker, dati finti;
   - Preview: secondo progetto Supabase free "staging", dati finti, account di smoke da variabili d'ambiente, Deployment Protection;
   - Production: Supabase prod.
   - `supabase/config.toml` vale solo per locale e CI. La configurazione Auth remota si fa dal pannello con una checklist versionata (nessun `config push`).
   - Migrazioni solo additive, applicate da GitHub Actions: staging sulle PR, prod al merge con approvazione. Deploy di produzione automatico al merge.
   - Se Supabase è in pausa o non raggiungibile, proxy e layout mostrano una pagina dedicata che non legge il database.
6. **Keep-alive e job**:
   - Vercel Cron giornaliero: heartbeat sempre; promemoria idempotenti solo con le email attive (una email al giorno per utente);
   - workflow GitHub settimanale su staging e prod, che fallisce e notifica se l'heartbeat è vecchio.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Vite + React SPA + Supabase Edge Functions | Nessun server Next | Secondo runtime per cron e operazioni admin; niente SSR per LCP e tema senza lampo |
| Backend con chiave segreta e autorizzazione nel codice | Un solo linguaggio | Con la chiave pubblicabile pubblica, una RLS debole espone l'API |
| Magic link / OTP via email | Niente password | Richiede un fornitore email, che manca fino al dominio; sostituito su richiesta dello sviluppatore |
| Codici gestiti dall'app (hash in tabella + sessione creata dal server) | Blocco per account completo | Autenticazione "fatta in casa", più superficie da proteggere |
| CAPTCHA (Turnstile) sul login | Ferma anche i tentativi diretti a Supabase | Servizio esterno in più; rimandato |
| Bootstrap via script o all'avvio (`instrumentation`) | Esplicito / automatico | Chiave di prod sul portatile / gira a ogni avvio a freddo |
| Allowlist SQL del primo utente | Nessuna variabile | Passaggio manuale; sostituito su richiesta dello sviluppatore |
| Preview sul DB di produzione | Un solo progetto | Codice non revisionato su dati reali |
| Supabase Branching | Staging integrato | A pagamento |
| Solo GitHub Actions schedulato | Un solo scheduler | Si disattiva dopo 60 giorni; ritardi |

## Consequences
- **Positive**:
  - l'app funziona e si usa in due da subito, senza dominio né email;
  - isolamento garantito dal database e testabile;
  - nessun segreto né email reale nel repository;
  - costo zero (dominio a parte);
  - R2–R6 riusano lo stesso modello.
- **Negative**:
  - l'endpoint password di Supabase Auth è raggiungibile direttamente e sul piano free non blocca gli account: la sicurezza dei codici poggia su policy imposta dal server, limite per IP di Supabase, limitatore applicativo sul percorso dell'app e trasparenza degli eventi (rischio documentato; CAPTCHA come rinforzo futuro);
  - senza email non esiste un recupero autonomo del codice (c'è il ripristino tramite l'altro partner, o lo sviluppatore dal pannello);
  - logica divisa tra TypeScript e SQL;
  - due progetti Supabase da tenere in vita;
  - le migrazioni non possono rompere il codice precedente.
- **Follow-up**:
  - dominio + Resend (SPF, DKIM, DMARC) per promemoria, invito via email e recupero codice;
  - riverifica dei limiti dei piani gratuiti;
  - eventuale CAPTCHA;
  - CSP con nonce.

## Compliance
- **pgTAP e test di accettazione** (generati dal catalogo, eseguiti anche via PostgREST con JWT reali):
  - RLS attiva ovunque;
  - isolamento tra matrimoni;
  - scritture vietate;
  - allowlist delle funzioni;
  - immutabilità;
  - vincolo dei 2 partner;
  - `authorize_account_op` (solo l'altro partner dello stesso matrimonio).
- **Test d'integrazione**:
  - registrazione diretta rifiutata;
  - messaggi di login identici per email esistenti e non;
  - blocco dopo N errori;
  - bootstrap idempotente che non sovrascrive un codice cambiato;
  - codice sotto i 10 caratteri rifiutato dal server Auth;
  - cron senza `CRON_SECRET` rifiutato;
  - nessun invio con le email spente.
- **Lint/CI**:
  - divieto di cache condivisa nelle aree autenticate;
  - import di `admin.ts` solo dai 4 ambiti;
  - gitleaks sulla cronologia;
  - email `@example.test` in tutto il repo.
- **Revisione**: round di sicurezza su chiave segreta, policy, nuovi entry point e migrazioni additive; checklist della configurazione Auth remota a ogni rilascio.
