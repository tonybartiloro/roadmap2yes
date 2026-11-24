# Ambienti e rilascio (runbook)

Questo è il runbook di roadmap2yes: come si avvia l'app in locale, come si crea il primo utente, quali variabili e segreti servono, come si rilascia e come si rimedia quando qualcosa si ferma.

Regole che valgono sempre:

- **Mai valori di segreti, codici o email reali in questo documento, in chat o nel repository.** Qui si scrivono solo i **nomi**.
- **Mai `supabase db reset --linked`.** Il reset cancella il database remoto e riapplica i seed, che contengono account di prova con codici noti.
- **I seed non arrivano mai a un progetto remoto.** Il workflow di migrazione esegue solo `supabase db push`, senza `--include-seed`.
- **Il merge su `main` deploya la produzione.** Non esiste un passaggio intermedio.

## Ambienti

| Ambiente | Dove gira | Database | Email | Note |
|---|---|---|---|---|
| Locale | Il proprio computer, Docker | Stack Supabase CLI locale (porte `544xx`) | SMTP verso Mailpit | Dati finti |
| Preview (staging) | Vercel, una per PR | Progetto Supabase **staging** (free) | Spente (`EMAIL_TRANSPORT` assente) | Account di smoke da variabili, dati finti |
| Production | Vercel, al merge su `main` | Progetto Supabase **produzione** (free) | Spente finché non c'è il dominio | Oggi fa anche da staging della coppia |

Un solo progetto Vercel con gli ambienti Preview e Production. Le variabili per ambiente si impostano nel progetto Vercel, con lo scope giusto (Preview, Production o entrambi).

## Setup locale con Docker

Requisiti: Node 24 (`.nvmrc`), npm 11, Docker. La CLI di Supabase è una devDependency: non serve installarla globalmente.

```
npm ci
npm run db:start
npm run db:reset
cp .env.example .env.local
npm run -s db:env >> .env.local
npm run dev
```

L'app è su `http://127.0.0.1:3000`. Per fermare lo stack: `npm run db:stop`.

