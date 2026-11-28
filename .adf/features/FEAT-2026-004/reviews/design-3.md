# FEAT-2026-004 — Design review 3 (F3, integrazione: regola DES-03 a 768 px, QA-20, cb33812)

Designer, 2026-11-28, su cb33812. App locale su :3305 (`next dev`), Supabase locale, wedding di prova creato con il seed e2e (solo locale, dati finti: nomi lunghi, tavoli, gruppi, link condivisi / da condividere, risposte Sì/No); DB non resettato. Browser interno a 768 px chiaro e scuro (default Giardino), poi Chromium (Playwright, script nello scratchpad) a 390, 768, 1024, 1280 px × chiaro/scuro × Giardino e Art Deco × lista piatta (ricerca) e raggruppata = 32 combinazioni: screenshot, altezze righe, larghezza e overflow di "Invia", overflow celle, allineamento testata, axe-core (wcag2a/aa/21a/21aa/22aa).

Verdetto: **APPROVED**. Nessun blocking né should; 3 note. `design.md` §1.2 aggiornato con la regola a 768 px.

## Esito dei 4 punti

| Punto | Esito | Evidenza |
|---|---|---|
| Nome `md:leading-tight`, 3 righe | OK | Lista piatta a 768 con "Bartolomeo Esempio-Montefiascone" (caso QA-20): riga **77 px** (limite 80), nome 128 px x 60 px; leggibile, nessun troncamento; chiaro, scuro, Giardino, Art Deco. |
| Gap 0,5 rem, Tipo 4 rem | OK | "Bambino"/"Neonato" stanno in 64 px senza sbordare nella colonna Lato (nessuna cella con `scrollWidth > clientWidth`, 32/32 combinazioni). Colonne Nome/Tipo/Lato/Gruppo/Tavolo/Presenza lette bene. |
| "Invia" 64 px da md, 80 px sotto | OK | 64 x 44 px a 768, 1024, 1280; 80 x 44 px a 390. Testo "Invia" 34 px largo, 15 px di margine per lato, nessun taglio (`overflow` bottone 0); stesso bottone in tutti gli stati (l'etichetta non cambia: "Da condividere" e "Condiviso il…" sono la seconda riga del nome, non il bottone). Bersaglio 44 px alto, 64 largo. |
| Testata allineata alle righe | OK | Left della testata = left delle celle in tutte le righe (±1 px); bordo destro di "Invia" 723 px sia in riga sia nel titolo gruppo (padding testata `md:pr-[5.5rem]`). Icona e testo di Presenza ("Sì", "No", "In attesa") leggibili, nessuna a capo. |
| axe | OK | 0 violazioni in 32/32 (390, 768, 1024, 1280). Nessuno scorrimento orizzontale. |

Regressione 390 px: lista identica per costruzione (tutte le modifiche sono `md:`), verificato: "Invia" 80 x 44, nessun overflow, nessun taglio, axe pulito, chiaro e scuro, due temi. Screenshot: `/private/tmp/claude-501/-Users-tonybartiloro-Documents-roadmap2yes/26aad840-bec8-4c12-808c-00331190ccad/scratchpad/des3-flat-390-light-giardino.png`.

## Findings

| ID | Sev. | Dove | Evidenza | Proposta |
|---|---|---|---|---|
| DES-61 | note | Riga con nome a 3 righe **e** riga link a 768 px | "Giovanni Battista Maria Esposito-Vanvitelli" + "Da condividere": **97 px** (> 80). Il limite di 80 px di QA-20 vale per il nome senza riga link (nei test non c'è); con la riga link (nuova in questa feature) sono 77 + 20. Leggibile, nessun taglio. `des3-flat-768-light-giardino.png` | Accettato. Limite scritto in `design.md`: ≤ 80 px senza riga link, ≤ 100 con. Se QA aggiunge il caso, usare 100. |
| DES-62 | note | "Invia" a 64 px | Il padding del bottone resta 20 px per lato: il testo (34 px) è più largo del contenuto (22 px) e sborda dal padding, simmetrico, dentro il bordo. Nessun taglio, ma con testo molto ingrandito il margine si riduce (la larghezza è in rem, scala con il testo). In più "Invia" del titolo gruppo è 76 px, quello di riga 64 px (stesso bordo destro). | Opzionale: `md:px-2` sul bottone di riga, per dichiarare l'intento. Non serve altro. |
| DES-63 | note | Lista piatta a 768 con nomi di gruppo/tavolo molto lunghi (46 e 29 caratteri) | Colonne Gruppo e Tavolo (circa 67 px) vanno a capo anche a metà parola ("Montefio/re-/Castelnu/ovo") e la riga arriva a 157-185 px. Non causato da cb33812 (regressione assente: nome 1 riga), caso estremo di dati. | Fuori ambito. Se serve: `line-clamp-3` con titolo completo nel foglio. Nessuna azione ora. |

## Non verificato
Schermi reali (iOS/Android), testo ingrandito dal sistema oltre il 100 %; temi diversi da Giardino e Art Deco (il tema è stato forzato con `data-theme`, non scelto dalle impostazioni); screenshot salvati in `.../scratchpad/des3-*.png` (32 file) e report `des3-report.jsonl`.
