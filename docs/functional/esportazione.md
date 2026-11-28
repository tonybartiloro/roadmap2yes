# Esportazione

Potete scaricare una copia dei vostri dati in qualunque momento: è l'unico modo per avere un backup da tenere fuori dall'app, perché il piano gratuito del servizio non offre copie di sicurezza scaricabili.

## Cosa scaricate

In **Opzioni > Esporta** trovate quattro pulsanti. Ognuno scarica un file separato, con la data di oggi nel nome.

| File | Contenuto |
|---|---|
| Tutto in un file (JSON) | Tutto: profili, impostazioni, scelte e storico, Percorso, budget, scenari di data, con la location collegata a ogni data, e gli invitati con i loro gruppi, tavoli, risposte alla presenza e stato dei link (mai il link stesso). |
| Compiti (CSV) | I compiti del Percorso, uno per riga. |
| Budget (CSV) | Categorie, voci e pagamenti. |
| Invitati (CSV) | Tutti gli invitati vivi, con le colonne dell'importazione. |

I CSV usano il punto e virgola come separatore e si aprono in Excel o Numbers.

Il file non contiene le password né i codici, e nemmeno identificativi tecnici degli account. Contiene le email di voi due, perché sono dati della coppia.

## Gli invitati

Il file **Invitati (CSV)** contiene **tutti** gli invitati vivi, anche se in Invitati hai dei filtri attivi. Il pulsante dice: "Esporta tutti gli invitati, anche se hai dei filtri attivi. Gli eliminati non sono inclusi."

Nel CSV gli eliminati non ci sono mai. Nel JSON completo, invece, gli eliminati di recente ci sono, marcati con `deleted: true`. Quando li elimini definitivamente, spariscono da ogni esportazione successiva.

Nel JSON completo gli invitati stanno nelle voci `guests`, con i gruppi in `guestGroups` e i tavoli in `guestTables`. Le risposte alla presenza sono in `rsvpResponses` e lo stato dei link in `rsvpLinks`: vedi [Conferme di presenza](conferme-di-presenza.md). Nel file non c'è mai il link.

Il CSV degli invitati usa le stesse colonne dell'importazione: reimportandolo in Invitati ottieni gli stessi dati. Vedi [Invitati](invitati.md).

**Dati di terzi.** Gli invitati hanno nome, telefono, email e note: sono dati di persone che non usano l'app. Tenete i file in un posto sicuro e non mandateli a chi non deve vederli. Un file già scaricato non si aggiorna da solo: se poi elimini un invitato definitivamente, la copia che hai scaricato resta sul tuo dispositivo finché non la cancelli tu.

## Promemoria dell'ultimo export

L'app ricorda la data dell'ultimo export. Dopo 30 giorni, la Home ve lo segnala con "ultimo export: N giorni fa".

## Su iPhone

Su Safari il file si salva dal foglio di condivisione o dai download, come per ogni altro file scaricato.

## Storico delle modifiche

| Data | Feature | Modifica |
|---|---|---|
| 2026-11-24 | FEAT-2026-001 | Prima stesura (F4, T18) |
| 2026-11-25 | FEAT-2026-002 | "Altro" diventa "Opzioni" |
| 2026-11-25 | FEAT-2026-003 | Invitati (CSV) e invitati, gruppi e tavoli nel JSON completo; quattro pulsanti |
| 2026-11-28 | FEAT-2026-004 | JSON completo con `rsvpResponses` e `rsvpLinks` (senza link); il CSV degli invitati non cambia |
