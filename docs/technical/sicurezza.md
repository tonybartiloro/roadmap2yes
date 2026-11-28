# Sicurezza

Questo documento raccoglie le regole di sicurezza dell'app, i loro limiti e i rischi accettati per R1. Ogni rischio residuo ha un identificativo (R20, R26, R27) che rimanda al piano di FEAT-2026-001.

Il repository è **pubblico**: niente dati reali di invitati, niente segreti, niente email vere, né nel codice né nei log CI.

## Modello in breve

- La **RLS** e i privilegi di colonna sono l'unico confine di autorizzazione. Vedi [Architettura](architettura.md#autorizzazione).
- La **chiave segreta** di Supabase è usata solo in quattro ambiti server-only. Vedi [Architettura](architettura.md#la-chiave-segreta).
- I **cookie di sessione** sono `httpOnly`. Vedi [Cookie](#cookie).
- Le intestazioni di risposta limitano indicizzazione, framing e referrer. Vedi [Intestazioni](#intestazioni).

## Ordine DB-prima per le operazioni sugli account

Le operazioni che creano, cambiano o cancellano un account Auth seguono una regola: **prima la mutazione nel database con il JWT dell'utente, poi la chiamata admin con la chiave segreta, solo sull'id restituito dal database**. Mai l'ordine inverso.

Il database fa tre cose nel primo passo: blocca le righe, ricontrolla lo stato, scrive l'evento di account e restituisce il bersaglio. Così la decisione è sua, e nessun account attivo può essere toccato da una chiamata admin basata su uno stato vecchio.

Regole:

- mai un id ottenuto da una ricerca per email (`auth_user_id_by_email` serve solo al bootstrap) né da `wedding_partners.user_id` letto a parte;
- le funzioni restano chiamabili con il JWT, e il database decide. La chiave segreta serve solo a eseguire;
- se la chiamata admin fallisce, si compensa o si riprova: l'ordine di partenza non si rovescia.

| Operazione | 1. Database (JWT) | 2. Admin (chiave segreta) | Se il passo 2 fallisce |
|---|---|---|---|
| Creare il partner con codice | `create_invitation(email,'code')`: controlla che l'account sia riutilizzabile, crea o riconsegna l'invito, scrive `partner_account_created` | `createUser` se manca l'account, poi lega l'id con `create_invitation`; oppure `updateUserById` su un account riutilizzabile | "Non riuscito, riprova": ripetere converge |
| Invito via email | Token generato dal server; al database arriva solo l'sha256 | `createUser` senza codice se serve, poi l'invio | Invito pendente, "Invia di nuovo" |
| Accettare l'invito (`/invito/[token]`) | `invitation_by_token(hash)`, solo chiave segreta: blocca, controlla pendenza e scadenza | `updateUserById(user_id, password)`, login, `accept_pending_invitation` | Il link resta valido finché non è accettato: ripetere converge |
| Cambiare l'email del partner in attesa | `update_partner_email`: rifiuta se è già entrato, restituisce `target_user_id` e `old_email` | `updateUserById(target, { email })` | Compensazione: `update_partner_email` con la vecchia email, poi errore |
| Revocare il partner in attesa | `revoke_invitation`: rifiuta se accettato; restituisce `delete_user_id` solo se riutilizzabile | `deleteUser(delete_user_id)` | Revoca completata, account orfano senza membership; ripetere restituisce di nuovo l'id |
| Codice temporaneo | `authorize_account_op('set_temp_code')`: sceglie il bersaglio e scrive `temp_code_set` | `updateUserById(target, { password, app_metadata: r2y_must_change_code = true })` | Evento senza cambio: falso allarme accettato |
| Cambio del proprio codice | Verifica del codice attuale, poi `authorize_account_op('change_own_code')` (evento `code_changed`) | `updateUserById(self, { password, r2y_must_change_code: false })`, poi nuovo login | Evento senza cambio (sicuro): errore e nuovo tentativo |
| Cambio della propria email | Verifica del codice attuale, poi `authorize_account_op('change_own_email')` (`email_in_use` o evento `email_changed`) | `updateUserById(self, { email, email_confirm: true })`, poi `sync_my_email` | Evento senza cambio. Se fallisce solo `sync_my_email`, la ripete il login |

### Account riutilizzabile

Un solo predicato, `private.account_reusable(user_id, wedding_id)`, decide quando un account può ricevere un codice, cambiare email o essere cancellato da chi non ne è il titolare. È vero solo se l'account Auth:

1. esiste e non è cancellato;
2. non è mai entrato (`last_sign_in_at` nullo);
3. non ha membership in nessun matrimonio;
4. non è un fondatore (`r2y_founder`);
5. non ha un invito in sospeso di un **altro** matrimonio, né per id né per email.

### Eventi di account

- Li scrive **solo il database**, nella stessa transazione del passo 1, con `actor_id = auth.uid()`. Tipo e bersaglio dipendono dall'operazione e dallo stato, non da ciò che dichiara il chiamante.
- L'evento è scritto **prima** dell'operazione admin. Il rischio è un evento per un'operazione poi fallita: è accettato, perché un avviso in più è sicuro e uno mancante no.
- Il cambio diretto via API di Auth (R26) non produce eventi.

### Ordine dei lock

Tutte le funzioni prendono i lock nello stesso ordine:

1. lock advisory, se presenti (`create_wedding:uid`, `accept:uid`);
2. `weddings` (`for update`);
3. `wedding_partners`;
4. `invitations`;
5. inserimenti in `memberships` e `account_events`.

Le funzioni che partono da un id di invito leggono prima il `wedding_id` senza lock (è immutabile per trigger), bloccano il matrimonio, poi l'invito, e ricontrollano lo stato. Vale anche per le scelte: `choose_option` e `reopen_decision` bloccano `weddings` per primo, come le altre. Il ragionamento sui lock è scritto nell'intestazione delle funzioni nelle migrazioni.

Le corse coperte: se B accetta mentre A cambia l'email o revoca, la funzione del primo passo blocca l'invito e risponde `already_accepted` o `partner_already_joined`. Nessuna chiamata admin tocca un account attivo.

## Codici d'accesso

### Policy

- Il codice è la password di Supabase Auth: hashata da Supabase, mai salvata dall'app e mai nei log.
- **Lunghezza 10–72 caratteri** (72 è il limite di bcrypt), con almeno una lettera e una cifra. Il minimo a 10 è imposto dal server Auth e vale anche per chiamate dirette.
- L'app aggiunge: una lista di codici comuni (`content/weak-codes.ts`), il divieto di contenere la parte locale dell'email o il nome o il cognome.
- "Genera un codice" usa `crypto.getRandomValues` su un alfabeto senza caratteri ambigui: 12 caratteri in gruppi di 4.
- I campi sono `type="password"`, con mostra/nascondi e `autocomplete` `current-password` o `new-password`.

### Impostazioni di Supabase Auth

Locali (in `supabase/config.toml`) e remote (dal pannello, con la checklist nel [runbook](ambienti-e-rilascio.md#checklist-auth-remota)).

| Impostazione | Valore | Perché |
|---|---|---|
| Registrazione pubblica | Disattivata (`enable_signup = false`) | Solo chi ha un invito entra |
| Lunghezza minima | 10 | Il login è raggiungibile da Internet |
| Requisiti | Lettere e cifre (`letters_digits`) | Idem |
| `enable_confirmations` | Attiva ("Confirm email") | Un cambio di email chiesto direttamente a GoTrue non si applica senza conferma |
| `double_confirm_changes` | Attiva ("Secure email change") | La conferma serve su **entrambi** gli indirizzi |
| `secure_password_change` | Attiva ("Secure password change") | Un cambio di codice diretto richiede una sessione di meno di 24 ore, o un nonce via email |

Le tre impostazioni di indurimento sono state **approvate dallo sviluppatore il 2026-11-24 (P2)**. Non richiedono un fornitore email: l'app non usa `PUT /user` per codice ed email, e `admin.updateUserById` con `email_confirm: true` non è toccato.

### Cosa offre Supabase e cosa no

Offre: hash bcrypt, limite per IP sul login (circa 30 richieste ogni 5 minuti per IP, configurabile), requisiti del codice, stesso messaggio per email inesistente e codice sbagliato.

Non offre, sul piano gratuito: blocco dell'account dopo N errori, controllo delle password trapelate (a pagamento), CAPTCHA (solo con un servizio esterno, rimandato).

## Limitatore di accesso

Il limitatore applicativo protegge il percorso dell'app (la server action di login). Il percorso diretto a GoTrue con la chiave pubblicabile non è protetto da lui: per quello valgono il limite per IP di Supabase e la robustezza del codice (R20).

Funzionamento di `signIn(email, code)`:

1. validazione zod;
2. se l'email è quella di bootstrap, `ensureBootstrapUser()` (vedi [Residui](#residui-accettati-r27));
3. `login_gate(chiave_email, chiave_ip)` con la chiave segreta: se una chiave è bloccata risponde "Troppi tentativi. Riprova tra 15 minuti.", **uguale per qualunque email**;
4. `signInWithPassword` dal server, con i cookie di sessione;
5. errore: `login_record(failure)` e "Email o codice non corretti.";
6. successo: `login_record(success)`, che azzera il contatore dell'email **solo se non è bloccata**. Un blocco attivo non si cancella né si accorcia con un successo, e la chiave IP non si azzera mai da un successo.

Dettagli:

- `login_record` si chiama solo se il gate era aperto: un tentativo bloccato non scrive righe. Niente righe per email casuali.
- Un successo arrivato mentre un blocco è attivo (una raffica di tentativi paralleli) è onorato: il codice era giusto e la sessione è già emessa. Il blocco resta per gli altri tentativi.
- Un 429 di GoTrue è mappato sullo stesso testo dei troppi tentativi.

Soglie (configurabili; default tra parentesi):

| Variabile | Default | Significato |
|---|---|---|
| `R2Y_LOGIN_MAX_FAILURES_EMAIL` | 5 | Errori per email nella finestra |
| `R2Y_LOGIN_MAX_FAILURES_IP` | 20 | Errori per IP nella finestra |
| `R2Y_LOGIN_LOCK_MINUTES` | 15 | Durata del blocco, uguale alla finestra |

Le chiavi sono HMAC-SHA256 (non l'email in chiaro, non l'IP in chiaro). Non c'è storico oltre la finestra.

**IP del client.** Si legge `x-vercel-forwarded-for`, poi `x-forwarded-for` (primo valore), poi `x-real-ip`. Il valore deve essere un IP valido, altrimenti è `null`. Vedi i residui R27.

## Residui accettati (R26 e R27)

### R26 — sessione rubata e cambio diretto

Se una sessione viene rubata (per esempio con un XSS che agisce nella pagina), chi la usa può chiamare direttamente `PUT /user` di GoTrue e cambiare codice o email senza il codice attuale. Con le tre impostazioni P2 accese:

- l'email non cambia mai senza conferma su **entrambi** gli indirizzi;
- il codice si cambia direttamente solo entro 24 ore dal login.

**Residuo:** entro 24 ore dal login il codice si può ancora cambiare senza il codice attuale. Rimedi: il partner imposta un codice temporaneo, che chiude anche le sessioni del bersaglio; la CSP; il runbook dal pannello. Il cambio diretto non produce eventi in Novità. Approvato per R1 il 2026-11-24.

I cookie sono `httpOnly`: l'XSS può agire nella pagina, ma non leggere il refresh token (vedi [Cookie](#cookie)).

### R27 — residui del limitatore e del bootstrap

R27 raccoglie quattro residui, tutti a rischio basso.

**(a) Bootstrap prima del gate.** Per la sola email di bootstrap, `ensureBootstrapUser` gira prima del gate. Chi conosce quell'indirizzo può distinguere il caso da una differenza di tempo (una query in più), e i tentativi bloccati la raggiungono. Il danno è limitato a un'email, che i partner conoscono già. Accettato per R1. Se servirà, il gate va separato dal login.

**(b) IP affidabile solo dietro Vercel.** Su Vercel la piattaforma sovrascrive `x-forwarded-for` e `x-real-ip` con l'indirizzo vero del client, quindi il primo valore è affidabile. Fuori da Vercel (`next start` dietro un altro host, o un CDN che aggiunge valori) l'intestazione è controllabile dal client:

- chi attacca può cambiare IP a ogni richiesta e aggirare il limite per IP;
- chi attacca può anche far bloccare un IP innocente.

Il limite per **email** non dipende dall'IP e resta valido. In più: IPv6 è più debole perché un attaccante può ruotare dentro un /64, e senza un IP utilizzabile il gate per IP è aperto (il controllo vero è il token a 256 bit degli inviti). **Non mettete un altro proxy davanti all'app senza rivedere questa regola.**

**(c) La chiave segreta è anche la chiave HMAC del limitatore.** Ruotare `SUPABASE_SECRET_KEY` azzera tutti i contatori del limitatore: è un effetto benigno, ma va sapere che succede. Dai digest salvati nel database non si ricava la chiave, perché HMAC non è reversibile. Però la chiave segreta esce dall'ambito admin e finisce su un percorso raggiungibile da chiunque. Un segreto dedicato per il limitatore, con ripiego sulla chiave segreta, sarebbe una modifica piccola e non è ancora stata fatta.

**(d) Il cambio di codice obbligatorio è una regola di navigazione, non di autorizzazione.** Il proxy rimanda alla pagina di cambio, ma chi ha il flag può ancora chiamare altre server action per id. Nessun buco di autorizzazione: la RLS resta il confine, e il flag forza solo a cambiare un codice che l'altro partner ha impostato. Vale solo per la navigazione.

### Altri residui documentati

- **Token dell'invito nel percorso.** Vedi [Token di invito](#token-di-invito-nel-percorso).
- **Lettura con la chiave segreta in `peekInviteToken`.** Vedi [Lettura con la chiave segreta](#lettura-con-la-chiave-segreta-in-peekinvitetoken).
- **Limiti dei piani gratuiti.** Nessun blocco degli account, nessun CAPTCHA, nessun backup scaricabile. Il piano gratuito non è verificato di nuovo a ogni release: va riletto alla creazione di servizi nuovi.

## Bootstrap del primo utente

- Le variabili `R2Y_BOOTSTRAP_EMAIL`, `R2Y_BOOTSTRAP_ACCESS_CODE` e `R2Y_BOOTSTRAP_ROLE` sono solo server-side, mai `NEXT_PUBLIC_`, mai nel repository.
- Il bootstrap è **create-only**: se l'utente esiste, non fa nulla. Un codice cambiato in app non viene mai sovrascritto.
- Il codice di bootstrap è un segreto in Vercel: consigliato cambiarlo al primo accesso e poi togliere `R2Y_BOOTSTRAP_ACCESS_CODE` (non serve più).
- Cambiare `R2Y_BOOTSTRAP_EMAIL` crea un **nuovo** fondatore. È voluto.
- Il bootstrap gira prima del gate del limitatore per la sola email di bootstrap: vedi il residuo (a) in [R27](#r27--residui-del-limitatore-e-del-bootstrap).

Dettagli operativi nel [runbook](ambienti-e-rilascio.md#primo-utente-bootstrap).

## Cookie

I cookie di Supabase sono impostati con:

- `httpOnly: true`: non leggibili da JavaScript nella pagina;
- `sameSite: lax`, `path: /`;
- `secure: true` quando il sito è su Vercel (`VERCEL` definita) o `NEXT_PUBLIC_SITE_URL` inizia con `https://`. In locale e nei test e2e, su http, è falso.

Non esiste un client Supabase nel browser: l'app parla con Supabase solo dal server, quindi `httpOnly` non rompe nulla.

## Token di invito nel percorso

Il link d'invito è `/invito/[token]`: il token sta nel **percorso dell'URL**.

- Il token è casuale a 32 byte, generato dal server. Il database conserva solo il suo sha256.
- Vale 7 giorni o finché non viene accettato. Dopo l'accesso non serve più.
- La pagina è `no-store`, `noindex`, e il proxy mette `Referrer-Policy: no-referrer` su `/invito/*`.
- Il codice dell'app non scrive mai il token nei log.

**Residuo (code-16 REV-8):** il percorso dell'URL finisce nei log delle richieste della piattaforma di hosting (Vercel) e nella cronologia del browser. Dura fino al primo accesso o per 7 giorni. Non si risolve nel codice; il rischio è accettato per R1.

## Lettura con la chiave segreta in `peekInviteToken`

La pagina `/invito/[token]` mostra solo il nome di chi invita e un'email mascherata. Per farlo, `peekInviteToken` in `features/accounts/admin-ops.ts` legge `invitations` e `wedding_partners` con la chiave segreta, usando id che il database ha restituito.

**Residuo (code-16 REV-7):** è una lettura di tabelle con il client che bypassa la RLS, più ampia di "chiamata admin + un RPC". Gli id non vengono dall'utente, quindi il rischio è basso. Miglioria possibile: un RPC solo-chiave che restituisce nome e email mascherata. Accettato per R1.

## Token di disattivazione delle email

I link di disattivazione sono firmati con HMAC-SHA256 usando `EMAIL_LINK_SECRET` (almeno 32 caratteri). La firma copre un contesto fisso, il tipo (`reminders` o `digest`) e l'id dell'utente. Non c'è email né nome nell'URL.

- Il GET non cambia nulla; la conferma è un POST.
- Ruotare `EMAIL_LINK_SECRET` rende non validi tutti i link già inviati. Gli utenti possono comunque disattivare le email da Opzioni > Promemoria.

## Guida: lettura dei file e Markdown

La Guida legge i file di `docs/functional` e li mostra nell'app. Le regole di sicurezza:

- **Nessun percorso dall'input.** Lo slug nell'URL è accettato solo se coincide con un nome reale della cartella. `/guida/../x`, `..%2F…`, più segmenti o nomi fuori elenco rispondono "Pagina non trovata" (vedi [Architettura](architettura.md#guida-duso-guida)).
- **Nessun HTML grezzo.** Il renderer usa `skipHtml` e non include `rehype-raw`: un tag nel Markdown non diventa mai markup.
- **Link esterni** `http(s)` e `mailto`: nuova scheda con `rel="noopener noreferrer"`. Link `javascript:`, ancore e percorsi fuori cartella sono testo semplice.
- **Contenuto pubblico.** I file sono nel repository pubblico: devono contenere solo testi funzionali, senza dati reali, segreti o indirizzi veri (regola già valida per tutto il repository).
- **Accesso.** La Guida sta nell'area autenticata, con la stessa regola di default-deny delle altre pagine. Un utente anonimo viene portato all'accesso (e2e in `login.spec.ts`).

## Intestazioni

- `noindex` su tutto, anche sul login.
- `frame-ancestors 'none'` (niente iframe).
- CSP di base. Una CSP con nonce è un passo successivo (vedi ADR, follow-up).
- `Referrer-Policy: no-referrer` su `/invito/*`, `/auth/*` ed `/email/*`, perché il token sta nel percorso o nella query. Su `/rsvp/*` il `no-referrer` vale per la pagina neutra 404 e per il 429; la pagina con il modulo usa `same-origin` (ADR-0003, D15), perché con `no-referrer` l'invio senza JavaScript fallisce.
- Le pagine autenticate sono dinamiche e non vengono messe in cache (una regola di lint vieta `use cache` nelle aree autenticate). Le risposte di uscita e quelle delle pagine con token sono `no-store`, così il pulsante Indietro non mostra dati dopo l'uscita.

## Dati personali degli invitati (ADR-0002)

Sono i primi dati di persone che non usano l'app: nomi, telefoni, email, note (anche allergie). Le regole, con la motivazione, sono nell'[ADR-0002](../adr/0002-dati-personali-invitati.md).

- **Solo RLS.** L'area `guests` è solo per `partner`, con `read`, `write` e `delete`. Nessun grant né policy per `anon`, ora e in R-04. Famiglia e planner non hanno righe. I pgTAP negano l'accesso ad `anon`, a un altro matrimonio e a `family`/`planner`.
- **Cancellazione vera.** Il `DELETE` è permesso dalla RLS solo su righe già eliminate logicamente e con `guests/delete`. Le chiavi esterne dei membri si azzerano (`on delete set null`).
- **Audit senza dati personali.** `audit_row` esclude `first_name`, `last_name`, `phone`, `email` e `notes` di `guests`, e `name` di gruppi e tavoli. Il test pgTAP controlla `audit_log.old_data` e `new_data` dopo insert, update, delete e svuota. Le tabelle non entrano in "Novità".
- **Nessun valore nei log né negli errori.** Le server action restituiscono codici e messaggi fissi, mai `message` o `details` di Postgres. Le RPC sollevano codici stabili (`invalid_row`, `too_many_rows`, `payload_too_large`, `group_deleted`, `table_deleted`) e `42501` per i dinieghi. Un test di integrazione spia `console` e non trova valori.
- **Il file non lascia il browser prima della conferma.** L'importazione legge il CSV nel client. La server action rivalida le righe e le scrive con `import_guests`; il file intero non viene mai inviato.
- **Nessun dato reale nel repository.** Il seed `supabase/seeds/04_guests.sql` usa nomi inventati, telefoni finti ed email `@example.test`. Una guardia Vitest (`tests/unit/guests-seed.test.ts`) e `check:test-emails` lo verificano.
- **Residui accettati.**
  - REV-8: se una scrittura diretta viola un vincolo, Postgres scrive nei propri log la riga ("Failing row contains (...)"). L'app non lo restituisce né lo registra, ma i log del fornitore lo conservano fino alla rotazione.
  - I backup gestiti da Supabase ruotano da soli.
  - I file CSV o JSON già scaricati dalla coppia restano sul loro dispositivo.
- **Revisione.** Il round di sicurezza del reviewer ha riguardato la migrazione e le server action (code-2, REV-5..10). È un requisito del piano prima del merge.

## Pagina pubblica RSVP (ADR-0003)

La pagina `/rsvp/{token}` è l'unica area pubblica che legge e scrive dati di terzi. Le regole, con la motivazione, sono nell'[ADR-0003](../adr/0003-link-rsvp-token-derivato-accesso-pubblico.md). Qui c'è il quadro di sicurezza.

- **Token derivato.** Il token è `HMAC-SHA256(RSVP_LINK_SECRET, "r2y-rsvp:v1:" + id del link)`. Il database conserva solo lo sha256 (`token_hash`), che non si legge né compare in audit. Il server ricalcola il link per la coppia e confronta l'hash: se non coincide, il foglio chiede di rigenerarlo.
- **Accesso solo con la chiave segreta.** Le tre RPC pubbliche (`rsvp_gate`, `rsvp_page`, `rsvp_submit`) hanno `EXECUTE` solo per `service_role`, nessun grant per `anon`. `src/features/rsvp/public-rpc.ts` è il quinto ambito che importa `admin.ts`. Espone solo quelle tre funzioni e restituisce codici, mai messaggi di Postgres.
- **Insiemi di chiavi chiusi.** Ogni RPC pubblica restituisce solo le chiavi previste. Il test pgTAP ne controlla l'insieme esatto: nessun altro invitato, contatto, nota, lato o tavolo.
- **Tempo dal server.** La scadenza usa `resolveNow()`, mai un orario della richiesta. Il cookie di test `r2y-test-now` è ignorato senza `E2E_CLOCK` e su Vercel.
- **Limiti (BR9).** Chiave IP = HMAC con contesto `r2y-rsvp:ip:` (IPv6 ridotto al /64). Link non validi: 10 per IP in 15 minuti, poi blocco di 15 minuti (429 in apertura). Invii: 20 per link in 15 minuti. Un token valido non è mai bloccato dal limite per IP. IP assente: nessun limite per IP, resta quello per link.
- **Risposte.** Link che non funziona in apertura: 404 neutro dal proxy, byte identici per ogni causa. Invio su un link che non funziona: stessa pagina neutra con stato 200, perché una server action non cambia lo stato HTTP. Il messaggio di blocco compare nel modulo.
- **Log.** Il codice non scrive token, hash, note, stato o id negli errori. Il browser riceve solo codici. Un test di integrazione spia `console`.
- **Dati di salute.** Preferenze alimentari e nota sono fuori dall'audit, da "Novità" e dai log. Nessun invio da link genera un evento di analytics.
- **Colonne esplicite.** Le letture di `rsvp_links` elencano sempre le colonne, mai `select('*')`: la colonna `token_hash` non è leggibile da `authenticated` e un `*` farebbe fallire la query invece di tacere (REV-105).
- **Residui accettati.** Sono elencati in una tabella sotto: si accettano per il rischio e l'uso del link, e sono tracciati nella revisione di sicurezza di F3.

| Residuo | Perché si accetta |
|---|---|
| Il token sta nel percorso: resta nei log delle richieste di Vercel (breve conservazione su Hobby, visibili solo al proprietario) e nella cronologia del browser (D5, ADR-0003 §8) | Residuo dichiarato. Il codice non lo scrive mai nei log |
| Il blocco per IP blocca solo i token sbagliati e non limita le ricerche da un IP già bloccato verso link validi (REV-114) | Il limite non ferma il probing: lo ferma il token da 256 bit |
| Fuori da Vercel `clientIp` si fida del primo valore di `x-forwarded-for`, quindi è falsificabile (REV-115). In locale e nei test l'IP è sintetico (QA-2) | Stessa regola del limitatore di login; su Vercel è affidabile |
| Le anteprime dei messenger e i crawler leggono l'HTML completo di un link valido (REV-120) | L'anteprima è statica e senza nomi; `noindex` resta |
| La CSP mantiene `script-src 'unsafe-inline'`. L'escaping di React è l'unica barriera contro XSS su una pagina con dati di salute; nessun punto di iniezione trovato | Vedi il follow-up della CSP con nonce |
| L'id dell'invitato nella pagina è l'`id` reale di `guests` (REV-121) | È opaco per l'invitato e vale solo con il token e la RLS |
| Payload malformati su un token valido non hanno un limite (REV-119b) | Il token valido non consuma il limite per IP; ogni chiamata fa solo una RPC |
| Degradi: gate con timeout di 3 s e fail-open; un link morto può rispondere 200 con la neutra; worst case del proxy 9 s; possibile doppio conteggio se la chiamata scade dopo la scrittura (REV-122) | Solo con backend lento. Nessuna differenza di dati fra le cause |
| Il token compare nel payload Flight della pagina, nel campo `$ACTION` e nel body del POST senza JavaScript | Stesso visualizzatore del link: nessuna esposizione in più |
| Il Referer `same-origin` porta il percorso nei log delle richieste di asset del sito (log drain) | Stesso pubblico e durata del primo residuo |
| Diete e note di tutti gli invitati stanno nel payload della lista per chi ha `guests/read` (REV-124) | Stesso accesso della RLS; la coppia le vede già in Invitati |
| Il link esce dall'app solo con Copia link, Condividi e WhatsApp: il messaggio WhatsApp con l'URL passa dalla query di `wa.me` e può restare nella cronologia (REV-126). La tastiera può inviare il campo con l'URL a servizi cloud (REV-125) | Scelta della coppia, sempre manuale. Lo spellcheck è disattivato sui campi con il link |
| `getLinkUrlAction` non ha limite di frequenza né audit | Solo chi ha `guests/write` può chiamarla; ricalcola il link e lo confronta con l'hash |
| La derivazione del token è un invariante dell'app, non del database: `rsvp_create_links` e `rsvp_rotate_link` ricevono `link_id` e `token_hash` dal client, quindi un partner può registrare l'hash di un token scelto da lui (solo nel proprio matrimonio; il foglio mostra poi "Nuovo link") (REV-104) | Il rischio resta nel perimetro della coppia. Regola per il codice futuro: derivare il token solo per un link letto tramite RLS (come fa `getLinkUrlAction`), mai per un `link_id` indicato dal chiamante |
| Finestra fissa dei limiti: al confine di due finestre un IP o un link può fare fino al doppio del limite (per esempio 20 link non validi, 40 invii per link) (REV-106) | Il limite serve a frenare, non a contare con precisione; il token da 256 bit resta la difesa principale. Un IP `null` non ha limite per IP, come da P5 |

## Segreti

| Dove | Cosa | Regola |
|---|---|---|
| Vercel | `SUPABASE_SECRET_KEY`, `R2Y_BOOTSTRAP_*`, `CRON_SECRET`, `EMAIL_LINK_SECRET`, `RESEND_API_KEY`, `RSVP_LINK_SECRET` | Marcati *Sensitive*. Non stampati, non nei log. `RSVP_LINK_SECRET` ha valori diversi fra Production e Preview |
| GitHub | Secret di ambiente (`production`, `staging`, `production-keepalive`) | Solo per i job su `main`. Elenco nel runbook |
| Repository | Nessun segreto. `.env*` è ignorato dal git | gitleaks sull'intera cronologia in CI |
| Dati | Nessuna email reale, nessun codice reale, nessun dato di invitati | Ogni email di test è `@example.test`: lo verifica `npm run check:test-emails` |

Il file `.env.example` contiene solo valori finti. Le chiavi locali le genera `npm run db:env` sul proprio computer, e non vanno mai committate.

## Storico delle modifiche

| Data | Feature | Modifica |
|---|---|---|
| 2026-11-24 | FEAT-2026-001 | Prima stesura con ordine DB-prima, codici, limitatore, R26 e R27, cookie, token di invito (F4, T18) |
| 2026-11-25 | FEAT-2026-002 | Guida: slug solo da elenco reale, nessun HTML grezzo, regole dei link esterni; "Altro" diventa "Opzioni" |
| 2026-11-25 | FEAT-2026-003 | Dati personali degli invitati (ADR-0002): permesso `delete`, `DELETE` solo su righe eliminate, audit senza dati personali, nessun valore nei log, residuo REV-8 |
| 2026-11-28 | FEAT-2026-004 | Pagina pubblica RSVP (ADR-0003): token derivato, quinto ambito della chiave segreta, limiti, intestazioni per tipo di pagina, residui REV-114..126; `RSVP_LINK_SECRET` tra i segreti |
