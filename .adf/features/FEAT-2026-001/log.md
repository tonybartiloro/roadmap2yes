# FEAT-2026-001 — decision log

## F0 intake — 2026-11-23
- Request: app web per organizzare e tracciare tutto il matrimonio di Tony e Jessica: guida passo passo (giorno, location, invitati, RSVP, abiti, testimoni, lista nozze…), budget iniziale modificabile nel tempo, UI cool, hosting free su Vercel, condivisione con gli invitati il giorno del matrimonio (foto/video).
- Product split into a roadmap: R1 (this feature) foundations + guided onboarding + timeline/checklist + budget; R2 suppliers/date/location; R3 guests/RSVP/public site; R4 dresses/witnesses/documents/registry; R5 seating; R6 wedding-day live (media, guestbook, slideshow).
- Size: L — greenfield infra, authentication, data model, personal data.
- Team: product-owner, architect (+ADR), designer, developer(s), qa, reviewer (+security round), technical-writer, release-manager.
- Developer answers (2026-11-23):
  1. Language: Italian for chat, docs and app UI.
  2. Stack OK; frontend in React.
  3. Access: Tony and Jessica now; design for future "family" and "wedding planner" roles (planner may never exist).
  4. Public repo on personal account tonybartiloro (unlimited CI minutes) → created github.com/tonybartiloro/roadmap2yes.
  5. Vercel preview per PR; merge to main = production, which for now is also the staging.
  6. Docs as Markdown in the repo; no external tracker.
  7. Desired date 3 Sep 2027 (not earlier), depends on location availability; fallback May–June or September 2028.
  8. Start with R1.
  - Nothing is decided yet: the app must guide every choice, track everything and allow revisiting choices over time.
  - Everything must be hosted for free, storage included.
- Storage research (coordinator, 2026-11-23): Supabase free = 0.5 GB DB, 1 GB storage, pauses after ~7 days inactivity; Backblaze B2 = 10 GB free, no credit card, free egress up to 3x stored; Cloudflare R2 = 10 GB free but may ask a payment method; Cloudinary free = 25 credits/month (1 credit = 1 GB storage or bandwidth), video bandwidth 1 GB on free.

## F1 round 1 — designer objections — 2026-11-23
Verdetto: brief solido sulla parte funzionale; 1 blocking (accesso/invito), 12 should, 2 note. Bozza di design in `design.md`. Terminologia: "scenario" = data/periodo candidato.

- **DES-1 (blocking) — Flussi di accesso e invito incompleti, con conflitto AC2/AC3.**
  Evidenza: AC2 dice che un nuovo utente senza matrimonio ne crea uno; AC3 dice che l'invitato entra nello spazio del primo. Se Jessica apre il link di invito e viene trattata come "nuovo utente", crea uno spazio proprio (errore irreversibile in R1: niente eliminazione, BR11). Mancano gli stati: link scaduto/già usato, link aperto su un altro dispositivo o nel browser interno di un'app di posta (iOS: sessione persa), email non arrivata, limite di invio email del piano gratuito, invito a un'email diversa da quella con cui si accede, registrazione chiusa (estraneo che accede: "permission denied"), invito revocato.
  Proposta: (a) regola esplicita: se esiste un invito pendente per l'email, l'utente entra nello spazio invitante e NON vede mai "crea spazio"; (b) login con link magico + codice a 6 cifre come alternativa (copia/incolla sullo stesso dispositivo); (c) schermate per ognuno degli stati sopra, con testo in italiano e azione ("Invia di nuovo il link", "Usa il codice"); (d) pagina "Questo spazio è su invito" per gli estranei; (e) all'architetto: verificare il limite dell'SMTP predefinito di Supabase (molto basso) e valutare SMTP gratuito dedicato. **question-for-developer D1**: confermate link magico + codice a 6 cifre? (proposta: sì).

- **DES-2 (should) — Onboarding: lunghezza, contraddizione AC6, chi risponde.**
  Evidenza: 6 domande + "saltabile"; AC6 chiede "almeno uno scenario alternativo" ma ogni passo è saltabile (contraddizione). Mancano nomi dei partner (servono a saluti, assegnatari, autore delle scelte), progresso e ripresa, e chi compila (uno solo? i due insieme?).
  Proposta: 1 domanda per schermata, max 6 schermate + riepilogo; passo 0 = i nomi ("Come vi chiamate?"); l'alternativa di data diventa facoltativa (togliere "almeno uno" da AC6); salvataggio a ogni passo e ripresa dall'ultimo; indicatore "Passo 3 di 6"; barra di avanzamento con testo; invitati come fasce (fino a 50, 50–80, 80–120, oltre, "non lo so") invece di numero libero; un solo partner può compilare, l'altro vede e modifica da Impostazioni; schermata finale "Sto preparando il vostro percorso" (momento di piacere, ≤1,5 s, saltabile con reduced-motion).

- **DES-3 (should) — Home: manca la regola per "cosa fare adesso" e la semantica del conto alla rovescia.**
  Evidenza: AC18/AC29 danno contatori, non una priorità; il brief chiede di guidare passo passo. Con più scenari di data il conto alla rovescia a quale data si riferisce?
  Proposta: card "Prossimo passo" (1 principale + max 2 secondari) con ordine: (1) decisione bloccante aperta (data → location), (2) compiti scaduti ordinati per priorità, (3) pagamenti ≤14 giorni, (4) compiti in scadenza ≤30 giorni. Conto alla rovescia: data scelta = "Mancano 284 giorni"; senza scelta = "Se fosse il 3 settembre 2027: 284 giorni" con etichetta "provvisoria" (testo, non solo colore); aggiornato per giorno, mai in tempo reale (a11y e quiete).

- **DES-4 (should) — AC20: rischio "muro rosso" alla prima apertura.**
  Evidenza: con 9 mesi diverse tappe risultano scadute alla generazione; decine di righe "in ritardo" demoralizzano e annullano l'effetto guida. Collegato a Q4.
  Proposta (risposta a Q4, question-for-developer D2): non nascondere nulla; evidenziare al massimo 3 tappe "da fare per prime" (location/data, budget, lista invitati preliminare); le altre in ritardo in una sezione "Da recuperare" con scadenza suggerita compressa (etichetta "suggerita"); tono calmo ("Questa tappa di solito si fa prima: ecco come recuperare"), niente rosso allarme, icona + testo. Nessuna compressione automatica proporzionale.

- **DES-5 (should) — Timeline su 360 px: struttura, filtri, gesti.**
  Evidenza: AC23 chiede filtri/ordinamento ma non la struttura; liste piatte da ~50–60 compiti sono ingestibili; azioni a swipe non accessibili.
  Proposta: raggruppare per fase temporale ("Adesso", "Prossimi 3 mesi", "Più avanti", "Fatti" collassata); filtri in un bottom sheet con contatore applicato; chip "Miei / Di Jessica / Tutti"; completare con checkbox 44 px (nessuno swipe obbligatorio; eventuale swipe solo come scorciatoia con alternativa); aggiunta rapida (+) raggiungibile col pollice; eliminazione con "Annulla" (snackbar 8 s) invece di conferma modale, e "Eliminati di recente" per i compiti generati (BR6: non si rigenerano).

- **DES-6 (should) — Anteprima scenario (AC22) confondibile con dato salvato; periodo → data.**
  Evidenza: durante l'anteprima le scadenze cambiano ma non sono salvate; si rischia di agire su date sbagliate. Uno scenario "periodo" (mag–giu 2028) non ha una data puntuale per calcolare gli offset.
  Proposta: banner fisso e non chiudibile "Anteprima: 3 sett 2027 — nulla è salvato" con "Esci dall'anteprima" e "Scegli questa data"; i compiti in anteprima con stile distinto (tratteggio + etichetta). **question-for-developer D3**: per un periodo l'anteprima usa il primo giorno (scadenze più prudenti), indicato in chiaro; proposta: sì.

- **DES-7 (should) — Confronto "affiancato" (AC10) impossibile a 360 px.**
  Evidenza: AC10 "confrontabili affiancate" vs AC23 360 px.
  Proposta: riformulare AC10: su mobile carte impilate con righe chiave/valore identiche e pulsante "Confronta 2" che apre una tabella con colonna etichette fissa e scorrimento orizzontale; da 768 px colonne affiancate. Pro/contro con icone più/meno oltre al colore. Opzioni scartate in sezione collassabile, mai nascoste.

- **DES-8 (should) — Decisioni: riapertura, dipendenze "da rivedere", trasparenza tra i partner.**
  Evidenza: BR1 non richiede approvazione reciproca: uno può scegliere o riaprire senza che l'altro lo sappia. AC12 parla di "dipendenze segnalate" senza UI. Storico non modificabile (BR4): un refuso nel motivo non è correggibile.
  Proposta: (a) conferma esplicita "Scegli questa opzione" con riepilogo; (b) riapertura = sheet con motivo obbligatorio (campo con contatore, errore inline); (c) badge "Da rivedere" sui compiti collegati con link alla decisione e azione "Va bene così"; (d) indicatore "Novità dall'ultimo accesso" (pallino + elenco in Home: "Jessica ha scelto la location"); (e) nello storico "Aggiungi nota" accodata (non modifica). **question-for-developer D4**: reazione non vincolante per partner su ogni opzione (preferisco / dubbioso), utile per decidere in coppia senza votazioni formali; proposta: sì, leggera, in R1.

- **DES-9 (should) — Budget: gergo e densità informativa.**
  Evidenza: "impegnato" in italiano significa anche "occupato/fidanzato", ambiguo per utenti non contabili; per categoria ci sono 5 numeri (assegnato, stimato, impegnato, pagato, residuo) su 360 px.
  Proposta: etichette "Previsto" (stimato), "Concordato" (impegnato), "Pagato", "Ancora da pagare" (residuo), "Assegnato" resta; riga categoria con 1 barra (concordato su assegnato, pagato dentro la barra) + 1 numero chiave; dettaglio al tocco; barre con testo equivalente ("62% concordato") e `role="progressbar"` o testo visibile. Aggiornare AC25–AC28 di conseguenza (solo etichette, nessun cambio di logica).

