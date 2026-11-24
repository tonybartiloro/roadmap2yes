# Scelte

Scelte raccoglie le decisioni che dovete prendere. In questa versione ce ne sono due: la **data** e la **location**. Ogni decisione ha una domanda, le opzioni candidate, un'opzione scelta (se c'è) e uno storico.

## Stati

- **Aperta**: non avete ancora scelto.
- **Presa**: avete scelto un'opzione.
- **Da rivedere**: avete riaperto la scelta.

## Data del matrimonio

Gli scenari di data che avete inserito all'onboarding sono le opzioni della decisione "Data". Ognuno è una data precisa o un periodo. Potete aggiungerne altri, anche contemporaneamente (per esempio settembre 2027, maggio–giugno 2028 e settembre 2028).

Per ogni scenario vedete:

- il badge di riferimento (provvisorio, definitivo o scartato);
- la location collegata, se c'è;
- le reazioni dei due partner ("Preferisco" o "Dubbioso"), visibili all'altro come indicazione;
- le azioni: "Imposta come riferimento", "Anteprima" e "Scegli questa data".

"Imposta come riferimento" serve a far calcolare il Percorso su quella data senza ancora sceglierla. "Scegli questa data" invece chiude la decisione: l'app mostra un riepilogo ("Le scadenze del Percorso si calcoleranno su questa data") e chiede conferma. Dopo la scelta gli altri scenari diventano "scartati" e la data è definitiva.

Una data prima del 3 settembre 2027 mostra un avviso, ma non vi blocca.

## Location

La location è una scelta a sé. Ogni opzione ha un nome, un comune, un link, delle note, pro e contro (con icone + e −) e un costo indicativo facoltativo. Il confronto completo tra data e location arriverà nelle prossime versioni: per ora una data può essere **collegata** a una location candidata, e in quel caso la location compare ovunque compaia la data.

Se cancellate una location collegata, il collegamento si toglie da solo e lo storico lo registra. Una location scartata resta visibile come "(scartata)".

## Confronto

Su telefono "Confronta 2" apre una tabella con le etichette fisse a sinistra: potete scorrerla in orizzontale. Da 768 px in su le opzioni sono affiancate. Le opzioni scartate sono in una sezione chiusa, ma non sono mai nascoste.

## Scegliere, riaprire e annotare

- **Scegliere**: si fa con "Scegli" dall'opzione, dopo una conferma con il riepilogo della conseguenza.
- **Riaprire**: serve un **motivo** obbligatorio (un campo con contatore: senza motivo non si riapre). Dopo la riapertura la data torna provvisoria e le scadenze dipendenti sono segnate "Da rivedere" nel Percorso, con il banner "Data riaperta".
- **Aggiungere una nota**: si accoda allo storico. Le voci già scritte non si modificano, né si cancellano.

Lo storico è in sola lettura e mostra chi ha fatto cosa e quando. Esempio: "Tony ha impostato il 14 maggio 2028 come riferimento provvisorio".

## Reazioni

"Preferisco" e "Dubbioso" sono indicazioni leggere: non bloccano nulla e non sono un voto. Servono a capire cosa pensa l'altro prima di decidere.

## Storico delle modifiche

| Data | Feature | Modifica |
|---|---|---|
| 2026-11-24 | FEAT-2026-001 | Prima stesura (F4, T18) |
