# Accesso e codici

## Come si entra

Entrate con la vostra **email** e il vostro **codice d'accesso**. Il codice è una password: deve avere **almeno 10 caratteri, con lettere e cifre**. Non ci sono link magici né codici mandati per email: l'accesso funziona anche quando le email dell'app sono spente.

Se la email o il codice non sono giusti, l'app dice sempre la stessa cosa ("Email o codice non corretti"): non vi dice se l'indirizzo esiste.

Dopo troppi tentativi sbagliati l'accesso si blocca per **15 minuti**: dopo 5 errori con la stessa email, o 20 dallo stesso indirizzo di rete. Il messaggio è "Troppi tentativi. Riprova tra 15 minuti." e vale per qualunque email.

Il codice non è mai salvato in chiaro: il servizio di accesso conserva solo una sua forma cifrata (hash). Non lo può leggere nessuno, nemmeno chi gestisce l'app, e non compare nei registri dell'app.

## Dopo l'accesso

L'app decide dove mandarvi, in quest'ordine:

1. se il codice è temporaneo, vi chiede di sceglierne uno vostro prima di tutto;
2. se avete già uno spazio, vi porta alla Home (o riprende l'onboarding se non l'avete finito);
3. se avete un invito in sospeso per la vostra email, vi fa entrare nello spazio di chi vi ha invitato;
4. se siete il primo partner e non c'è ancora nulla, crea lo spazio e vi porta all'onboarding;
5. altrimenti mostra "Questo spazio è su invito".

## Cambiare il proprio codice

In **Altro > Account** inserite il codice attuale e poi il nuovo. Il nuovo codice vale da subito per il prossimo accesso.

Se il codice è stato impostato da vostro partner come **codice temporaneo**, la schermata lo dice chiaramente e non potete continuare senza sceglierne uno vostro.

Il codice iniziale che vostro partner ha scelto per voi all'invito è un suggerimento: potete cambiarlo quando volete (l'app ve lo ricorda con un banner, senza bloccarvi).

## Cambiare la propria email

Dopo il primo accesso ciascuno cambia solo la propria email, in **Altro > Account**: inserite la nuova email due volte e il codice attuale. Non serve confermare nulla via email. Se sbagliate a scriverla, potete correggerla finché siete collegati.

Se avete cambiato email da scollegati o qualcosa non torna, va sistemato da chi gestisce l'app.

Finché il partner invitato non è mai entrato, l'altro partner può correggerne l'email da **Altro > Invito**.

## Codice dimenticato

Ci sono due strade.

- **Il partner imposta un codice temporaneo (sempre disponibile).** Il partner che è dentro l'app va in **Altro > Invito** e imposta un codice temporaneo per l'altro. Lo consegna di persona. Al primo accesso chi l'ha dimenticato deve scegliere subito un codice nuovo. Il partner riceve nell'app la novità "codice temporaneo impostato da ...", così la cosa resta visibile a entrambi.
- **Link di recupero via email (solo con le email accese).** Dalla pagina di accesso, "Hai dimenticato il codice?" manda un link. Il link vale una volta e porta a una pagina dove scegliete il nuovo codice. Con le email spente questa voce non compare e la pagina spiega di chiedere al partner.

Se nessuno dei due ricorda il codice e le email sono spente, serve un intervento di chi gestisce l'app (vedi il runbook in `docs/technical/ambienti-e-rilascio.md`).

## Invitare il partner

Il primo partner crea l'account per l'altro. Ci sono due modi.

### Con codice (sempre disponibile)

1. Inserite l'email del partner, un'etichetta e un codice iniziale. Potete scriverlo voi o usare "Genera un codice": è un codice casuale di 12 caratteri, in gruppi di 4.
2. Consegnate il codice di persona. L'app non lo mostra più dopo la conferma.
3. Il partner entra con la sua email e il codice. Da quel momento è membro dello spazio e vede tutto con pari diritti.

Finché il partner non è entrato potete revocare l'invito in **Altro > Invito**: l'account creato per lui viene eliminato e lui non entra più. Dopo il primo accesso l'invito non si può più revocare.

Un matrimonio ha al massimo due partner, e un solo invito in sospeso alla volta.

### Con link via email (solo con le email accese)

1. Inviate l'invito all'email del partner.
2. Il link vale **7 giorni** o finché il partner non lo usa per entrare, e vale solo per quella email.
3. Il partner apre il link, sceglie il proprio codice e accede.

Dalla stessa pagina potete "Invia di nuovo" (il vecchio link smette di funzionare) o "Revoca".

Quando il link si apre, la pagina mostra solo il nome di chi vi invita. Se il link è scaduto, già usato, annullato o non è per la vostra email, la pagina lo dice e indica cosa fare.

## Storico delle modifiche

| Data | Feature | Modifica |
|---|---|---|
| 2026-11-24 | FEAT-2026-001 | Prima stesura con il modello email + codice d'accesso (F4, T18). Sostituisce la versione con link magico e codice a 6 cifre. |