- **DES-10 (should) — Budget: inserimento importi, ripartizione, avvisi.**
  Evidenza: AC30 valida ma non dice il formato italiano (1.234,56; virgola vs punto); ripartizione con slider violerebbe WCAG 2.2 SC 2.5.7 se non c'è alternativa; "sforamento" in rosso allarme in un'app emotiva è ansiogeno.
  Proposta: input testuale `inputmode="decimal"`, accetta virgola e punto, formatta in blur con separatore, suffisso € non selezionabile, errore inline "Inserisci un importo in euro, ad esempio 1.500,00"; ripartizione con campi numerici e % di aiuto + totale non assegnato sempre visibile (sticky) — niente slider; avvisi: icona + testo + tono caldo ("Siete oltre di € 1.200 su Catering") in ambra/terracotta, non rosso pieno; riduzione del totale sotto il concordato: dialog informativo non bloccante (BR12).

- **DES-11 (should) — Stati mancanti: caricamento, errore, offline, DB in pausa, conflitto.**
  Evidenza: BR10 copre solo gli stati vuoti; BR9 prevede un avviso di conflitto senza descriverlo; il keep-alive può fallire (pausa Supabase).
  Proposta: skeleton per liste/card; errore con messaggio umano + "Riprova" e dati già mostrati mantenuti; banner "Sei offline" (testo+icona), i moduli conservano la bozza locale e il pulsante Salva avvisa invece di perdere dati; pagina "Il servizio si sta svegliando, riprova tra un minuto" per DB in pausa; conflitto = dialog "Jessica ha modificato questo elemento 2 minuti fa" con "Vedi cosa è cambiato / Salva comunque / Annulla"; aggiornamenti ottimistici con rollback e toast. **question-for-developer D5**: in R1 solo online con bozze locali, niente modifica offline; proposta: sì (costo molto inferiore, scenario d'uso casalingo/ufficio).

- **DES-12 (should) — Accessibilità: il brief dice WCAG 2.1 AA "indicativo"; il target è 2.2 AA.**
  Proposta: portare l'NFR a WCAG 2.2 AA verificabile. Criteri nuovi rilevanti: 2.4.11 focus non oscurato (la barra di navigazione fissa e le barre d'azione sticky non devono coprire il campo a fuoco: `scroll-padding`), 2.5.7 alternative al trascinamento, 2.5.8 target ≥24 px (noi: ≥44 px per le azioni primarie), 3.3.7 niente dati da reinserire (bozze), 3.3.8 autenticazione accessibile (link magico + codice copiabile, nessun test cognitivo). In più: contrasto testo ≥4.5:1 e componenti UI ≥3:1 (token validati in design.md), stato mai solo cromatico, dialog/sheet con focus trap e ritorno del focus, annunci `aria-live="polite"` per toast, `prefers-reduced-motion`, testo ridimensionabile al 200% senza scroll orizzontale, `lang="it"`, font input ≥16 px (niente zoom iOS).

- **DES-13 (should) — Navigazione non definita e da far scalare a R2–R6.**
  Evidenza: il brief non descrive l'IA; R2–R6 aggiungono Fornitori, Invitati, Abiti, Tavoli, Giorno live: una barra a 5+ tab non regge.
  Proposta: barra inferiore a 4 voci + "Altro": Home, Percorso (timeline), Scelte (decisioni), Budget, Altro (impostazioni, esportazione, aree future); da 768 px sidebar a sinistra con le stesse voci; "Scelte" resta tab perché R2–R4 la popolano. Dettagli in `design.md`.

- **DES-14 (note) — Tono e lessico in italiano.**
  Proposta: tono caldo, sobrio, mai colpevolizzante; "voi" per testi di coppia ("la vostra data"), nomi propri per attribuzioni ("Jessica ha completato…"); niente emoji nei testi di sistema; stati vuoti con una frase + un'azione; formule neutre rispetto al genere; avviso legale breve "Indicativo: verificate con il comune/la parrocchia" come testo secondario visibile nelle tappe burocratiche. **question-for-developer D6**: "voi" (proposta) vs "tu".

- **DES-15 (note) — Dettagli da chiudere.**
  (a) AC9: i "compiti suggeriti nuovi/non più pertinenti" richiedono una casella "Suggerimenti da rivedere" (accetta/ignora) in Percorso; (b) esportazione: pulsante in Altro con stato di avanzamento e nome file con data; su Safari iOS usare il foglio di condivisione/download, promemoria opzionale "ultimo backup: …" ; (c) tema chiaro/scuro/sistema, entrambi con token validati; (d) PWA: manifest e `theme-color` anche se l'installazione resta nice-to-have; (e) LCP < 3 s: font self-hosted e sottoinsiemi (max 2 famiglie, 3 pesi), nessuna immagine pesante in Home; (f) `noindex` anche sulla pagina di login.

### Domande per lo sviluppatore (proposta tra parentesi)
D1 link magico + codice a 6 cifre (sì); D2 tappe in ritardo: max 3 in evidenza, il resto "Da recuperare" con scadenza suggerita (sì, = Q4); D3 periodo → anteprima dal primo giorno (sì); D4 reazione non vincolante per partner sulle opzioni (sì); D5 R1 solo online con bozze locali (sì); D6 "voi" (sì); D7 direzione visiva A "Giardino" o B "Sera" (consiglio A).

## F1 round 1 — architect objections — 2026-11-23
Verdict: feasible on free tiers with changes. 2 blocking, 5 should, 5 note. Evidence refers to `brief.md:<line>`; greenfield, so no code evidence exists. Vendor limits are as of late 2026 and must be re-checked in F2.

- **ARC-1 (note) — Stack: Next.js App Router vs Vite SPA.** Evidence: brief.md:14 (free deploy), AC1/AC3/AC33 need a few server-side endpoints (cron keep-alive with secret, noindex headers, auth callback). A Vite SPA works with Supabase + RLS, but it would need Supabase Edge Functions for the server-side pieces and gives a slower first paint than SSR for the LCP < 3 s NFR. **Proposal: Next.js (App Router) + TypeScript on Vercel Hobby**, with these rules. RLS is the only authorization boundary. Every query runs with the user's JWT through `@supabase/ssr`, from server components, server actions or the client. The service-role key appears only in the server-only cron route. Authenticated routes are dynamic, and user data is never cached (`no-store`). Optimistic UI covers "perceived immediate". Alternative recorded for the plan: Vite SPA + Edge Functions (simpler mental model, more moving parts across two platforms).

- **ARC-2 (blocking) — AC2 contradicts invite-only access (Q2) and leaves the public app open.** Evidence: brief.md:55 (AC2: "any new authenticated user without a wedding creates their own space") vs brief.md:135 (Q2: only invited users get in). With Supabase defaults, anyone can request a magic link, create an auth user and a wedding on the public URL, using up free-tier email quota and DB space. **Proposal:**
  - (a) Disable public sign-ups in Supabase Auth. The 2 bootstrap accounts are created by the owner from the Supabase dashboard, with zero app code and no service role in the app. A magic-link request for an unknown email gets a neutral message (no account enumeration).
  - (b) Reword AC2 to "a user with an account (created by invitation) and no wedding…".
  - (c) Reword AC3 so the partner invite is an in-app invitation tied to the wedding:
    - a single-use token stored hashed, expiring after 7 days, revocable, bound to the invitee's email;
    - the link can be shared by any channel (WhatsApp is fine);
    - it is accepted through a SECURITY DEFINER DB function that checks email match, expiry and the "max 2 partners" rule, enforced in the DB with a lock against races.
  - (d) The allowlisted emails must never be in the repo (public), only in Supabase.
  - question-for-developer: confirm "sign-ups closed; accounts created manually from the Supabase dashboard + in-app invite to join the wedding". Proposed answer: yes.

- **ARC-3 (blocking) — Email delivery for magic links on Supabase free.** Evidence: brief.md:135 (magic link), brief.md:56 (invite via email). Supabase's built-in SMTP only delivers to members of the project's organization and is rate-limited to a few emails per hour per project. Resend free needs a verified owned domain to email arbitrary recipients. Without custom SMTP, Jessica cannot receive her login link unless she becomes a member of the Supabase org, which would give her dashboard access to the DB.
  - **Proposal:** configure custom SMTP in the Supabase dashboard. The credential lives only there and never in the repo. Free options: (1) Gmail SMTP with an app password from the owner's Google account (needs 2FA, ~500/day, no domain); (2) Brevo free (300/day, single verified sender).
  - Use the Supabase email template with `token_hash` (`/auth/confirm?token_hash=…`, verified server-side), so the link works even when it opens in a different browser from the one that requested it (iOS Mail/Gmail in-app browser). Also include the 6-digit OTP code in the same email as a fallback, which covers an installed PWA whose storage is separate from Safari.
  - Sessions use long-lived refresh tokens, so logins stay rare.
  - question-for-developer: which sender, and do you own a domain? Proposed answer: Gmail app password, no domain in R1.

- **ARC-4 (should) — Keep-alive (AC33): it can't be tested as worded, and both free schedulers have limits.** Evidence: brief.md:91.
  - Vercel Cron on Hobby runs at most once a day, at an imprecise time within the hour, and only on the production deployment.
  - GitHub Actions `schedule` on a public repo is auto-disabled after 60 days without repo activity, can be delayed or dropped, and its logs are public.
  - **Proposal:**
    - Primary: a daily Vercel Cron calls `/api/keepalive`. The route is protected by `CRON_SECRET` and makes a real DB round-trip: a service-role call to a `keepalive()` function that upserts a heartbeat timestamp.
    - Secondary: a weekly GitHub Actions ping of the same endpoint. It prints nothing but the HTTP status and also covers the staging project (ARC-5).
    - Reword AC33: "a daily scheduled job runs a DB query and records a heartbeat timestamp visible in the app/DB; a failure is reported by the scheduler's notification". Then the route can get an integration test.
  - Note: a project paused for more than 90 days can no longer be restored from the dashboard, which is one more reason for ARC-12.

