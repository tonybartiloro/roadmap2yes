# FEAT-2026-003 — F1 designer: obiezioni al brief

Riferimenti: `design.md` (bozza). Gravità: blocking / should / note. Nessun AC modificato.

| ID | Gravità | Evidenza | Proposta |
|---|---|---|---|
| DES-1 | blocking | Q4: la proposta del PO sposta Guida in Opzioni, contro la richiesta esplicita dello sviluppatore (R-02: "come ultima voce del menu"). A 320 px 7 voci = 45,7 px a cella. | Decisione dello sviluppatore tra A (7 voci, 11 px sotto 360 px, la mia proposta), B (PO), C (solo icone, sconsigliata), D (dentro Scelte, sconsigliata). Dettaglio in `design.md`. |
| DES-2 | should | AC2 copre un invitato alla volta: 100+ nomi di fila senza "aggiungi un altro" sono una fatica. | Aggiungere un AC: "Salva e aggiungi un altro" mantiene tipo, lato, gruppo, tavolo e riporta il focus al nome. |
| DES-3 | should | AC5 non dice come si crea una famiglia: crea gruppo, poi assegna uno a uno è lento. | AC: "Nuova famiglia" crea gruppo e N persone in un solo salvataggio; "Nuovo gruppo…" inline nel modulo; "Aggiungi persona" dal gruppo. |
| DES-4 | should | AC7/AC8: con 6 filtri e conteggi a 320 px rischio rumore; AC8 "conteggi del filtrato" si confonde con AC7. | Riepilogo su una riga, "Per lato" comprimibile, filtri in sheet con chip; con filtri "12 di 42 persone". Sticky non necessario. |
| DES-5 | should | AC9 "assegna invitati o un intero gruppo" non dice il meccanismo (niente drag and drop in ambito); mancano selezione multipla e conflitto con persone già sedute. | AC: selezione multipla (assegna a gruppo/tavolo/elimina); dal tavolo "Aggiungi un gruppo intero" con conferma se qualcuno è già seduto altrove. |
| DES-6 | should | AC12: non definito cosa succede con righe errate (tutto o niente?), lato/tipo non riconosciuti, una sola colonna "Mario Rossi", anteprima su mobile, correzione senza perdere il testo. | Importa le valide e dichiara le saltate (sì/no? vedi domanda D2); anteprima a carte; "Torna indietro" conserva il testo; una colonna = intero nel campo nome, nessuno split. |
| DES-7 | should | Un'importazione da 500 righe sbagliata si corregge solo eliminando una per una. | AC: dopo l'import toast "Annulla importazione" (≥ 8 s) che rimuove i creati. |
| DES-8 | should | AC3/AC6/AC11: "Eliminati di recente" copre solo gli invitati; gruppi e tavoli solo col toast: dopo 8 s l'appartenenza persa non si ripristina. | Dichiararlo nel brief (accettabile: gruppi e tavoli solo toast) oppure includerli nel ripristino. Domanda D3. |
| DES-9 | should | Q1/BR6: campo fascia "non modificabile" a mano può diventare un campo disabilitato muto. | Testo "Sei a 62 persone: fascia 50-80" + link alla lista; mai solo disabilitato. |
| DES-10 | should | AC11: "nessuna schermata li mostra" vs una scheda Tavoli sempre visibile: ambiguo. | Scheda Tavoli sempre presente con vuoto calmo; filtri, campo e conteggi sui tavoli nascosti finché non ne esistono. Chiarire nell'AC11. |
| DES-11 | should | AC13/AC14: l'esportazione è solo nella pagina Invitati; l'utente cerca anche in Opzioni > Esportazione. Non detto se l'export rispetta i filtri. | Anche in Opzioni > Esportazione; esporta sempre tutti, con testo esplicito. |
| DES-12 | should | AC1/AC15: voce di menu e URL diretto per chi non ha permesso `guests` non specificati. | Voce nascosta senza permesso; URL diretto = schermata "su invito" esistente. |
| DES-13 | note | BR4: un avviso duplicato che richiede un clic in più rallenta l'inserimento. | Avviso inline non bloccante; in import è un "avviso", non un errore. |
| DES-14 | note | AC4/AC2: telefono ed email con validazione severa respingono formati legittimi. | `type=tel`, `inputmode`; controllo lasco (cifre, +, spazi); email con regole standard. |
| DES-15 | note | Liste fino a 500 righe: gruppi tutti aperti = pagina lunghissima. | Gruppi chiusi di default oltre 100 righe; niente virtualizzazione (basta). |
| DES-16 | note | Q2: aggiungere "Neonato" dopo costa una migrazione dell'enum. | Tenere due categorie ora, ma modellare il tipo come testo/enum estendibile (decide l'architetto). |

## Domande per lo sviluppatore (con proposta)
- **D1 (Q4)**: 7 voci con Guida ultima (A) o Guida in Opzioni (B)? Propongo A, con ripiego B se a 320 px non regge.
- **D2**: in import le righe errate sono saltate (propongo sì, dichiarandole in anteprima) o blocca tutto finché non sono corrette?
- **D3**: gruppi e tavoli eliminati si ripristinano solo col toast (propongo sì) o anche da "Eliminati di recente"?
