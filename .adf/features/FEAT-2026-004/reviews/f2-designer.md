# FEAT-2026-004 — Revisione F2 del designer (design.md rispetto a brief e plan.md)

Verdetto: **design.md approvabile; il piano copre quasi tutti gli stati, con 7 punti da precisare (should) e 6 note.** Nessun blocco. Round precedente: obiezioni F1 DES-1..DES-23 chiuse nella tabella seguente.

## Chiusura delle obiezioni F1
| ID | Esito | Dove |
|---|---|---|
| DES-1, 2, 3, 5, 6, 8, 9, 11 (tranne filtri), 12, 14, 15, 16, 18, 19, 20, 22, 23 | accolta | AC1-AC12, design §1 |
| DES-17 | accolta in parte: 429 invece della pagina neutra, solo all'apertura; limite per IP solo sui link non validi | AC10, BR9, design §1.1 D |
| DES-4, 7, 10, 13 | rimandata a R-07 (D1) | brief "Rimandato" |
| DES-11 (filtri) | rimandata a R-07 | |
| DES-21 | respinta, possibile seguito | brief |

## Nuove obiezioni (continuano la numerazione)
| ID | Gravità | Evidenza | Proposta |
|---|---|---|---|
| DES-24 | should | Il piano dice che il modulo "funziona senza JS", ma non come si passa dal riepilogo a "Modifica" (e viceversa) senza JS: un `useState` non funziona. | Riepilogo + modulo dentro un `<details>`/`summary` ("Modifica") renderizzato dal server; stesso markup con JS. Aggiungere a T7 e al test e2e "senza JS". |
| DES-25 | should | `rsvp_submit` può rispondere `ok:false` (revoca o scadenza durante la compilazione, AC11) ma il piano parla di `notFound()` solo per l'apertura; una server action non cambia lo stato HTTP e la pagina già mostra i nomi. | La action restituisce `{state:"unavailable"}` e la pagina sostituisce **tutto** il contenuto con `LinkUnavailable` (nomi e data spariscono), stesso testo della 404. Test e2e dedicato. |
| DES-26 | should | `useActionState` (React 19) azzera i campi non controllati dopo l'azione; e un invio offline non è una risposta ma un'eccezione del fetch. Il piano non dice come si conservano le scelte (AC11 vieta solo le bozze nel dispositivo) né come si mostra l'errore di rete. | Campi controllati o `defaultValue` dall'ultimo stato inviato; `try/catch` che dà "Non sono riuscito a salvare. Controlla la connessione e riprova." in `role="alert"`. Test e2e offline (Playwright `setOffline`). |
| DES-27 | should | T9 mette lo stato del link solo sul titolo del gruppo e nel foglio persona: per i destinatari individuali (senza gruppo o gruppo "separato") la lista non mostra nulla, quindi AC8 ("ogni destinatario mostra lo stato del link") non è verificabile a colpo d'occhio. | Seconda riga attenuata nella riga persona individuale (design §1.2); aggiungere a T9 e al test di `GuestRow`; `rowColumns` e `row-columns.test.ts` nei file di T9. |
| DES-28 | should | `undo_guest_import` ora salta chi ha risposto o ha un link, ma nessun task cambia `ImportSheet`/`import-actions.ts`: l'utente vede "Annullata" mentre alcune persone restano. | La RPC rende quante ne ha saltate; il toast dice "Ho annullato 36 persone; 2 restano perché hanno già risposto o hanno un link". Aggiungere i file a T6/T9 e un caso e2e. |
| DES-29 | should | La pagina 429 è HTML minimo scritto a mano nel proxy: nessun tema, nessun test di accessibilità; rischio di `lang`, viewport, contrasto e modo scuro mancanti. | `lang="it"`, viewport, `color-scheme` + CSS inline chiaro/scuro, h1, 18 px, `Retry-After`; aggiungerla all'elenco di `e2e/a11y.spec.ts` e ai controlli visivi. |
| DES-30 | should | AC12 chiede "Crea un nuovo link" dopo la scadenza; Q-P1 del piano lo toglie (il nuovo link nascerebbe scaduto). Anche "Crea link per tutti" e "Nuovo link" si comportano allo stesso modo. | Accolgo Q-P1: il foglio dice "Scaduto il {data}. Se sposti la data, i link tornano a funzionare da soli." senza Crea/Nuovo; "Crea link per tutti" disattivato con testo. **Il brief va allineato (AC12).** |
| DES-31 | note | "Crea link per tutti (N)": il piano non dice cosa conta N, né la conferma, né l'esito. | N = destinatari senza link funzionante (inclusi "Da rimandare"); conferma con N; toast "Ho creato N link"; nessun Annulla (si revoca dal foglio). |
| DES-32 | note | Il foglio carica l'URL all'apertura e può trovare l'hash diverso ("va rigenerato") o il segreto assente: stati senza testo. | Skeleton breve; "Questo link va rigenerato" + "Nuovo link"; "Non sono riuscito a creare il link" + Riprova (design §2). |
| DES-33 | note | "Da rimandare" dal solo elenco di id (`resend_guest_ids`) dice poco alla coppia. | Spiegazione fissa e nomi delle persone interessate (design §1.2). |
| DES-34 | note | Senza JS non esistono "Vengono tutti", contatore, comparsa delle preferenze. | Senza JS le preferenze sono sempre visibili ("Solo se vieni"); validazione "zero scelte" lato server (design §1.1). |
| DES-35 | note | Gruppi "ognuno per sé" con molte persone: condividere vuol dire aprire un foglio per persona (la coda è R-07). | Accettato per questo passo; ricordarlo nell'avvio di R-07 e in Guida. |
| DES-36 | note | Il messaggio WhatsApp e la nota privacy sono copy nuovo che la Guida deve riprendere (T12). | Guida "Conferme di presenza": messaggio, stati del link, "Da rimandare", modalità del gruppo. |

## Copertura del piano rispetto agli stati del design
| Stato | Coperto | Note |
|---|---|---|
| Pagina valida; data/location non scelte; gruppo "insieme"; bambini/neonati (categoria, Q-P3) | sì | T2, T7 |
| Neutra (5 cause, 404 identica); tema predefinito | sì | `not-found.tsx`, T10 |
| 429 apertura; blocco invii nel modulo | sì (Q-P2) | DES-29 |
| Successo, "erano già cambiate", Modifica, riapertura | in parte | DES-24 |
| Errori, offline, revoca durante la compilazione | in parte | DES-25, DES-26 |
| Senza JS | in parte | DES-24, DES-34 |
| Scaduto (sola lettura dopo scadenza non esiste più; scadenza = neutra) | sì | DES-30 |
| Coppia: stato in lista, foglio link, copia/Condividi/WhatsApp, Annulla, Nuovo/Revoca, Da rimandare, modalità gruppo | sì | DES-27, 31-33 |
| Import annullato che salta chi ha risposto | no | DES-28 |