- **ARC-5 (should) — Previews must not share the production DB; migration order on merge.** Evidence: project.md deploy ("preview per PR = staging; merge = production"), brief.md:117 (versioned migrations).
  - A PR preview runs unmerged code. Against the production DB it would either break (schema not yet migrated) or need unreviewed migrations applied to real data.
  - **Proposal:**
    - Create a 2nd free Supabase project, "staging" (the free plan allows 2 active projects), with fake seed only. Vercel Preview env vars point to it and Production env vars to prod.
    - A GitHub Action runs `supabase db push`: to staging on PR (or on demand) and to prod on merge to main, with secrets in GitHub Actions secrets.
    - Because Vercel deploys the merge in parallel, migrations must be backward-compatible (expand/contract, additive in R1).
    - Turn on Vercel Deployment Protection for previews.
    - Add the preview URL glob to the Supabase Auth redirect allowlist.
  - Needs developer approval (one more free project to create and keep alive). project.md → deploy should be updated in F2.

- **ARC-6 (should) — The decision primitive is ambiguous where it meets the date scenarios and the timeline.** Evidence: brief.md:60, 67, 68, 70, 72, 78. **Proposal:** add these rules to the brief:
  - (a) The date scenarios entered in onboarding *are* the options of the "Data del matrimonio" decision. There is a single source, and one option is flagged "obiettivo".
  - (b) Reference date for the timeline: the chosen option if the decision is taken, otherwise the target option. For a period option ("maggio–giugno 2028"), use the period's **start** date (conservative).
  - (c) In R1, "dependencies flagged" in AC12 means only date → timeline: a banner says "data riaperta: scadenze calcolate sull'ultima data scelta". No generic dependency graph.
  - (d) Reword AC15 from "without changing existing tables" to "with additive migrations only". Common fields are columns, and type-specific option fields go in a `jsonb attributes` validated per decision type.
  - (e) History is immutable at DB level: an append-only events table with SELECT/INSERT-only RLS and no UPDATE/DELETE. Choose and reopen are single DB functions (RPCs) that change the state and write the event atomically.
  - (f) In reality, date and location are coupled (location availability on a date). R1 keeps two independent decisions plus notes, and moves date×location pairing to R2 (add it to Out).

- **ARC-7 (should) — Recalculating the timeline needs provenance and tombstones; Q4 compression is costly.** Evidence: brief.md:75, 76, 63, 101, 137. **Proposal:**
  - Every generated task stores `template_key`, `template_version`, its offset and a `due_overridden` flag. AC19 then means "recompute where not completed and not overridden".
  - Deleting a generated task is a soft delete (tombstone). Otherwise the AC9 "new suggested tasks" diff would re-suggest tasks the user deleted, against BR6.
  - Offsets are expressed in months/weeks/days with date-only arithmetic and end-of-month clamping (e.g. 31 → 28/29), with no time zone. "Today" for the countdown/overdue is computed in Europe/Rome.
  - Q4: no automatic compression in R1. Overdue tasks keep their computed date, appear under "in ritardo / da fare subito" and are sorted by the template's priority. A suggested compressed deadline is a follow-up.
  - The AC22 preview is a pure client-side computation (no writes), which is cheap if the timeline engine is a pure, unit-tested TS function.

- **ARC-8 (should) — The scope of "history" and concurrency (BR9) are undefined and cost effort in every form.** Evidence: brief.md:81, 105. AC24 versions only the total, and it is unclear whether category allocations and items need history. **Proposal:**
  - Keep an explicit `budget_versions` table (AC24), plus one generic append-only `audit_log` trigger on all domain tables (actor, time, old/new jsonb). That gives history of everything for one migration and feeds the export.
  - R1 shows a history UI only for the budget total and decisions.
  - BR9 uses optimistic concurrency: an integer `version` column and a conditional update. 0 rows updated means "modificato da un altro partner" with reload/overwrite. No realtime and no merge UI.
  - AC30 is enforced in the DB as well (CHECK `amount_cents >= 0`, integer cents).
  - Totals are computed in pure TS functions (unit-tested). If SQL views are used, they must be `security_invoker = true`, otherwise they bypass RLS.

- **ARC-9 (note) — RLS / role model (AC4, AC5) is feasible as written.**
  - `memberships(wedding_id, user_id, role enum partner|family|planner)`, with no uniqueness on user_id, so a planner can have several weddings later. The R1 UI assumes one wedding.
  - A single SECURITY DEFINER helper `has_access(wedding_id, area, action)` maps role → permissions. Enabling read-only family later means changing that mapping, not every policy.
  - A CI check fails if any table in `public` has RLS disabled.
  - AC1/AC4 are tested on a local Supabase with two fake users plus anon-key requests to the data API (PostgREST).

- **ARC-10 (note) — Storage: R1 needs none; R6 free strategy.** Evidence: brief.md:111. R1 has no uploads (location candidates are links; document upload is R4), so the R1 NFR is consistent. Add "R1 non introduce storage di file". The R6 outline, which needs no change to the brief now:
  - A provider adapter over the S3-compatible API (B2 primary: 10 GB, no card; R2 or Supabase Storage as alternates).
  - Direct browser uploads with presigned URLs minted by a Vercel function. Files never pass through Vercel: the Hobby function body limit is ~4.5 MB and bandwidth is capped.
  - Client-side compression: photos resized to ~2048 px (≈0.5 MB) plus a client-made thumbnail. Videos capped (e.g. ≤60 s, ≤100 MB, no client transcoding). Per-guest quotas.
  - A private bucket with presigned GET. Watch B2's free daily download-transaction cap (~2,500/day) for slideshows: serve thumbnails and batch.
  - Post-wedding: a ZIP export to personal storage, then purge.
  - Budget: ~150 guests × 20 photos ≈ 1.5 GB plus ~5 GB of video fits in 10 GB. Guests' photos are third-party personal data (consent/notice in R6).

- **ARC-11 (note) — CI on free GitHub Actions is feasible.** Standard runners are free and unlimited for public repos. Pipeline:
  - lint, typecheck and Vitest unit tests;
  - DB tests via the Supabase CLI local stack (Docker, ~2-4 min startup);
  - Playwright e2e against a local Next build + local Supabase, reading magic links/OTP from the bundled Mailpit, with no real email and no remote DB.
  - AC34: gitleaks over full history + GitHub secret scanning/push protection. Run logs and artifacts of a public repo are public, so they must contain only fake data and no DB dumps.
  - The Vercel preview is built by Vercel, outside CI.

- **ARC-12 (note) — Backups on the free plan.** As far as I know, Supabase free offers no downloadable/restorable backups (verify in F2), so AC31 export is the real backup. **Proposal:** the home shows "ultimo export: N giorni fa" with a reminder after 30 days (cheap). The technical docs describe a local `supabase db dump` procedure. Dumps are never stored in the repo or in CI artifacts.

Questions for the developer (from this round): ARC-2 (closed sign-ups + manual accounts — proposed yes), ARC-3 (SMTP sender — proposed Gmail app password, no domain), ARC-5 (approve a 2nd free Supabase project for staging — proposed yes).

## F1 round 1 — product-owner responses — 2026-11-23
Brief rewritten (AC renumbered 1–45, Q1–Q14 merged). Business choices stay open as questions.
- ARC-1 → accepted as note: stack choice goes to the F2 ADR; brief unchanged (NFR keeps server-side/noindex/RLS constraints).
- ARC-2 (blocking) → accepted: AC2–AC7, BR12–BR13, Q2.
- ARC-3 (blocking) → accepted: AC8–AC9, Q3 (link + 6-digit code).
- ARC-4 → accepted: AC44 reworded (daily job + heartbeat + weekly secondary).
- ARC-5 → accepted, pending developer approval: AC43, NFR cost, Q4.
- ARC-6 (a–f) → accepted: AC14, AC20, AC21, AC23, AC24; date×location pairing to R2 Out.
- ARC-7 → accepted (provenance, tombstones, date-only offsets: AC28, AC31, BR5–BR6); no auto compression (Q6).
- ARC-8 → accepted: BR9, BR14, AC38; history UI only for budget total and decisions.
- ARC-9 → accepted: AC11, roles table. ARC-10 → accepted: "R1 senza storage" in scope Out/NFR.
- ARC-11 → accepted: AC43, AC45, NFR quality (details in plan).
- ARC-12 → accepted: AC42 (export reminder).
- DES-1 (blocking) → accepted: AC3–AC9, BR13.
- DES-2 → accepted: AC12–AC13 (names, fasce invitati, "almeno uno" removed).
- DES-3 → accepted: AC26–AC27.
- DES-4 → accepted in part: AC29 (max 3 highlighted, "Da recuperare", calm tone); "suggested compressed date" deferred to follow-up (cost, ARC-7), Q6.
- DES-5 → accepted: AC30–AC31 (groups, no mandatory swipe, undo, recently deleted).
- DES-6 → accepted: AC32, Q10.
- DES-7 → accepted: AC17.
- DES-8 → accepted: AC18–AC22, AC41, BR1; reactions kept as Q11 (scope extra).
- DES-9 → accepted: labels Previsto/Concordato in AC35–AC37, BR15.
- DES-10 → accepted: AC34, AC37, AC38.
- DES-11 → accepted: AC39–AC40; Q12.
- DES-12 → accepted: NFR WCAG 2.2 AA.
- DES-13 → accepted: NFR navigation (5 voci incl. Altro, sidebar from 768 px).
- DES-14 → accepted: BR15, Q13.
- DES-15 → accepted: AC16 (suggestions box), AC42 (export), NFR (theme, PWA manifest, fonts, noindex login), Q14.
Totals: 27 objections, 27 accepted (1 in part), 0 rejected.

