# ADR-0001 — Stack applicativo, modello di accesso e ambienti

| Status | Date | Deciders | Related feature | Supersedes |
|---|---|---|---|---|
| proposed | 2026-11-23 | architect (proposta); sviluppatore (approvazione al Gate B) | FEAT-2026-001 (`.adf/features/FEAT-2026-001/plan.md`) | — |

## Context
- **App**: web app privata per due persone (i partner), con ruoli futuri "famiglia" e "wedding planner". Frontend React, mobile-first, interfaccia in italiano.
- **Costo**: tutto deve restare gratuito (unica spesa: il dominio della coppia, non ancora acquistato).
- **Repository pubblico**: niente segreti, email reali o dati personali, nemmeno nei log e negli artefatti CI.
- **Fornitori**: per dati, autenticazione e storage solo Supabase (D8); un solo fornitore email, Resend free, per le email di accesso e per quelle dell'app (D11).
- **Sviluppo**: interamente in locale con Docker finché manca il dominio (D27).
- **Ambienti**: un solo progetto Vercel con Preview e Production (D13); le preview non devono toccare i dati reali.
- **Vincoli dei piani gratuiti**:
  - Supabase free va in pausa dopo ~7 giorni di inattività;
  - Vercel Hobby consente cron al massimo giornalieri;
  - l'SMTP integrato di Supabase consegna solo ai membri dell'organizzazione;
  - Resend richiede un dominio verificato.
- **Requisiti che fissano un precedente per R2–R6** (brief FEAT-2026-001):
  - isolamento dei dati nel database (AC10, AC11);
  - accesso solo su invito senza enumerazione degli account (AC2–AC7);
  - email di accesso con link valido anche in un altro browser più codice (AC8);
  - storico immutabile (BR4);
  - keep-alive (AC44).

## Decision
1. **Stack**: Next.js (App Router, TypeScript strict) su Vercel Hobby, funzioni nella regione `fra1`. Tailwind CSS + shadcn/ui. Supabase (Postgres + Auth) nella regione `eu-central-1`. Nessun altro backend.
2. **Autorizzazione**: la Row Level Security di Postgres è l'**unico confine di autorizzazione**.
   - Ogni dato di dominio ha `wedding_id`.
   - Ogni policy usa una sola funzione `private.has_permission(wedding_id, area, action)`, basata su `memberships(role)` × `private.role_permissions`. I ruoli futuri si abilitano aggiungendo righe di mappatura, non riscrivendo policy.
   - Le query dell'utente viaggiano sempre con il suo JWT (`@supabase/ssr`).
   - La chiave segreta di Supabase è confinata in un modulo `server-only` e usata solo per tre scopi:
     1. creare l'utente Auth di un'email autorizzata;
     2. il job giornaliero;
     3. la disattivazione delle email da link firmato.
   - I dati utente non vengono mai messi in cache condivisa.
   - Le transizioni con invarianti sono funzioni Postgres atomiche. Le tabelle storiche sono append-only, imposte da trigger.
3. **Accesso**:
   - registrazione pubblica chiusa nel server Auth;
   - il primo partner è autorizzato da una riga in `private.founder_allowlist`, inserita dallo sviluppatore nel SQL editor e mai nel repository;
   - gli altri entrano solo con un invito (token casuale salvato come hash, monouso, 7 giorni, revocabile) accettato da una funzione nel DB che verifica email, validità e limite di partner (vincolo unico su `(wedding_id, partner_slot)`);
   - l'utente Auth viene creato solo per email autorizzate; tutte le altre richieste ricevono lo stesso messaggio neutro;
   - email di accesso con codice a 6 cifre e link `token_hash`, verificato in POST da una pagina di conferma (resiste agli scanner dei link e funziona in un altro browser).
4. **Email**:
   - in produzione Resend come custom SMTP di Supabase Auth e come trasporto delle email dell'app (API REST con chiave di idempotenza);
   - in locale e in CI il mail catcher dello stack Supabase locale;
   - nelle preview le email dell'app sono disattivate.
   - Tutto passa da un'unica interfaccia `EmailSender`.