- `npm run db:start` avvia lo stack Supabase in Docker, senza Studio e senza i servizi non necessari, e avvia **Mailpit** (il catcher dell'app).
- `npm run db:reset` riapplica le migrazioni e i seed. È locale: non tocca mai un progetto remoto.
- `npm run -s db:env` stampa URL e chiavi dello stack locale. Le chiavi sono quelle del proprio computer: non vanno copiate nel repository.

### Porte

| Porta | Cosa |
|---|---|
| `54420` | Database ombra del CLI Supabase |
| `54421` | API Supabase |
| `54422` | Database Postgres |
| `54424` | Catcher delle email di **Auth** (il mail server dello stack Supabase, `local_smtp`) |
| `54425` | SMTP dell'app (Mailpit, avviato da `npm run mail:start`) |
| `54426` | Interfaccia web e API di Mailpit (usata dagli e2e) |
| `3000` | App (`npm run dev`) |

Ci sono **due catcher di email** in locale: quello di Auth (`54424`), per le email che Supabase manda, e quello dell'app (`54425`/`54426`), per promemoria e inviti. Le email dell'app si leggono su `http://127.0.0.1:54426`.

### Se la porta 3000 è occupata

- Per l'app: `npx next dev -H 127.0.0.1 -p 3100`, poi impostate `NEXT_PUBLIC_SITE_URL` di conseguenza in `.env.local`.
- Per gli e2e: `E2E_PORT=3100 npm run e2e`. Il server e2e usa la porta indicata.

**Attenzione:** fuori da CI Playwright riusa un server già attivo sulla porta (`reuseExistingServer`). Se sulla porta c'è un'altra applicazione, i test girano contro di lei. Fermate i processi inutili prima di lanciare gli e2e.

### Browser per gli e2e

`npm run e2e:install` installa Chromium e WebKit con le dipendenze di sistema. Va fatto una volta, e di nuovo dopo un aggiornamento di Playwright.

Gli e2e richiedono una build (`npm run build`) con le variabili locali già esportate da `db:env`.

## Primo utente (bootstrap)

Il primo utente è il **fondatore**: è l'account da cui nasce lo spazio del matrimonio. Si crea da tre variabili d'ambiente, mai dal repository.

| Variabile | Valore |
|---|---|
| `R2Y_BOOTSTRAP_EMAIL` | L'email del fondatore |
| `R2Y_BOOTSTRAP_ACCESS_CODE` | Il codice iniziale, almeno 10 caratteri con lettere e cifre |
| `R2Y_BOOTSTRAP_ROLE` | `sposo` oppure `sposa` |

Tutte e tre servono: se ne manca una, il bootstrap non fa nulla. Se il codice non rispetta la policy o il ruolo non è valido, l'app registra un errore di configurazione (senza valori) e non crea nulla.

### Come si crea

- **In produzione e in staging**: al **primo accesso** con l'email di bootstrap, il login crea l'account e lo spazio. Non serve nessun passaggio manuale. Il controllo avviene nella server action di login, perché Vercel non ha un hook dopo il deploy.
- **In locale e in staging, a mano**: `npm run bootstrap`. Legge `.env.local` (o le variabili della shell). Stampa solo l'esito (`created`, `exists`, `absent`, `invalid-config`, `failed`), mai email o codici.
- **Il target remoto richiede un'opzione esplicita.** Lo script si rifiuta di scrivere su un progetto remoto senza `--remote`: `npm run bootstrap -- --remote`. Non usatelo mai su produzione dal portatile: `vercel env pull` scarica i valori di produzione in `.env.local`.

Il bootstrap è **create-only**: se l'utente esiste già, non cambia nulla. Un codice cambiato in app non viene mai sovrascritto.

### Dopo il primo accesso

1. Cambiate il codice subito, in **Altro > Account**. Il codice iniziale è solo un punto di partenza.
2. Togliete `R2Y_BOOTSTRAP_ACCESS_CODE` da Vercel: non serve più, perché il bootstrap è create-only. Dopo la modifica serve un nuovo deploy.
3. Se cambiate `R2Y_BOOTSTRAP_EMAIL`, il bootstrap crea un **nuovo** fondatore. È voluto, ma è raro: non cambiatela per caso.

In staging le stesse variabili, nell'ambiente Preview, definiscono l'**account di smoke**: sempre con un'email `@example.test` e un codice finto.

## Variabili d'ambiente

Nomi, dove servono e a cosa servono. I valori non sono in questo documento.

| Variabile | Locale | Preview | Production | Note |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54421` | URL del progetto **staging** | URL del progetto **produzione** | Pubblica per design, ma per ambiente |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chiave locale (`db:env`) | Chiave pubblicabile di staging | Chiave pubblicabile di produzione | Pubblica per design |
| `SUPABASE_SECRET_KEY` | Chiave locale (`db:env`) | Chiave segreta di staging. **Sensitive** | Chiave segreta di produzione. **Sensitive** | Bypassa la RLS. Solo i quattro ambiti server-only |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Facoltativa: senza, l'app usa l'URL della branch | URL pubblico. Facoltativa: senza, usa l'URL di produzione del progetto | Serve per link nelle email e per il cookie `secure` |
| `R2Y_BOOTSTRAP_EMAIL` | Email `@example.test` | Email di smoke `@example.test` | Email del primo partner. **Sensitive** | Vedi [Primo utente](#primo-utente-bootstrap) |
| `R2Y_BOOTSTRAP_ACCESS_CODE` | Codice finto | Codice finto | Codice iniziale. **Sensitive** | Da togliere dopo il primo accesso |
| `R2Y_BOOTSTRAP_ROLE` | `sposo` o `sposa` | `sposo` o `sposa` | `sposo` o `sposa` | |
| `R2Y_LOGIN_MAX_FAILURES_EMAIL` | Facoltativa (5) | Facoltativa (5) | Facoltativa (5) | Errori per email nella finestra |
| `R2Y_LOGIN_MAX_FAILURES_IP` | Facoltativa (20) | Facoltativa (20) | Facoltativa (20) | Errori per IP nella finestra |
| `R2Y_LOGIN_LOCK_MINUTES` | Facoltativa (15) | Facoltativa (15) | Facoltativa (15) | Durata del blocco |
| `EMAIL_TRANSPORT` | `smtp` | **Assente** | **Assente**, poi `resend` dopo il dominio | `none` o assente = email spente. `smtp` è rifiutato in produzione |
| `SMTP_HOST`, `SMTP_PORT` | `127.0.0.1`, `54425` | Non usate | Non usate | Solo locale e CI |
| `MAILPIT_API_URL` | `http://127.0.0.1:54426` | Non usata | Non usata | Solo locale e CI, per gli e2e |
| `RESEND_API_KEY` | Non usata | Non usata finché le email non sono accese per lo staging. **Sensitive** | Dopo il dominio. **Sensitive** | Un solo fornitore email |
| `EMAIL_FROM` | Facoltativa | Come produzione, se si accendono le email | Mittente sul dominio verificato, per esempio `roadmap2yes <noreply@DOMINIO>` | Richiesta insieme a `RESEND_API_KEY` |
| `EMAIL_DAILY_CAP` | Facoltativa (50) | Facoltativa (50) | Facoltativa (50) | Tetto di email al giorno, solo app |
| `EMAIL_MONTHLY_CAP` | Facoltativa (1500) | Facoltativa (1500) | Facoltativa (1500) | Tetto di email al mese, solo app |
| `CRON_SECRET` | Finto | Casuale. **Sensitive** | Casuale. **Sensitive** | Vercel Cron lo invia da solo come `Authorization: Bearer` |
| `EMAIL_LINK_SECRET` | Finto (almeno 32 caratteri) | Casuale, almeno 32 caratteri. **Sensitive** | Casuale, almeno 32 caratteri. **Sensitive** | Firma i link di disattivazione. Generazione: `openssl rand -base64 32` |
| `E2E_CLOCK` | `1` solo per gli e2e | **Mai** | **Mai** | Abilita il cookie `r2y-test-now`. Con `VERCEL` definita è ignorata, ma non va mai impostata su Vercel |
| `E2E_PORT`, `E2E_DEGRADED_PORT`, `E2E_EMAIL_OFF_PORT`, `E2E_DEGRADED_SUPABASE_URL`, `E2E_ALL_SERVERS`, `E2E_AXE_MATRIX`, `HEADERS_REQUIRED`, `KEEPALIVE_MODE` | Solo strumenti | Mai | Mai | Strumenti di test e di controllo. Predefiniti in `playwright.config.ts` e negli script |

Impostate da Vercel, mai da noi: `VERCEL`, `VERCEL_ENV`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`.

Regole:

- Le variabili che contengono segreti si marcano **Sensitive** in Vercel.
- Un segreto mancante fa fallire in modo chiuso: per esempio senza `CRON_SECRET` la route del cron rifiuta tutto. Nessun valore finisce nei messaggi di errore.
- Il prefisso `NEXT_PUBLIC_` è solo per valori pubblici. `SUPABASE_SECRET_KEY`, `R2Y_BOOTSTRAP_*`, `CRON_SECRET`, `EMAIL_LINK_SECRET` e `RESEND_API_KEY` non lo hanno mai.

## Segreti su GitHub

Il repository è pubblico. Le CI di pull request non usano alcun segreto (il workflow `ci.yml` non ne ha). I segreti esistono solo negli **environment** e sono usati solo dai workflow su `main`.

| Environment | Usato da | Segreti (Secrets) | Variabili (Variables, non segrete) | Reviewer richiesti |
|---|---|---|---|---|
| `production` | `migrate.yml` (push su `main`, solo se ci sono migrazioni) | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | `SUPABASE_PROJECT_REF` | **Sì**: l'approvazione è il Gate C |
| `staging` | `migrate.yml` (avvio manuale), `keepalive.yml` (ping settimanale) | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_SECRET_KEY` | `SUPABASE_PROJECT_REF`, `NEXT_PUBLIC_SUPABASE_URL` | No |
| `production-keepalive` | `keepalive.yml` (controllo settimanale) | `SUPABASE_SECRET_KEY` | `NEXT_PUBLIC_SUPABASE_URL` | No, di proposito: il controllo settimanale non deve aspettare un'approvazione |

I workflow leggono `SUPABASE_PROJECT_REF` e `NEXT_PUBLIC_SUPABASE_URL` da `vars.*`, gli altri da `secrets.*`.

Il segreto `SUPABASE_SECRET_KEY` di `production-keepalive` è quello di **produzione**. Per questo l'environment non ha reviewer, e per questo deve avere la regola sui branch qui sotto.

### Regola obbligatoria: deployment solo da `main`

**Tutti e tre gli environment devono avere "Deployment branches" impostato su `main`.** Senza questa regola, un branch con un workflow modificato potrebbe leggere i segreti. I workflow hanno un `if: github.ref == 'refs/heads/main'` su ogni job, ma è una seconda barriera, non il controllo principale.

Come si imposta: GitHub > Settings > Environments > nome dell'environment > **Deployment branches and tags** > "Selected branches" > aggiungete `main`. Ripetete per `production`, `staging` e `production-keepalive`.

Questa impostazione sta fuori dal codice: va verificata a mano a ogni nuovo environment o a ogni cambio di proprietario del repository.

## Checklist Auth remota

Il file `supabase/config.toml` vale **solo per locale e CI**. Le impostazioni di Auth dei progetti remoti (staging e produzione) si fanno dal pannello di Supabase, seguendo questa lista. Non si usa `supabase config push`.

Da rifare su **entrambi** i progetti, e da rivedere a ogni rilascio:

- [ ] **Registrazione pubblica disattivata** (signup off): solo gli account creati dall'app o dal bootstrap possono entrare.
- [ ] **Provider email attivo**, con **Confirm email** attiva (`enable_confirmations`).
- [ ] **Secure email change** attiva (`double_confirm_changes`).
- [ ] **Secure password change** attiva (`secure_password_change`).
- [ ] **Lunghezza minima della password: 10**.
- [ ] **Requisiti della password: lettere e cifre**.
- [ ] Limiti di frequenza del login lasciati ai valori predefiniti (circa 30 richieste ogni 5 minuti per IP).
- [ ] **Site URL**: l'URL pubblico dell'ambiente (produzione per il progetto di produzione, l'URL di staging per quello di staging).
- [ ] **Redirect URL**: solo gli URL dell'app. Con le email spente non servono, ma è bene averli corretti.
- [ ] **Template di recupero**: il contenuto di `supabase/templates/recovery.html`. Il link deve passare dal `token_hash` verso `/auth/conferma`.
- [ ] **SMTP personalizzato**: spento in staging. In produzione spento finché non c'è il dominio, poi Resend (vedi [Attivare Resend](#attivare-resend)).
- [ ] Scadenza del JWT a 3600 secondi e rotazione dei refresh token attiva, come in `config.toml`.

Dopo ogni modifica, annotate la data e chi l'ha fatta nel log del rilascio (non nel repository).

## Migrazioni

Le migrazioni stanno in `supabase/migrations/` e si applicano da GitHub Actions con `migrate.yml`.

**Produzione.** Il push su `main` che tocca `supabase/migrations/**` avvia il job nell'environment `production`. Il job collega il progetto, fa un `db push --remote --dry-run`, e poi `db push --remote` (la CLI 3.x punta al database locale senza `--remote`). Nessun reviewer richiesto, per decisione dello sviluppatore (2026-11-24): le migrazioni partono al merge.

**Staging.** Il progetto di staging riceve le migrazioni solo con l'avvio manuale del workflow (`workflow_dispatch`), e solo da `main`. Questo significa che **le migrazioni di una PR non arrivano allo staging prima del merge**. È una differenza rispetto al piano di FEAT-2026-001 (che parlava di staging sulle PR): va decisa la procedura (vedi [Punti da confermare](#punti-da-confermare)).

Regole:

- **Migrazioni solo additive.** Nessuna colonna rimossa, nessun tipo cambiato, nessuna tabella eliminata in un colpo solo. Un cambio distruttivo richiede un piano separato e revisionato.
- **Compatibili con il codice precedente.** Il deploy di Vercel e la migrazione partono in parallelo: per un breve periodo può girare il codice nuovo sullo schema vecchio. Una migrazione che rompe il codice precedente non si fa.
- **Non esiste un rollback di migrazione.** Si rimedia in avanti, con una nuova migrazione additiva.
- **Mai `supabase db reset --linked`.** Mai `--include-seed` su un progetto remoto.
- I seed (`supabase/seeds/`) servono solo in locale e in CI. Contengono account di prova con codici noti.
- Dopo ogni migrazione che cambia lo schema, `npm run db:types` rigenera `database.types.ts`. La CI controlla che il file committato sia aggiornato.

## Keep-alive, cron e controllo

Il progetto Supabase gratuito va in pausa dopo circa 7 giorni senza attività nel database. Per evitarlo ci sono tre meccanismi.

- **Cron giornaliero di Vercel** (`vercel.json`, `0 5 * * *` UTC) chiama `/api/cron/daily`. Il job scrive sempre un heartbeat, e manda le email solo se sono accese. Vercel Hobby esegue i cron al massimo una volta al giorno, in un orario approssimato entro l'ora.
- **Workflow `keepalive.yml`** (lunedì alle 06:17 UTC):
  - in **staging** scrive e rilegge un heartbeat;
  - in **produzione** controlla che gli heartbeat del job giornaliero degli ultimi 8 giorni siano recenti (non più vecchi di 36 ore) e che nessun run abbia fallito o superato la quota.
  Se il controllo fallisce, il run diventa rosso e GitHub avvisa il proprietario del repository.
- **Controllo dall'app**: in **Altro > Info** c'è l'ultimo controllo del servizio.

Se il controllo settimanale è rosso:

1. guardate i log del cron su Vercel: il job è girato? c'è stato un errore?
2. se il database risponde `540` o "progetto in pausa", seguite la sezione [Progetto in pausa](#progetto-in-pausa);
3. una prova manuale del cron si fa chiamando la route con `Authorization: Bearer` e il valore di `CRON_SECRET` copiato dal pannello Vercel. Il valore non va scritto in chat, nei file o nei log.

Il workflow `keepalive.yml` si può lanciare a mano da `main` (`workflow_dispatch`). Su un repository pubblico GitHub disattiva le schedulazioni dopo 60 giorni senza attività: se il controllo smette di girare, il cron di Vercel resta il primario.

## Progetto in pausa

Quando il progetto Supabase è in pausa, l'app mostra "L'app è in pausa" (vedi [Servizio in pausa](../functional/servizio-in-pausa.md)). Non si riattiva da sola.

1. Aprite il pannello di Supabase, il progetto interessato (staging o produzione).
2. Premete il pulsante di ripristino del progetto (**Restore project**, con il nome esatto del pannello da verificare). Attendete che lo stato torni attivo.
3. Ricaricate l'app: se risponde, l'heartbeat successivo riporta il controllo al verde.
4. Verificate il controllo settimanale o lanciate `keepalive.yml` a mano.

**Da verificare:** una nota di architettura segnala che un progetto gratuito fermo da più di 90 giorni potrebbe non essere più ripristinabile dal pannello. Per questo vanno controllati gli export degli utenti periodicamente (vedi [Esportazione](../functional/esportazione.md)).

## Reimpostare un codice dimenticato dal pannello

È l'**ultima risorsa**. Si usa solo quando nessuno dei due partner ricorda il codice e le email sono spente. Il partner che lo dimentica può quasi sempre farselo impostare dall'altro.

1. Verificate l'identità di chi lo chiede di persona, o al telefono. Il codice non si manda mai via chat o via email.
2. Dal pannello di Supabase: **Authentication > Users**, scegliete l'utente, e impostate una nuova password (**da confermare** il percorso del menu nella versione corrente del pannello).
3. Per costringere al cambio al prossimo accesso, impostate anche `app_metadata.r2y_must_change_code = true` (**da confermare** che il pannello consenta di modificare `app_metadata`; altrimenti avvisate la persona di cambiare il codice subito).
4. Consegnate il codice temporaneo di persona. Non scriverlo in nessun file o messaggio.
5. Non toccate `r2y_founder`, né il ruolo.
6. Il cambio dal pannello **non crea un evento** in Novità: avvisate l'altro partner.

## Attivare Resend

Le email si accendono quando l'app ha un fornitore e un dominio. È un **cambio di configurazione in produzione**: serve l'approvazione del proprietario al momento. Il dominio è l'unica spesa del progetto.

1. Creare l'account Resend (piano gratuito) e acquistare il dominio.
2. In Resend aggiungere il dominio e copiare i record DNS: SPF, DKIM e DMARC. Inserirli presso il registrar, e attendere la verifica.
3. In Vercel, **ambiente Production**, impostare `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY` (Sensitive) e `EMAIL_FROM` con un indirizzo del dominio verificato.
4. In Supabase, **progetto di produzione**, impostare il **SMTP personalizzato** con i dati forniti da Resend. Le credenziali restano in Supabase, non nel repository. Il mittente è lo stesso di `EMAIL_FROM`.
5. Fare un nuovo deploy di produzione. Le variabili si leggono a runtime, ma serve una build nuova perché il valore sia applicato (**da confermare** con una prova su staging, se si decide di accendere anche lo staging).
6. Verificare in produzione, una cosa alla volta: promemoria e riepilogo arrivano una sola volta; il link di disattivazione funziona; il recupero del codice arriva; l'invito via email arriva; l'avviso "email spente" è sparito.

Per tornare indietro: rimuovete `EMAIL_TRANSPORT` e fate un nuovo deploy. Tutte le email si fermano.

Le email di staging restano spente finché non c'è una decisione esplicita di accenderle.

## Release

Il percorso è:

1. Pull request: la CI deve essere verde (lint, typecheck, unit, build, pgTAP, integration, e2e mobile, gitleaks).
2. Vercel crea la **preview**, collegata al progetto Supabase di staging, con le email spente. Il preview è protetto da Deployment Protection.
3. **Gate C**: approvazione del proprietario, dopo aver provato la preview.
4. **Merge su `main`**: parte il deploy di produzione di Vercel e, in parallelo, `migrate.yml` in produzione (con approvazione del reviewer, se ci sono migrazioni).
5. Controlli post-deploy (sotto).

### Controlli post-deploy

1. Primo accesso con le variabili di bootstrap, poi cambio del codice in app.
2. Secondo accesso con l'email di bootstrap: il codice cambiato resta valido.
3. Email o codice errati: messaggio neutro. Dopo i tentativi sbagliati previsti (per default 5 con la stessa email) scatta il blocco di 15 minuti.
4. Creazione dell'account del partner e suo primo accesso.
5. Un codice di 9 caratteri viene rifiutato dal server Auth.
6. Intestazioni e `robots` corretti (noindex su tutto).
7. Cron lanciato a mano: heartbeat in **Altro > Info**, nessuna email.
8. `keepalive.yml` verde.
9. Preview collegata allo staging.
10. `/servizio` raggiungibile.
11. Avviso "email spente" visibile.

## Rollback

- **Codice**: Instant Rollback di Vercel alla deploy precedente. Le migrazioni sono additive, quindi il codice precedente gira sullo schema nuovo.
- **Email**: rimuovere `EMAIL_TRANSPORT` e rifare il deploy spegne tutte le email.
- **Dati**: prima di un cambio rischioso, chiedete agli utenti di scaricare un export. Il piano gratuito non offre backup scaricabili.
- **Migrazione sbagliata**: si corregge con una migrazione additiva nuova. Non si cancella quella vecchia.

## Rotazione dei segreti

| Segreto | Cosa succede | Dove aggiornare |
|---|---|---|
| `SUPABASE_SECRET_KEY` | Si azzerano i contatori del limitatore di login | Vercel, GitHub (environment), `.env.local` locale |
| `EMAIL_LINK_SECRET` | Non valgono più i link di disattivazione già inviati. Gli utenti possono disattivare da Altro > Promemoria | Vercel |
| `CRON_SECRET` | Vercel Cron usa il nuovo valore dal run successivo | Vercel |
| `R2Y_BOOTSTRAP_ACCESS_CODE` | Nessun effetto sugli account esistenti (il bootstrap è create-only) | Togliere da Vercel dopo il primo accesso |
| `RESEND_API_KEY` | Le email smettono di partire fino all'aggiornamento | Resend, Vercel Production |

## Punti da confermare

- **Migrazioni delle PR su staging**: oggi `migrate.yml` le applica allo staging solo da `main` e a mano. Va deciso se servono una procedura per le PR o un avvio manuale da branch (con la regola dei branch già rispettata).
- **Stato remoto del database**: non risulta che la migrazione `core` sia stata applicata a un progetto remoto. Da verificare prima del primo rilascio.
- **Percorso del menu** per impostare una password e `app_metadata` dal pannello Supabase: da verificare nella versione in uso.
- **Pulsante di ripristino** di un progetto in pausa: il nome esatto nel pannello va verificato.
- **Ripristinabilità** di un progetto fermo da più di 90 giorni: da verificare.
- **Staging con le email**: decidere se accenderle anche sul progetto di staging, con dati finti.

## Storico delle modifiche

| Data | Feature | Modifica |
|---|---|---|
| 2026-11-24 | FEAT-2026-001 | Prima stesura del runbook: setup locale, primo utente, variabili, segreti GitHub con regola dei branch, checklist Auth, migrazioni, keep-alive, pausa, reset dal pannello, Resend, rilascio, rollback (F4, T18) |