## F1 developer answers (round 1 questions) — 2026-11-23
- Storage: developer asks to use ONLY Supabase (do not fragment the stack). Coordinator position: Supabase Storage is enough for R1–R5; R6 (wedding-day media) starts on Supabase Storage too, behind a small storage interface, with client-side compression/thumbnails and caps; the free limits (1 GB storage, 50 MB/file, ~5 GB egress/month) are re-evaluated with real numbers when R6 is planned. No Backblaze/R2 now.
- Q1 decision primitive in R1: approved.
- Q2 access: approved as closed/invite-only, BUT the developer wants an onboarding flow that collects BOTH partners' data: email, first name, last name, date of birth for the groom and the bride (editable later); the second partner receives the invite from that data.
- Q3 email: developer asks whether Vercel/Supabase/Resend can send email, wants as few services as possible; no domain yet, plans to buy "roadmap2yes" domain. Coordinator proposal: buy the domain, use Resend (free tier) as the single email provider — both as Supabase Auth custom SMTP and for app emails. Vercel has no email sending; Supabase built-in email is only for org members and heavily rate-limited.
- Q4 staging: OK; developer asks to use Vercel environments instead of duplicating projects. Coordinator: one Vercel project with Preview/Production environments (no duplication on Vercel); the Preview environment variables point to a second free Supabase project (the DB must be separate, Vercel environments do not isolate data).
- Q5 rite: chosen in onboarding (civil / Catholic with civil effects / symbolic), editable later.
- Q6 overdue milestones: approved.
- Q7 single couple budget: approved.
- Q8 reminders: CHANGED — email reminders wanted: to both partners for shared deadlines, only to the groom or only to the bride for tasks assigned to them (tasks need an assignee: both / partner A / partner B).
- Q9 style label + note: approved.
- Q10 date scenarios: approved, plus: a scenario can be a fixed date (usually set by the chosen location) or a period, and there can be several scenarios at once (e.g. Sep 2027, May–Jun 2028, Sep 2028).
- Q11 partner reactions: approved.
- Q12 online-only: approved (local form drafts = text kept if the page is closed mid-form; developer is fine with it).
- Q13 tone: CHANGED — informal "tu" (second person singular to the logged-in person), very informal.
- Q14 visual direction: A "Giardino" preferred, but the developer wants at least 10 theme proposals; the couple should be able to pick the theme during onboarding among the themes the developer approves at Gate B.

## F1 round 2 — product-owner update — 2026-11-23
Brief updated (AC1–AC53; new AC46–AC53). Decisions D8–D23 record all 14 answers.
- Changed: onboarding now collects both partners (email, name, surname, optional DOB) and sends the invite from it (AC5, AC12–AC14); generic partner A/B model with couple-chosen label (AC46); DOB minimal use (AC47, BR17); rite editable with recalculation (AC48); couple-chosen theme from >=10 candidates approved at Gate B (AC49, BR18); email reminders and weekly digest in scope, assignee both/A/B (AC31, AC50–AC53, BR16, BR19); date reference = fixed/chosen date, else earliest open scenario (AC24, BR3); Resend + own domain, no Vercel/Supabase email (AC9); tone "tu" (BR15; designer to rewrite copy samples); storage Supabase only, R1 none (scope, NFR, D8); one Vercel project + 2nd Supabase for Preview (AC43, D13).
- Access mechanism for the first account left to the architect (allowlist vs manual), constraint: no stranger can sign up (AC3, BR12).
- Remaining questions: Q1 reminder cadence, Q2 provisional reference date, Q3 domain timing/name, Q4 light/dark per theme, Q5 DOB necessity.

## F1 — final changes before Gate A — 2026-11-23
- Approved: reminder cadence (D24, "(proposta)" markers removed from AC50/AC51), provisional reference date (D28), light+dark for every theme (D25).
- Domain not chosen: everything developed and tested locally (Docker, local Supabase, mail catcher); AC9 now states the dependency; release to Jessica waits for the domain (D27).
- Date of birth removed entirely (D26): AC47 and BR17 marked "Rimosso", numbering kept; AC12/13/45/46 and scope reworded.
- Open questions: none (domain name deferred, non-blocking). Active AC: 52 (AC1–AC53, AC47 removed).
- Reference scenario rule refined (developer, 2026-11-23): always exactly one reference scenario, "provvisorio" by default (earliest open) and manually changeable, "definitivo" once the date decision is taken, back to "provvisorio" on reopen; preview never changes it and offers "Imposta come riferimento" (AC24, AC32, BR3, D28; numbering unchanged).

## Gate A — 2026-11-23
- Developer approved the requirements (brief.md, 52 active AC) in chat: "Sì, approvo".
- Phase → F2. Note for F2: design.md still mentions date of birth (removed by D26) — designer to clean up while finalising.

## F2 round 1 — product-owner objections — 2026-11-23
Verdict: plan covers all 52 active AC (every AC appears in at least one task and in the test plan), respects D1–D28 (no date of birth, reference rule, cadence, "tu" in email templates, Supabase-only, Resend only, themes at Gate B) and adds almost nothing out of scope. 0 blocking, 5 should, 4 note.

- **PO-1 (should) — Reopening a date decision: discarded scenarios.** Evidence: plan §3/§5, AC18 (the other options become "scartate") vs AC19/AC24. `reopen_decision` is described only as setting `manual_reference_option_id`; nothing says the discarded options become selectable again. Without it, after a reopen the couple cannot choose among the other scenarios and the "earliest open scenario" fallback has nothing to pick. Proposal: reopen puts discarded options back to `candidate` (history keeps the earlier outcome); add a pgTAP case.
- **PO-2 (should, question-for-developer) — Choosing a "period" scenario as the date.** Evidence: BR3/AC24 allow period scenarios; AC18 allows choosing any option; plan uses `date_from` as reference. A "definitivo" reference computed on the first day of "maggio–giugno 2028" is not really definitive and would drive reminders. Proposal: when the couple chooses a period, the UI asks for the exact day inside it (the scenario becomes a fixed date); or the scenario stays "provvisorio" until an exact date is entered. Not in the brief: needs the developer.
- **PO-3 (should) — Date-independent key tasks buried when no date exists.** Evidence: plan §5 phases: tasks with no `due_date` go to "Più avanti"; "Adesso" = overdue `highlightFirst` + due within 30 days. With no reference date (AC15) "Scegli la data", budget, preliminary guest list and "Scegli il rito" (P4) would be in "Più avanti", while design.md mock-up and AC15 want them first. Proposal: open `highlightFirst` tasks (and "Scegli il rito") always go to "Adesso", with or without a date.
- **PO-4 (should, question-for-developer) — Reminder volume and clustering.** Evidence: AC50 (one reminder per task), plan §7 `task_7d` with "recupero dei giorni persi", cap 50/day. Template tasks cluster on the same offsets, and a date change or first activation (C2) can put dozens of tasks in the 7-day window at once; a task that enters the window already inside it would say "tra 7 giorni" when it is 3. Proposal: (a) one email per user per day listing all that user's tasks (7 days before / due today), instead of one email per task; (b) the "7 days" email is skipped for tasks whose date was set or changed inside the window (the due-day email and the Monday digest cover them); (c) recovery only for missed cron runs. Wording of AC50 would change from "un promemoria" to "un'email con i promemoria del giorno".
- **PO-5 (should, question-for-developer) — Per-task `reminders_enabled` is not in the brief.** Evidence: plan §3 `tasks.reminders_enabled` and T11 "promemoria" toggle; brief only has per-user opt-out (AC52); no test in the test plan. Small, but it is scope and untested. Proposal: drop it for R1 (lean); if the developer wants it, add an AC.
- **PO-6 (note) — Provisional deadlines in reminder emails.** Evidence: AC24, AC50. Deadlines derived from a "provvisorio" reference can still move. Proposal: the email says "scadenza calcolata sulla data provvisoria" when the reference is provisional.
- **PO-7 (note) — Budget: allocation above the total.** Evidence: AC34 (unassigned always visible), plan §6 warnings list (no case for Assegnato > totale). Proposal: show it as "oltre di € X" with the same warm warning instead of a negative number; not blocking.
- **PO-8 (note) — Wording alignments for the brief/design.** (a) AC12 example says "Passo 3 di 6" but the plan has 8 steps (AC12 lists 8): I will fix the example in the brief change log. (b) AC39 text "il servizio si sta svegliando, riprovate tra un minuto" is wrong for a paused free project (plan R9): accept the architect's point; page should say the service is paused and to tell whoever runs the app (no hard-coded name); I will propose the AC39 wording change in the change log. (c) design.md copy samples are still in "voi" (BR15/D22 = "tu") besides the date of birth: add to P7. (d) `complete_onboarding` and onboarding without partner B (AC13 allows skipping): plan does not say that the partner B row/slot is optional and how "assignee B" shows before B exists — confirm in T8/T10 (partner B optional, assignee B shown by label, invite later from Altro).
- **PO-9 (note) — Content ownership.** The milestone content (T4, BR7) is a product-owner deliverable and T4/T8 depend on it: I will provide it as a Markdown spec (milestone key, title, advice, offset, rites, priority, highlight/bureaucratic flags) before T4 starts, marked "indicativo, verificare con comune/parrocchia".

### Product view on the architect's questions (to the developer, not decided here)
- **P2 two-step release (C1 Tony only, C2 after domain):** agree. It gives them a usable app this week for the urgent date/location decision and respects D27. Caveats to state at Gate C: in C1 AC9 and AC50–AC53 are not yet verifiable (verified at C2); the partner B invite is created but not emailed (UI shows a copyable link, the 7-day expiry may lapse before C2, so "Invia di nuovo" must work then); Tony uses the built-in Supabase email only for his own login.
- **P3 partner email read-only after acceptance (editable for B before acceptance):** agree; AC46 reads the same way. Note the A email also equals the allowlist entry, so a typo there is a developer fix; show a short hint ("l'email è il tuo accesso").
- **P4 rite "Non lo so ancora" → common tasks + task "Scegli il rito":** agree; matches AC15/AC48. With PO-3 it should appear in "Adesso".
- **P5 deleting a category with items requires moving them first:** agree (avoids silently losing tracked money); the category's allocation returns to "non assegnato" and empty categories delete with Annulla. This narrows "eliminabili" in AC34 to the empty case; developer confirms.
- **P6 partner B reminders/digest only after acceptance:** agree; no backfill when B joins (the first Monday digest starts then). Shared deadlines before that go to A only.

## F2 round 1 — QA objections — 2026-11-23
Verdict: plan changes needed (2 blocking). Every active AC (52) appears in the test plan at some level; the weak spots are not missing rows but missing test infrastructure decisions (clock, auth rate limits, mailbox, failure injection), DB-level invariants the tests would need as an oracle, and test ownership/timing. Counts: 2 blocking, 11 should, 4 note.

Coverage read-out: AC1-8, 10-13, 18-24, 28, 33, 38, 52, 53 are well mapped (pgTAP + integration + e2e). Explicit manual/non-automatable with reason: AC9 (real Resend, needs domain), AC43 "merge deploys production" and "preview uses staging" (Vercel/GitHub settings, release-manager post-deploy check), AC44 "failure is notified by the scheduler" (workflow_dispatch with a forced failure, once), AC45 history scan (gitleaks is automated; "no real data in logs/artifacts" is a reviewer checklist). Tone "tu" and the Italian copy: manual copy review (no automated oracle). Thin: AC17/AC37 (icon+text, text-equivalent bars: need axe + explicit assertions), AC38 numeric keyboard (`inputmode`) not asserted anywhere, AC27 only unit (add one e2e for "1+2 max"), AC30 filters (stato, categoria, assegnatario, scadenza) only named generically.

