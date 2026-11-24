# Email e job

## Interruttore unico

`emailEnabled()` (`src/lib/email/index.ts`, solo server) decide se le email sono accese. È vero solo se:

- `EMAIL_TRANSPORT=resend`, con `RESEND_API_KEY` ed `EMAIL_FROM` presenti; oppure
- `EMAIL_TRANSPORT=smtp`, con `SMTP_HOST` presente. È il trasporto locale e di CI, verso il mail catcher.

Con `EMAIL_TRANSPORT` assente, `none` o incompleto le email sono **spente**. La funzione non lancia mai eccezioni: il login non dipende dalle email.

`smtp` è rifiutato quando `VERCEL_ENV=production`: è in chiaro e serve solo in locale e in CI.

Quando le email sono spente, si usa `NullSender`, che non viene mai chiamato perché i chiamanti controllano prima `emailEnabled()`.

## Trasporti e template

- `EmailSender` ha due implementazioni reali: `smtp` (con nodemailer) e `resend`.
- Escape HTML di ogni testo scritto dagli utenti, rimozione di `\r\n` da oggetti e intestazioni, firme esplicite, nota "data provvisoria" quando serve, `APP_NAME = "roadmap2yes"`.
- Template dell'app: invito con link, notifica di codice temporaneo impostato, notifica di email cambiata, promemoria raggruppato, riepilogo settimanale. Il testo che vede chi riceve è descritto in [Promemoria email](../functional/promemoria-email.md).
- Template di Supabase Auth: **solo il recupero del codice** (`supabase/templates/recovery.html`). Nessun template di magic link o OTP.

Con le email accese, in produzione Supabase Auth usa il SMTP personalizzato di Resend **solo per il recupero**.

## Job giornaliero

- Schedulazione in `vercel.json`: `0 5 * * *` UTC, route `/api/cron/daily`.
- La route accetta solo `Authorization: Bearer <CRON_SECRET>`, che Vercel Cron invia da solo quando la variabile esiste. Senza segreto configurato la route rifiuta tutto.
- Funzione principale: `runDailyJob({ clock, sender, db, caps })`. Riceve il clock, quindi si può testare con date fissate.

Passi, in ordine:

1. **Heartbeat**, sempre. È la prova che il job gira, letta dal controllo settimanale.
2. **Se `emailEnabled()` è falso, finisce qui.** Nessun claim: nulla resta "consumato". Quando le email si accendono, si parte dagli elementi la cui finestra include oggi, senza recuperare il passato.
3. **Pianificazione dei promemoria** (`planReminders(today)`):
   - `task_7d` (7 giorni prima) e `task_due` (il giorno stesso);
   - destinatari per assegnatario, **solo partner con membership**: per il partner B vuol dire dopo il suo primo accesso;
   - niente "7 giorni" per le scadenze impostate o cambiate dentro la finestra;
   - il compito con il promemoria spento è escluso.
4. **Una sola email al giorno per utente**, con due blocchi ("tra 7 giorni" e "oggi").
5. **Riepilogo del lunedì**, con recupero da lunedì a mercoledì, una volta per settimana ISO. Se non c'è nulla da segnalare non si scrive nulla.
6. **Claim e tetti.** Ogni elemento è reclamato con un `claimed_at`; i claim scaduti (15 minuti) si riprendono con la stessa `batch_key`. Tetti: 50 email al giorno e 1500 al mese, solo per le email dell'app. Oltre il tetto l'elemento è `skipped_quota` e il flag resta visibile.

Il job è idempotente: per ogni elemento c'è una riga in `notification_log`, quindi un secondo passaggio non rimanda la stessa email.

## Disattivazione

- Ogni email di promemoria ha un link firmato (HMAC-SHA256 con `EMAIL_LINK_SECRET`) che disattiva un tipo di email per un utente.
- Il **GET** mostra la conferma e non cambia nulla. Il **POST** disattiva. Il POST è idempotente.
- Le intestazioni includono `List-Unsubscribe`.
- Le email di accesso e di invito non hanno il link: non sono disattivabili.
- La route di disattivazione è in `src/app/(public)/email/disattiva/`, con `Referrer-Policy: no-referrer`.

## Controllo del servizio

Il workflow `keepalive.yml` (lunedì alle 06:17 UTC) gira con `scripts/keepalive-check.ts`:

- in **staging** scrive e rilegge un heartbeat `keepalive`, così il progetto gratuito non va in pausa;
- in **produzione** controlla che gli heartbeat `daily_job` degli ultimi 8 giorni siano recenti (non più vecchi di 36 ore, senza buchi di 36 ore) e che nessun run riporti un errore o un superamento della quota.

Il controllo fallisce, e GitHub avvisa il proprietario del repository. Il controllo non stampa indirizzi, segreti né errori grezzi del database.

Il cron di Vercel è il meccanismo principale. Il workflow GitHub è il secondario: su un repository pubblico GitHub disattiva le schedulazioni dopo 60 giorni senza attività.

## Storico delle modifiche

| Data | Feature | Modifica |
|---|---|---|
| 2026-11-24 | FEAT-2026-001 | Prima stesura (F4, T18) |