5. **Ambienti**:
   - locale: stack Supabase CLI in Docker + mail catcher, solo dati finti;
   - Preview: progetto Vercel unico con variabili verso un **secondo progetto Supabase free "staging"**, solo dati finti, protetto da Vercel Deployment Protection;
   - Production: progetto Supabase prod.
   - Le migrazioni sono versionate in `supabase/migrations`, **solo additive e compatibili con il codice precedente**, applicate da GitHub Actions: sullo staging nelle PR, in produzione al merge, con approvazione nell'environment `production`.
   - Il deploy di produzione resta automatico al merge su main.
6. **Keep-alive e job**:
   - Vercel Cron giornaliero (mattino, Europe/Rome) su una route protetta da `CRON_SECRET`. Registra un heartbeat con una vera query e invia promemoria idempotenti (unicità nel DB);
   - un workflow GitHub settimanale richiama staging e produzione e fallisce, notificando lo sviluppatore, se l'heartbeat di produzione è più vecchio di 36 h.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Vite + React SPA + Supabase Edge Functions | Nessun server Next; modello semplice | Secondo runtime e deploy per cron, invito e disattivazione; niente SSR per LCP e tema senza lampo; header da gestire a parte |
| Backend con chiave segreta e autorizzazione nel codice | Logica in un solo linguaggio | Con la chiave pubblicabile pubblica, una RLS debole espone l'API; un bug applicativo espone tutto |
| Elenco email consentite in variabile d'ambiente | Nessuna tabella | Il DB non può verificarlo; due fonti di verità |
| Utenti creati a mano dal pannello Supabase | Zero codice | Intervento manuale per ogni futuro accesso; la creazione dello spazio va limitata comunque |
| `inviteUserByEmail` di Supabase | Meno codice | Testo e flusso controllati da Supabase; nessun controllo su revoca, limite e scadenza a nostro modo; utente creato per qualunque email digitata |
| SMTP Gmail/Brevo senza dominio | Nessun costo di dominio | Due fornitori o mittente personale; scartato dallo sviluppatore (D11, D12) |
| Preview sul DB di produzione | Un solo progetto Supabase | Codice non revisionato su dati reali; schema disallineato |
| Supabase Branching | Staging integrato | A pagamento |
| Solo GitHub Actions schedulato | Un solo scheduler | Disattivato dopo 60 giorni di inattività del repo; ritardi; log pubblici |

## Consequences
- **Positive**:
  - isolamento garantito dal database e testabile con pgTAP;
  - nessun segreto né email reale nel repository;
  - costo zero (dominio a parte);
  - R2–R6 riusano lo stesso modello (nuove tabelle con `wedding_id` + policy standard, nuove aree in `role_permissions`, email tramite `EmailSender`, storage futuro dietro un'interfaccia equivalente su Supabase Storage).
- **Negative**:
  - logica divisa tra TypeScript e SQL (RPC, trigger), con una piccola duplicazione dell'aritmetica delle date, mitigata da vettori di test condivisi;
  - due progetti Supabase da tenere in vita;
  - le migrazioni non possono mai rompere il codice precedente (expand/contract);
  - una funzionalità che richieda una migrazione distruttiva richiederà un nuovo ADR o un deploy coordinato.
- **Più difficile**: operazioni batch o amministrative fuori dalla RLS (ognuna richiede un percorso server-only documentato); test end-to-end delle email reali (solo verifica manuale post-deploy).
- **Follow-up**:
  - acquisto del dominio e configurazione Resend (SPF, DKIM, DMARC);
  - riverifica dei limiti dei piani gratuiti alla creazione dei servizi;
  - possibile CSP con nonce in una feature successiva.

## Compliance
- **pgTAP in CI**:
  - ogni tabella di `public` ha RLS attiva;
  - isolamento tra due matrimoni su ogni tabella;
  - immutabilità delle tabelle storiche;
  - vincolo dei due partner.
- **Test d'integrazione**:
  - la chiave pubblicabile senza sessione non legge nulla;
  - un'email non autorizzata non crea utenti;
  - la route del cron rifiuta le chiamate senza `CRON_SECRET`.
- **Lint/CI**:
  - divieto di `'use cache'` e cache condivisa nelle aree autenticate;
  - `admin.ts` importabile solo da moduli `server-only`, con regola di lint sugli import;
  - gitleaks sull'intera cronologia;
  - le seed contengono solo email `@example.test`.
- **Revisione**:
  - checklist di sicurezza nel round dedicato (uso della chiave segreta, nuove policy, nuovi entry point);
  - ogni nuova migrazione verificata come additiva.