### Blocking
- **QA-1 (blocking) — Invariants enforced only in server actions cannot be proven (and are bypassable by a partner via PostgREST).** Evidence: plan §5 "modificare a mano la scadenza imposta `due_overridden = true` (server action)"; §3 grants UPDATE only on `decisions.question` but nothing equivalent for `decision_options.status`, `decision_events` INSERT, `tasks.completed_*/deleted_*/due_overridden/source/template_key`, `wedding_id`, `version`, `created_by`, `option_reactions.user_id`. A partner with a valid JWT can call the API directly (AC10/AC21 say "neppure via API"); e.g. set `decision_options.status='chosen'` (breaks AC18 atomicity), edit `due_date` without `due_overridden` (next `sync_timeline` silently overwrites it, AC28), forge a `decision_events` row (AC21), move a row to another `wedding_id`. Proposal: plan states per table the column-level grants / `with check` / triggers (`wedding_id` and `created_by` immutable, `due_overridden` set by trigger when `due_date` changes on a template task, option `status` and decision events only through RPC/trigger). QA adds a generated "forbidden direct writes" pgTAP + PostgREST matrix as the oracle (QA-7).
- **QA-2 (blocking) — Injectable clock is under-specified; `E2E_FAKE_TODAY` as a process-wide env var breaks parallel e2e and is a prod risk.** Evidence: plan §5 (T4 `clock.ts` "orologio finto solo con `E2E_FAKE_TODAY` fuori da Vercel"), test plan rows AC26/AC42/AC50/AC51. One `next start` with one fake date serves all Playwright workers, so countdown, "ultimo export 30 giorni", reminders and normal specs conflict; `page.clock` only moves the browser, while invitation expiry, 8 s undo, 30 s resend, "2 minuti fa" and audit times use server/DB `now()`. Proposal: (a) every time-dependent pure function takes `now`/`today` as a parameter (already true for `planReminders`, `groupTasks`; make it a rule for countdown, nextSteps, export reminder, news); (b) the job is `runDailyJob({ clock, sender, db })` with the route as a thin wrapper, so integration tests call it directly at any date; (c) for e2e pages, override only via a request header/cookie honoured when `E2E_CLOCK=1` is set at build/start (never set on Vercel, plus a unit test that `VERCEL`/`NODE_ENV=production` ignores it) and time-dependent specs run in a separate serial Playwright project; (d) DB-time cases (invite expiry, token age) are tested by `update ... set expires_at` as superuser, not by waiting. Needed before T4/T16 fix the `clock.ts` contract.

### Should
- **QA-3 (should) — Local Auth rate limits and the 30 s cooldown will make e2e fail or crawl.** Evidence: AC8, plan §4 (`max_frequency = "30s"`), T1 config. Supabase local default `auth.rate_limit.email_sent` is low (2/hour); every login in every test sends an email, and re-requesting the same address within 30 s is rejected. Proposal: T1 sets a high `email_sent` and OTP limits in the local/CI `config.toml` (documented as test-only; staging/prod keep real values, `config push` must not carry them); QA fixtures create a unique user per test; a `loginAs(user)` helper (admin `generateLink` + `verifyOtp`, no mailbox) is used by all non-login specs, and only the login specs use the real mailbox flow. The "Invia di nuovo disabilitato 30 s" check runs with the real cooldown once, tagged `@slow`, and the "429 message" case needs a real trigger (low per-test limit via a second Auth config is too heavy), so keep the unit mapping and add one integration test that forces GoTrue's limit with a scripted burst.
- **QA-4 (should) — AC2 can leak account existence through rate-limit/cooldown and timing, which the test plan does not exercise.** Evidence: plan §4 step 2 "gestisce in chiaro gli errori di limite (429) e di attesa di 30 s" vs "stesso messaggio neutro". For an unknown email with `shouldCreateUser:false` no email is sent and no cooldown is recorded; for a real user the second request inside 30 s returns a cooldown/429. Entitled emails also run `createUser` (slower). Proposal: the cooldown/limit message is produced by the app layer identically for any email (per-email-hash counter, or client timer plus a generic "riprova tra poco" for every provider limit error); integration test: for {unknown, entitled-new, existing user} send twice within 1 s and assert identical status, body, headers and no more than a coarse timing difference (assert on payload, report timing only as a note). Add `next=` open-redirect cases post-login.
- **QA-5 (should) — Reminder job: crash windows, overlapping runs, flooding and week keys.** Evidence: plan §7 step 5-6, R3. (1) Crash after claim and before send leaves `claimed` forever (unique blocks a re-claim, retry is only for `failed`): the reminder is silently lost, contradicting "retried with the same key". Proposal: stale `claimed` (> N min) is re-takeable with the same idempotency key; tests with injected failure at three points (before send, send throws, after send before `sent`). (2) Two overlapping invocations (Vercel retry) via `Promise.all` → exactly one email per (user, kind, task, date). (3) `unique(user_id, kind, task_id, due_date)` means every due-date change creates a new reminder: changing the reference date shifts all template tasks and can send a burst against `EMAIL_DAILY_CAP`; test "reference changed, 40 tasks move into the 7-day window" and assert cap + `skipped_quota` + heartbeat signal. (4) Digest `period_key` ISO week: vectors for 2026-W53/2027-W01 boundaries; digest only on Monday means a missed Monday run loses it. (5) The monthly cap counts only app emails while Auth emails (login, invite) share the Resend quota: either count both or state it; test that cap math is explicit. **question-for-developer (proposed answer: yes)**: if the Monday run is missed, send the digest on the next run within Mon-Wed, still once per ISO week?
- **QA-6 (should) — "2-partner cap under concurrency" cannot be tested in pgTAP, and the real race paths are not listed.** Evidence: test plan "Inviti" row (Promise.all of two acceptances). pgTAP runs in one session; the unique constraint is proven only by two real connections. The two realistic races are the same user double-submitting `accept_pending_invitation` and `create_wedding` double-submit with a single allowlist email (second call must not create a second wedding nor reuse the consumed row), plus accept vs revoke and accept vs "Invia di nuovo" (token rotation). Proposal: QA-owned integration tests with two independent PostgREST clients (and a raw `pg` pair for the constraint), asserting exactly one membership B, one wedding, deterministic outcome codes (`ok`/`used`/`revoked`), no 500s. Also a direct `INSERT INTO memberships` by an authenticated user (own user_id, any wedding, role partner) must be denied.
- **QA-7 (should) — RLS isolation tests should be generated from the catalog, run through the real API, and include grants and the audit/hash leak.** Evidence: plan Test plan "Isolamento", "Modello", §3 invitations/audit/heartbeats. Proposal: (a) a pgTAP/Vitest generator iterates `information_schema` so a new table or function without an explicit policy-matrix entry fails CI (hand-written per-table tests drift in R2-R6); (b) the same matrix is executed over PostgREST with real GoTrue JWTs (pgTAP impersonation with `set local role` + claims can mask role-grant and `auth.email()`/JWT problems); (c) grants audit: EXECUTE on every `public` function for `anon`/`authenticated` against an allowlist, `private` schema not in `config.toml` exposed schemas, `is_entitled_email`/`record_heartbeat` callable only by the secret role; note the plan calls `rpc/record_heartbeat` in keepalive while the function is in `private` (not exposed): needs a public wrapper granted to `service_role` only; (d) `audit_capture` on `invitations` would copy `token_hash` into `audit_log.new`, readable by partners with the `history` area and exported (AC42): exclude `token_hash` (and any secret column) from the trigger payload, with a test; (e) adversarial invite cases (token of another wedding, hash timing, expired-then-resent old token, accept by logged-in member of another wedding, invitation for an email already member); (f) role future-proofing: a membership with role `family` and no `role_permissions` rows reads nothing; (g) cross-wedding SELECT/INSERT/UPDATE/DELETE including via `wedding_id` change in UPDATE and via FK child rows (e.g. option of wedding 1 referencing decision of wedding 2).
- **QA-8 (should) — Test ownership and timing: T17 is one late task and integration tests are self-graded.** Evidence: plan Tasks T17 "T10-T16 (si scrive man mano)", integration/pgTAP owned by developers T2/T7/T8/T9/T16. Proposal: split T17 into T17a (fixtures + login/invite/onboarding, starts at G1/G2 against T2/T7), T17b (Percorso/Scelte, G3), T17c (Budget/Home/Altro/jobs, G4/G5), T17d (a11y + cross-browser pass). QA additionally owns, as independent acceptance tests: `supabase/tests/qa_*.test.sql` (RLS matrix, grants audit, forbidden direct writes), `tests/acceptance/**` (concurrency QA-6, `requestSignIn` enumeration QA-4, job idempotency/clock scenarios QA-5, unsubscribe QA-14, headers), `e2e/**` and `e2e/support/{auth,fixtures,clock}.ts` (QA writes these helpers; `mailbox.ts` stays T6 but QA reviews its contract). Developers keep their unit/pgTAP-per-feature tests; QA does not duplicate them.
- **QA-9 (should) — CI runtime and flakiness: single `db-e2e` job, 3 browser projects, shared DB, no cleanup possible.** Evidence: plan §12, T1 Playwright "3 progetti". Estimate on a 2 vCPU/7 GB runner: Supabase image pulls 2-4 min (no cache by default), `npm ci` + `next build` 2-3 min, pgTAP+Vitest 1-2 min, Playwright ~60-80 specs x 3 projects at 10-20 s with 2 workers = 15-25 min: ~25-35 min per PR (free on public repo, but slow feedback). Proposal: separate jobs (`checks`, `db` = pgTAP+integration, `e2e-mobile` Chromium 360 on every PR, `e2e-full` desktop+WebKit+axe matrix on push to main/nightly/label) with a Playwright browser cache and the Supabase images cached; WebKit runs only a smoke subset (login, onboarding, Percorso at 390 px) and is labelled "Playwright WebKit", not Safari. Retries: `retries: 1` in CI only to detect flakes, any retried-then-green test is reported (flaky = bug, not green). Verify the `-x` service names against the pinned CLI (invalid names fail `supabase start`; analytics must be disabled in config) as a T1 acceptance check. Data isolation: unique wedding/users per test (random `@example.test` slugs), no teardown: append-only `audit_log`/`decision_events` BEFORE DELETE triggers will also block cascade deletes of weddings, so deleting test data is not an option; `db reset` once per CI run; Vitest integration `fileParallelism:false` where tests assert on global state (allowlist, cap counts).
- **QA-10 (should) — AC39 failure states cannot be injected with Playwright where the failure is server-side.** Evidence: test plan "Stati" row, plan §9 `classifyDbError`. `page.route` and `context.setOffline` only affect browser requests; SSR queries to Supabase happen on the server, and `setOffline` followed by reload shows the browser error page (no service worker). Proposal: "DB in pausa/errore" e2e via a second `next start` instance on another port with `NEXT_PUBLIC_SUPABASE_URL` pointing to a closed port (tag `@degraded`, own Playwright project), plus unit tests for `classifyDbError` with real error shapes (fetch failure, 540, 502, PostgREST timeouts); offline draft e2e as: go offline, type, go online, reload, assert draft restored (not "reload while offline"); error-with-"Riprova" for client calls via `page.route` abort.
- **QA-11 (should, question-for-developer) — Money parsing expected values are not defined.** Evidence: AC38 "accetta virgola o punto, formatta (1.234,56)"; test plan lists `1234.56`, `1,234`, `12,345`, `1.500`-style inputs without expected results. `1.500` is 1500 EUR in it-IT but 1,50 under "dot = decimal"; `1,234` is 1,234 (3 decimals, rejected) but may be read as thousand separator by US-minded users. Proposal for the developer: a dot followed by exactly 3 digits and no comma is a thousands separator ("1.500" = 1500,00); a single comma or dot with 1-2 digits is the decimal; 3 digits after the comma is an error; paste of "1.234,56" and "1,234.56" both accepted. Tests parse from the string (never `parseFloat * 100`: `19.99*100 = 1998.9999`), assert integer cents, and cap at a maximum (e.g. 1.000.000.000 EUR) below `Number.MAX_SAFE_INTEGER` in cents and DB `bigint`. Add a component test for `inputmode="decimal"` (AC38) and the exact error text.
- **QA-12 (should) — Mail catcher assertions: parallel specs, absence checks, headers, Mailpit/Inbucket.** Evidence: plan §7, T6 `e2e/support/mailbox.ts`, R14, AC2/AC8/AC50-52. Proposal: helper contract written now: `waitForMessage({ to, subject?, timeout })` with polling (no fixed sleeps), a unique recipient per test (shared mailbox, parallel workers), exposure of raw headers (`List-Unsubscribe`, `List-Unsubscribe-Post`, `From`), both text and html parts, extraction of the link and the 6-digit code; absence assertions ("no email for unknown address", "login/invite have no unsubscribe link") only after a positive control message to a second address has arrived, otherwise they pass vacuously. Add the check that `site_url` and the template link host equal Playwright `baseURL` in CI.
- **QA-13 (should) — Theme contrast tests must test what ships and cover more than the token pairs.** Evidence: plan §8, design.md §5.2/§11 ("da riverificare in F3 sul rendering reale"). Proposal: (a) the contrast Vitest reads the generated `themes.css` (or both and asserts equal), not just `catalogue.ts`; (b) unit-test `contrast.ts` against published WCAG vectors (black/white = 21, known 4.5 and 3.0 pairs, hex parsing, alpha rejected) since it is the oracle; (c) run all 12 candidate themes as a report (non-blocking) and the approved ones as a gate, in light and dark, including the shared semantic states (success/warning/destructive on their backgrounds), `primaryForeground` on `primary`, `ring`/`input` at 3:1 against `background`, and `accent` is never used as text (lint/grep); (d) axe `color-contrast` on rendered screens for approved themes x {light, dark} x 2-3 key screens in the nightly job (axe only checks the active theme; full matrix on every PR is too slow); (e) enable axe `target-size` (WCAG 2.2) and add 200% zoom / 320 CSS px reflow checks. Automated a11y finds only part of the issues: add a short manual checklist for F3 (keyboard path, VoiceOver iOS pass on login/Percorso/Budget, reduced motion).

