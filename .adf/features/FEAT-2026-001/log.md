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
