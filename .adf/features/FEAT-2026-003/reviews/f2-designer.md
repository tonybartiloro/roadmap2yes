# FEAT-2026-003 — F2 designer: obiezioni al piano

Verifica di `plan.md` contro `design.md` (finale). Gravità: blocking / should / note. Nessun blocking.

| ID | Gravità | Evidenza | Proposta |
|---|---|---|---|
| DES-17 | should | T9 (tavoli, S2) non possiede `GuestsScreen.tsx` (schede Persone/Tavoli), `GuestRow`/`GuestList` (tavolo nella riga) né `SelectionBar` ("Assegna a tavolo" compare solo con tavoli); sono tutti di T5. T13 lista `GuestsScreen.tsx`, T9 no. | Aggiungere a T9 `GuestsScreen.tsx`, `GuestList.tsx`, `GuestRow.tsx`, `SelectionBar.tsx`; oppure T5 crea già le schede con la scheda Tavoli come segnaposto. |
| DES-18 | should | "Eliminati di recente" (AC10/AC11) include gruppi e tavoli, ma `RecentlyDeleted.tsx` è di T5 e T9 non lo tocca: ripristino, "Elimina definitivamente" e "Svuota" dei tavoli restano senza proprietario; lo stesso per le azioni di tavolo (`tables-actions` non copre il definitivo). | T9 aggiunge `RecentlyDeleted.tsx` e le action di ripristino/definitivo dei tavoli; T4 copre quelle dei gruppi (esplicitarlo). |
| DES-19 | should | AC12 + piano: "gruppi chiusi oltre 100 righe" non basta: "Senza gruppo" o la lista piatta di filtri/ricerca possono avere 1000+ righe in un solo elenco (DOM pesante, test e2e 500 < 1 s). | Mostrare 100 righe alla volta con "Mostra altre 100 (ne restano N)", conteggi sempre sul totale (visibile, non è un troncamento silenzioso). Aggiungere a T5 e al test e2e; vale anche per l'anteprima import e "Eliminati di recente". |
| DES-20 | should | AC7 chiede "Annulla" per le azioni di massa, ma il piano dice "ultimo salvataggio vince" e l'Annulla "richiama il ripristino": per assegnazioni di gruppo/tavolo servono i valori precedenti per id. | T4: l'action restituisce `{id, group_id, table_id}` precedenti e l'Annulla li riscrive; coprirlo in un test di integrazione. |
| DES-21 | should | Dipendenze: T5 usa `HelpLink` creato da T3 ma dichiara solo T2, T4; T13 aggiunge "Esporta" al menu, che nasce in T5 senza voci "Importa"/"Esporta" disattivate. | T5 dipende anche da T3; T5 crea il menu "Altro" con Importa ed Esporta nascosti finché T13/T14 non ci sono (o presenti e funzionanti subito: l'export può stare in T5/T14 senza importazione). |
| DES-22 | should | Stato di errore "schema non ancora migrato" (rischio nel piano): copre `/invitati` e impostazioni, ma non è assegnato a un task di UI con test. | T5 e T6 hanno un test del componente con `ErrorState` e "Riprova"; T8 un e2e che simula l'errore di rete. |
| DES-23 | note | La barra mostra l'icona persone per Invitati; "Profili" in Opzioni usa già `Users`: due significati vicini. | Icona della barra `UsersRound` e `UserRound` per Profili, o viceversa; scelta dello sviluppatore, bassa urgenza. |
| DES-24 | note | T8/T17 verificano nav e axe, ma nessun task verifica "Aiuto" per pagina (mappa route → Guida) né i testi visibili del riepilogo con neonati, "n di N" e dialoghi di eliminazione definitiva. | T8: e2e sul link "Aiuto" di ogni sezione (verso la pagina esistente) e sulle conferme con numero; la verifica visiva è mia, in F3. |
| DES-25 | note | La carta "Guida" in Opzioni deve distinguersi (T3 solo "carta in cima"). | Specificato in `design.md` §1 (bordo `primary`, icona libro); T3 lo implementa. |
| DES-26 | note | T3 elenca le 6 sezioni ma non `PercorsoHeader`'s share con filtri a 320 px: il link "Aiuto" aggiunge una voce alla testata già piena (titolo, riferimento, scenario, filtri). | Verificare in F3 a 320 px; ripiego: "Aiuto" solo icona. |

## Risposte (architetto, 2026-11-25)
- **DES-17: accettata.** T9 prende in sequenza dopo T5 `GuestsScreen`, `GuestList`, `GuestRow`, `SelectionBar` (oltre a `GuestSheet`, `FiltersSheet`, `Summary`); le schede Persone/Tavoli nascono in T9.
- **DES-18: accettata.** T4 fornisce elimina/ripristina/definitivo/svuota per persone, gruppi e tavoli; `RecentlyDeleted` (T5) mostra le tre sezioni. Le action di creazione e modifica dei tavoli sono di T9.
- **DES-19: accettata.** "Mostra altre 100 (ne restano N)" in liste, Eliminati di recente (T5) e anteprima import (T13); verificato in T8 sulla scala.
- **DES-20: accettata**, come QA-1 (P6).
- **DES-21: accettata.** T5 dipende da T3. Il menu di T5 ha solo Seleziona ed Eliminati di recente; T13 aggiunge Importa ed Esporta CSV e "Importa" nello stato vuoto.
- **DES-22: accettata in parte.** Test dei componenti (T5, T6) e d'integrazione (T4: codice `not_migrated`) sì. L'e2e no, con questo motivo: le letture sono lato server e Playwright non può intercettarle; servirebbe un server degradato dedicato, sproporzionato.
- **DES-23: accettata.** Invitati `UsersRound`, Profili `UserCog` (P7, T3).
- **DES-24: accettata.** "Aiuto" di ogni sezione in `invitati.nav.spec` (T8); testi di conferma con numero nelle specifiche di T8 e T10.
- **DES-25 e DES-26: accettate.** T3 implementa il §1; a 320 px "Aiuto" è solo icona, da verificare in F3.

Copertura: ogni schermata del design ha un proprietario (T5 Persone, T9 Tavoli, T13 Importa, T6 impostazioni, T14 export, T3 nav/Aiuto) con i punti sopra; gli stati vuoto/errore/caricamento sono coperti tranne DES-22.