### Notes
- **QA-14 (note) — NFR checks not in the test plan table.** Add rows: response headers (`X-Robots-Tag`, `robots.txt`, `frame-ancestors`, `Referrer-Policy: no-referrer` on `/invito/*` and `/auth/*`, CSP not blocking the app) as an integration test on the built server; unauthenticated calls of server actions/route handlers (not only RLS 0 rows); `/email/disattiva` GET never changes state, tampered/other-type/other-user tokens, constant-time compare, one-click POST without session; the "no `use cache`" lint rule has its own failing-fixture test; cross-user cache bleed e2e (two sessions alternately loading the same URLs on one server) and "after sign-out, Back shows no data"; LCP < 3 s is flaky on shared runners: gate on deterministic budgets (JS bytes, number of font requests) and keep LCP as report-only plus a manual measure on the preview. Keepalive freshness logic (36 h, `details` quota flag) should live in a script with unit tests, not inline YAML. **question-for-developer:** the brief has no sign-out AC; confirm there is none in R1 (proposed: add a minimal "Esci" in Altro, tested once) — otherwise a shared device cannot end a session.
- **QA-15 (note, question-for-developer) — Staging smoke (F5) mailbox.** Preview/staging uses Supabase built-in SMTP delivering only to organisation members, so an automated or agent-run smoke can log in only with a member address and the founder allowlist entry for it. Proposed answer: use the developer's own org-member address (or an alias) as the single staging smoke account, fake wedding data only, nothing committed; QA does read-only/ test-account actions there and does not test against production. AC9 stays a manual post-domain check.
- **QA-16 (note) — Test data in a public repo.** Fixtures and seeds use neutral fake people (e.g. "Anna Test"/"Bruno Test"), never the real first names or the real wedding data; keep the regex guard "every email in seeds, tests, e2e, docs matches `@example.test`" repo-wide (not only seeds) and add gitleaks fixtures only as synthetic strings. Seeds use fixed UUIDs/emails for pgTAP determinism; e2e creates its own data.
- **QA-17 (note) — Time-zone cases to add to the unit/e2e set.** Run the Vitest date suites under `TZ=UTC` and `TZ=America/Los_Angeles`; Playwright `timezoneId` different from Europe/Rome for countdown (SSR vs client hydration mismatch, midnight Rome); vectors around 2027-03-28 and 2027-10-31 (DST) and the leap day 2028-02-29; "today" at 23:30 UTC vs 00:30 Rome in `planReminders` and `groupTasks`.

## F2 round 1 — designer objections — 2026-11-23
Verdetto sul piano: **solido e coerente con il design**, copre quasi tutte le schermate e gli stati (onboarding a 8 passi senza data di nascita, home, Percorso, Scelte, Budget, Altro, invito/accesso, conflitto, esportazione, temi SSR, template email). Conteggio: **1 blocking, 10 should, 4 note**. `design.md` finalizzato per il Gate B (risolti i punti P7). Non ho modificato `plan.md` né `brief.md`.

- **DES-16 (blocking) — Lo stato "servizio in pausa" è irraggiungibile e conflata due casi.** Evidenza: il root layout legge `theme_id` dal DB (§8) e `proxy.ts` rinfresca la sessione via Auth (§4): con il progetto in pausa entrambi falliscono prima che `error.tsx` possa mostrare la pagina; `classifyDbError` (§9) mappa rete, 5xx e 540 su un'unica pagina. Proposta: (a) il root layout legge il tema in `try/catch` con ripiego sul cookie `r2y-theme` e poi `giardino`; (b) il proxy tratta errori di rete/540 come "servizio non disponibile", mai come "non autenticato" (niente redirect a `/accesso`, che dipende dallo stesso servizio); (c) `global-error.tsx` autosufficiente (nessun accesso al DB, stili inline minimi); (d) `classifyDbError` con due esiti: `paused` (540) e `unreachable`; testi in design §7.3. Test: avviare lo stack e fermare il DB, e2e sulle due pagine.
- **DES-17 (should) — AC39 prescrive un testo falso.** Evidenza: AC39 dice "Il servizio si sta svegliando, riprovate tra un minuto", ma un progetto free in pausa non si risveglia da solo (R9 del piano). QA scriverebbe un test su una frase che non va usata. Proposta: question-for-developer Q1 (riformulare AC39 con change log del brief).
- **DES-18 (should) — La UI del riferimento non è assegnata ai task.** Evidenza: T12 (Scelte) non cita badge provvisorio/definitivo, "Imposta come riferimento" sulla carta scenario, né il selettore; T11 lo cita solo dall'anteprima. Manca anche il ritorno al riferimento automatico: `set_reference_scenario(option_id)` non ammette `null`, quindi una scelta manuale resta fino alla cancellazione dello scenario. Proposta: T12 aggiunge badge, azioni, foglio di conferma con conseguenza e toast "Annulla" (ripristina il riferimento precedente); T11 aggiunge `ScenarioPicker` e banner; `set_reference_scenario(null)` = "Torna automatico"; eventi `reference_set` con testo in `HistoryList`; a decisione presa le azioni scompaiono (design §3.8).
- **DES-19 (should) — Il riferimento automatico può cambiare in silenzio.** Evidenza: se un partner aggiunge o elimina lo scenario più vicino, `sync_timeline` ricalcola le scadenze di entrambi senza che l'altro lo sappia (viola il principio "nulla cambia in silenzio"). Proposta: la whitelist di `domain/news/messages.ts` include i cambi di `weddings.applied_reference_date` ("Jessica ha aggiunto un'opzione: ora le scadenze seguono il 12 mar 2027"); la testata del Percorso dichiara sempre data e stato del riferimento.
- **DES-20 (should) — Prima visita del secondo partner e "Novità".** Evidenza: §9 non dice cosa mostrare con `previous_seen_at` nullo (mostrare tutto lo storico sarebbe rumore, nulla sarebbe un vuoto). Proposta: al primo accesso niente "Novità" ma una carta di benvenuto ("Ciao Jessica, ti stavamo aspettando…") con due azioni, chiudibile; stato in `user_wedding_state` (colonna `welcome_dismissed_at`, o `localStorage` come ripiego).
- **DES-21 (should) — Selettori dei temi legati a `:root`.** Evidenza: §8 genera `:root[data-theme=id]`; le carte della galleria devono mostrare ogni tema nello stesso schermo, quindi servono selettori applicabili a un contenitore. Proposta: `[data-theme="id"]` e `[data-theme="id"][data-mode="dark"]` (senza `:root`) e `--font-heading`/`--font-body` per tema nello stesso file; il test "themes.css allineato" resta valido.
- **DES-22 (should) — Caricamento dei font: 12 temi × 2 famiglie.** Evidenza: §8 dichiara 24 famiglie con `next/font/google`, `preload:false`, "max 3 pesi" (fino a 72 file nel build). Valutazione: il browser scarica solo le facce usate dal tema attivo, quindi l'LCP non soffre, ma serve un limite esplicito e un piano B. Proposta (design §5.1/§5.4): solo i temi approvati vengono dichiarati; sottoinsieme `latin`, `swap` con metriche di riserva; titoli 1 peso, corpo 400+600 (max 2 pesi, non 3); budget di 4 file woff2 (~120 KB) per tema verificato da script; la galleria carica solo il font dei titoli delle carte non attive e il corpo solo alla selezione, con `document.fonts.load()` prima dell'applicazione provvisoria; misura LCP in e2e a cache fredda e, se > 2,5 s, passaggio a `next/font/local` con `<link rel="preload">` dei due file del tema attivo. In ogni caso `next/font` non permette il preload condizionale.
- **DES-23 (should) — Componenti condivisi senza proprietario unico.** Evidenza: `DateScenarioList` serve onboarding e Impostazioni (T10) e Scelte (T12), in parallelo nel gruppo G3; `ReferenceBadge`, `MonthYearField` servono T10, T11, T12, T14. Rischio di conflitti e duplicati. Proposta: T3 (design system) possiede `DateScenarioList`, `ReferenceBadge`, `MonthYearField`, `PublicShell`; T11 possiede `ScenarioPicker`/`ScenarioPreviewBanner`; elenco in design §6.
- **DES-24 (should) — Il test di contrasto copre troppo poco.** Evidenza (calcolo F2 sui token di design §5.3): `accent` su `muted` scende a 2,67–2,86:1 in 10 temi chiari; tutte le altre coppie aggiuntive (foreground/muted, mutedForeground/card, primary/muted, input/muted, semantici su background/card/muted) passano. Proposta: `contrast.ts` include queste coppie; regola di design "accent solo su background e card" (§5.2). Nessun cambio ai colori.
- **DES-25 (should) — Template email: sicurezza e resa.** Evidenza: nomi e titoli dei compiti sono testo dell'utente inserito in html/oggetto; `email/templates/*.ts` è senza libreria. Proposta: escape HTML obbligatorio e rimozione degli a-capo da oggetto/intestazioni (test con `<b>` e `\r\n`); firme dei template con nome di chi invita, nome dell'invitato e data di scadenza; stili inline, font di sistema, pulsante a prova di client, versione testo, preheader; email Supabase Auth con palette Giardino fissa (statiche); specifiche in design §7.2.
- **DES-26 (should) — Promemoria: molte email nella stessa mattina.** Evidenza: §7 invia un'email per compito e per utente; tappe generate con lo stesso offset hanno la stessa scadenza, quindi 3–6 email insieme e il tetto giornaliero di 50 si consuma in fretta. Proposta: una sola email di promemoria al giorno per utente con tutti i compiti (blocchi "tra 7 giorni" e "oggi"), max 5 righe e "e altri N"; il `notification_log` resta per compito con lo stesso `provider_message_id`; il claim di idempotenza si fa sull'insieme.
- **DES-27 (note) — Soglie dei gruppi del Percorso (P7, risolto).** `groupTasks` segue design §3.4: Adesso = max 3 in evidenza scadute + scadenza entro 30 giorni + tappe in evidenza senza scadenza; Da recuperare = altre scadute (anche compiti dell'utente); Prossimi 3 mesi = 31–90; Più avanti = oltre 90 o senza scadenza; Fatti. "Adesso" mostra 5 righe e "Mostra tutte"; stato vuoto con il prossimo passo.
- **DES-28 (note) — Anteprima: stato nell'URL.** Proposta: `?anteprima=<id>` (nessuna scrittura), scarto automatico se lo scenario sparisce, nessun banner se lo scenario in anteprima è già il riferimento; `scroll-padding-top` per il banner fisso; calcolo del numero di scadenze che cambiano.
- **DES-29 (note) — Conflitto e Annulla.** `ConflictDialog` richiede una mappa campo→etichetta italiana per ogni entità (task, voce di budget, opzione) e un focus trap annidato sopra gli sheet; il toast "Annulla" può non essere raggiungibile da tastiera: "Eliminati di recente" resta l'alternativa garantita.
- **DES-30 (note) — Piccoli contenuti non pianificati.** `displayName` con ripiego nome → etichetta → "il tuo partner"; `content/style-tips.ts` (una frase per etichetta di stile, D18; non in T4/T10); cookie `r2y-theme` per le pagine pubbliche; `<meta name="theme-color">` aggiornato dallo script chiaro/scuro; preferenze email = due interruttori (promemoria, riepilogo), nessuna categoria "pagamenti" (risolve P7).

### Domande per lo sviluppatore (proposta tra parentesi)
- **Q1 (DES-17)** — AC39 dice "Il servizio si sta svegliando, riprovate tra un minuto" ma un progetto Supabase free in pausa non riparte da solo. Riformulare AC39 in: "pagina 'L'app è in pausa' che spiega che serve il ripristino manuale dal pannello (con 'Riprova'), distinta dalla pagina 'Non riesco a raggiungere il servizio' per errori di rete o 5xx"? (sì; testi in design §7.3.)
- **Q2** — Nome dell'app nei testi e nelle email (e nome del mittente): "roadmap2yes", provvisorio e centralizzato in una costante? (sì.)
- **Q3** — Nella pagina "in pausa" nominiamo chi la ripristina? (no: formula generica "chi gestisce l'app"; il dettaglio tecnico sta in un blocco comprimibile.)

## F2 round 1 — architect responses — 2026-11-23
plan.md has been rewritten with the round-1 changes (change log updated); the ADR draft is updated. Totals: 41 objections:
- 34 accepted (1 of them partly: QA-6);
- 7 sent to the developer as questions, with a technical design ready;
- 0 rejected.

Business questions are merged into plan.md → "Open questions" Q1–Q16.

### Product-owner
- PO-1 → accepted. `reopen_decision` puts discarded options back to candidate; pgTAP case added.
- PO-2 → question for the developer (Q7). Proposed: when a period is chosen, ask for the exact day. `choose_option(…, exact_date)` is ready.
- PO-3 → accepted. "Adesso" includes open highlightFirst tasks with no date, plus "Scegli il rito".
- PO-4 → question (Q8, merged with DES-26). Default design: one email per user per day; no 7-day email for dates set or changed inside the window; catch-up only for missed cron runs.
- PO-5 → question (Q9). Proposed: keep the per-task toggle (already designed) and add it to AC50.
- PO-6 → accepted. Emails computed on a provisional reference carry a note saying so.
- PO-7 → accepted. Warning when Assegnato > totale.
- PO-8 → accepted. (a) and (c) are the PO and designer's own fixes; (b) → Q14; (d) partner B is optional in `complete_onboarding`, and assignee B is shown via `displayName`.
- PO-9 → accepted. New task T0 (PO milestone spec); T4 depends on it.

### QA
- QA-1 (blocking) → accepted. New §3.1 write matrix:
  - column grants;
  - `guard_row` makes `wedding_id`, `created_*` and `id` immutable;
  - trigger sets `due_overridden` outside `sync_timeline` (transaction-local `set_config`);
  - triggers for status and deleted_by;
  - option status and events only via RPC/trigger;
  - memberships and user state only via RPC;
  - composite FKs `(id, wedding_id)`;
  - allowlist of executable functions.
  - QA's generated matrix is the test oracle (T17a).
- QA-2 (blocking) → accepted. §1.1:
  - every time-dependent pure function takes `today`/`now` as a parameter;
  - `runDailyJob({clock, sender, db, caps})`;
  - `r2y-test-now` cookie honoured only if `E2E_CLOCK=1` and `VERCEL` is unset (NODE_ENV is not usable, since `next start` sets production), with a unit test;
  - serial `time` Playwright project;
  - DB time tested by shifting timestamps.
- QA-3 → accepted. `config.toml` is local/CI only, with high limits; remote Auth is set in the dashboard via a runbook checklist (no `config push`); `loginAs` helper; one `@slow` real-cooldown test; a 429 burst integration test.
- QA-4 → accepted. Server-side limiter `signin_gate` applies the same limit to every email, with identical messages; a provider 429 maps to the same text. The residual leak (project-wide GoTrue limit) is documented as R17. `next=` accepts only relative paths. Acceptance test added.
- QA-5 → accepted. Stale `claimed` rows (>15 min) are re-taken with the same `batch_key`; tests for overlapping runs, failure at 3 points and bursts; ISO-week vectors; cap math stated (app cap counts app emails only; Auth email rate set to 10/h in the dashboard). Mon–Wed digest catch-up → Q11.
- QA-6 → accepted in part. QA-owned concurrency tests use parallel PostgREST clients (they get separate pooled connections). Raw `pg` clients are rejected: that would be a new dependency, and the constraint itself is already proven in pgTAP. `create_wedding` double-submit is covered (`for update` on the allowlist row); direct memberships INSERT is denied.
- QA-7 → accepted:
  - (a, b) matrix generated from the catalog, run through pgTAP and through PostgREST with real JWTs;
  - (c) grants audit, only `public` exposed, public wrapper `record_heartbeat` callable only with the secret key;
  - (d) `audit_capture` excludes `token_hash`;
  - (e) adversarial invite cases;
  - (f) family role with no permissions reads nothing;
  - (g) composite FKs.
- QA-8 → accepted. T17 split into T17a–d. QA owns `supabase/tests/qa_*`, `tests/acceptance/**`, `e2e/**` and `e2e/support/{auth,fixtures,clock,stub-supabase}.ts`; `mailbox.ts` stays with T6, with QA's contract.
- QA-9 → accepted:
  - separate CI jobs: checks / db / e2e-mobile / secrets on each PR; e2e-full on main, nightly or a label;
  - Playwright browser and Docker image caches; WebKit runs a smoke subset only;
  - `retries: 1` with flaky reporting;
  - `-x` service names verified in T1;
  - unique data per test, `db reset` once per run.
- QA-10 → accepted. `degraded` Playwright project: a second `next start` pointed at a closed port, plus a stub returning 540; offline-draft test reworked; unit tests of `classifyDbError` against real error shapes.
- QA-11 → question (Q10, the money parsing rules as proposed). Parsing from the string to integer cents, the cap and the `inputmode` test are accepted.
- QA-12 → accepted. Mailbox contract in T6: polling, unique recipient per test, raw headers, text and html parts, absence assertions only after a positive control; CI checks `site_url`/template host against Playwright `baseURL`.
- QA-13 → accepted. The contrast gate reads the generated `themes.css`; the calculator is unit-tested against WCAG vectors; extended token pairs and semantic states; non-blocking report on all 12 themes; nightly axe; target-size and reflow checks; manual F3 checklist.
- QA-14 → accepted. Header tests, unauthenticated server-action calls, unsubscribe cases, failing lint fixtures, cross-session cache bleed and Back-after-logout tests, deterministic JS/font budgets with LCP as report only, `keepalive-check.ts` with unit tests. The sign-out button → Q12.
- QA-15 → question (Q13). Proposed: the developer's own Supabase-org-member address as the only staging smoke account.
- QA-16 → accepted. Neutral fake names; the `@example.test` email guard runs repo-wide.
- QA-17 → accepted. Unit tests also run with alternative TZ values; Playwright `timezoneId` varied; DST and leap-day vectors; midnight cases.

### Designer
- DES-16 (blocking) → accepted:
  - the root layout reads the theme in try/catch, falling back to the `r2y-theme` cookie and then Giardino;
  - the proxy uses `getClaims()` and, on network errors or 540, rewrites to `/servizio?motivo=paused|unreachable` instead of redirecting to login;
  - `/servizio` renders without touching the DB; `global-error.tsx` is self-contained;
  - `classifyDbError` has two outcomes (paused / unreachable);
  - tested in the `degraded` e2e project.
- DES-17 → question (Q14, AC39 rewording; merged with PO-8b).
- DES-18 → accepted. `set_reference_scenario(null)` = back to automatic; reference actions on scenario cards in T12; ScenarioPicker and banner in T11; `reference_set`/`reference_auto` events; undo toast.
- DES-19 → accepted. Changes of `applied_reference_date` appear in Novità, attributed to whoever caused them; the Percorso header always shows the reference.
- DES-20 → accepted. `welcome_dismissed_at` plus WelcomeCard (T14).
- DES-21 → accepted. Theme selectors without `:root`.
- DES-22 → accepted. Only approved themes are declared; headings 1 weight, body 400+600; `check-font-budget.ts`; gallery font loading as specified; `next/font/local` as plan B.
- DES-23 → accepted. T3 owns DateScenarioList, ReferenceBadge, MonthYearField, PublicShell and ServiceDownPage; T11 owns ScenarioPicker, ScenarioPreviewBanner, AssigneeField and ReminderToggle.
- DES-24 → accepted. Extended contrast pairs; rule "accent only on background/card"; lint bans `text-accent`.
- DES-25 → accepted. Mandatory HTML escaping plus CR/LF stripping in subjects and headers (tested); explicit template signatures; static Giardino palette for Auth emails.
- DES-26 → question (Q8, merged with PO-4). Batching is the plan's default implementation.
- DES-27 → accepted. `groupTasks` follows design §3.4.
- DES-28 → accepted. `?anteprima=<id>`, auto-close, change count.
- DES-29 → accepted. Field-label maps per entity; nested focus trap.
- DES-30 → accepted. `displayName` fallback, `content/style-tips.ts` (T10), theme cookie, `theme-color` meta, two email preference toggles.

### Questions for the developer (plan.md Q1–Q16)
Q1 two-step release · Q2 accepted partner's email read-only · Q3 unknown rite · Q4 deleting a budget category that has items · Q5 partner B reminders only after acceptance · Q6 approved themes · Q7 choosing a period as the date · Q8 one reminder email per user per day · Q9 per-task reminder toggle · Q10 money parsing · Q11 digest catch-up Mon–Wed · Q12 sign-out "Esci" · Q13 staging smoke account · Q14 AC39 rewording · Q15 app name "roadmap2yes" · Q16 paused page names no one.

## F2 closure — designer — 2026-11-23
- DES-16 closed: layout DB->cookie->giardino, proxy rewrite to /servizio?motivo=paused|unreachable (no login redirect), /servizio and global-error DB-free, two-outcome classifyDbError, degraded e2e (T17d) all in plan.

## F2 closure — QA — 2026-11-23
- QA-1: closed. plan §3.1 gives a per-table write matrix with column grants, guard/due_overridden/status triggers, RPC-only paths, an EXECUTE allowlist and composite FKs; it is a testable oracle for the generated matrix (T17a).
- QA-2: closed. plan §1.1 and A7/R18 give `today`/`now` parameters, `runDailyJob({clock,sender,db,caps})`, the `r2y-test-now` cookie behind `E2E_CLOCK=1` and no `VERCEL`, a unit test, a serial `time` project, and the T17a-d split with QA ownership.

## F2 round 1 — summary (coordinator) — 2026-11-23
- PO-1..9 (0 blocking), QA-1..17 (2 blocking), DES-16..30 (1 blocking): 34 accepted by the architect, 7 turned into developer questions, 0 rejected (QA-6 concurrency via raw pg client rejected as sub-point: PostgREST parallel calls + pgTAP suffice).
- Blockers QA-1, QA-2, DES-16 closed by their challengers. Plan: 22 tasks, groups G0–G5, max 3 developers in parallel.

## Gate B round — developer answers and REQUIREMENT CHANGE — 2026-11-23
Developer's words (Italian, verbatim summary): Jessica can be invited by email OR via the email entered at project bootstrap. Through env vars it must be possible to specify the FIRST user's email, their access code and their role (sposa or sposo); that user can invite the other partner by entering the partner's email and an access code that they will hand over, and which can be changed later. If Resend is not configured, no deadline recap emails are sent and an alert is shown in the app.
Answers: Q2 and Q5 → see the above. Q7 → OK, and a date can be bound to a location; if it is, the app must show it. Q13 → always configurable via env. All other proposals accepted as proposed: Q1 (as adapted below), Q3, Q4, Q6 = approve all 12 themes (default Giardino), Q8, Q9 (keep per-task reminder toggle), Q10, Q11, Q12, Q14, Q15, Q16.

Coordinator interpretation (to be confirmed at the combined Gate A-change + Gate B):
- Auth becomes email + ACCESS CODE (Supabase Auth email/password; code hashed by Supabase, never stored by us). Magic link / 6-digit email OTP removed from R1. Login works with no email provider at all.
- Bootstrap via env (server-only, Vercel env / local .env, never committed): R2Y_BOOTSTRAP_EMAIL, R2Y_BOOTSTRAP_ACCESS_CODE, R2Y_BOOTSTRAP_ROLE (sposo|sposa). Idempotent create-only: creates the first user if absent, never overwrites a code changed in-app. Replaces the SQL founder allowlist.
- Partner invite, two ways: (a) always available: A enters B's email + an initial access code and hands it over personally; B logs in with it and can change it; (b) only when Resend is configured: an invite email with a one-time link where B sets their own code. Max 2 partners stays.
- Access code rules (proposal): min 8 characters; login rate-limited with temporary lockout and neutral error messages; each partner changes their own code (current code required); a forgotten code is reset by the other partner setting a new temporary code (and, with Resend, by an email reset link).
- Emails (proposal): A can edit B's email until B's first login; afterwards each partner edits only their own login email.
- Reminders to B only after B's first login (Q5).
- No Resend configured → no emails at all (no reminders, digest, invite or reset emails); a persistent in-app alert says emails are off and reminders are visible only in the app; email-only options are hidden/explained.
- Release: no two-step needed for Jessica — she can join in C1 with the access code; Resend + reminders are switched on when the domain exists.
- Q7: a date option can optionally be bound to a location option; when bound, the date shows the location everywhere it appears (full date×location comparison stays in R2).
- Q13: staging smoke account and all bootstrap values configurable via env.

## Requirement change applied — 2026-11-23
- PO: brief.md → 62 active AC (AC1–AC64, AC8 and AC47 removed); new AC54–AC64; D29–D48; open C1–C4.
- Architect: plan.md + ADR → email+access-code auth, env bootstrap inside the login server action (create-only, also `npm run bootstrap`), partner accounts via authorised admin calls, account_events, EmailOffBanner, date→location link; 24 tasks + T0; risks R20–R25; no new dependencies. Open Q-A (min length 10), Q-B (Turnstile, not in R1), Q-C (force change only after temporary reset).
- Coordinator: C1 (PO min 8) vs Q-A (architect 10, Supabase-enforced) merged into one question for the developer. Security-focused review round in F3 covers the auth change.

## Gate B — approved — 2026-11-24
Developer's answers to the 4 remaining questions: 1. OK (min 10 characters, letters + digits, enforced by Supabase Auth) 2. No CAPTCHA 3. OK (temporary reset code forces a change; initial code only suggests one) 4. OK (A edits B's email until B's first login; then each edits only their own).
- Requirement change (Gate A re-confirmation) and Gate B approved by tonybartiloro: plan (24 tasks + T0), services (Vercel Hobby, Supabase free ×2, Resend later, GitHub Actions), no new dependencies beyond the plan, access-code auth model, 12 themes, single Gate C.
- Recorded as D49–D54 in brief.md; Q-A/Q-B/Q-C marked approved in plan.md; ADR 0001 → accepted.
- Project memory updated: docker: true, npm commands, stack/tests/environments sections.
- Next: F3, group G0 = T1 scaffolding + CI (developer) ‖ T0 milestone spec (product-owner), then QA T17a.
