# Documentazione tecnica

Come è fatta l'app e come si gestisce. Per l'uso quotidiano vedi [`docs/functional`](../functional/README.md).

| Documento | Di cosa parla |
|---|---|
| [Architettura](architettura.md) | Stack, confini di autorizzazione, orologio iniettabile, flusso delle richieste |
| [Modello dati](modello-dati.md) | Schemi, tabelle, convenzioni e matrice delle scritture |
| [Sicurezza](sicurezza.md) | Ordine DB-prima, codici, limitatore, cookie, token di invito, rischi residui |
| [Email e job](email-e-job.md) | Interruttore delle email, promemoria, job giornaliero, disattivazione |
| [Ambienti e rilascio](ambienti-e-rilascio.md) | Runbook: setup locale, primo utente, variabili, GitHub, Supabase, rilascio, ripristini |
| [Sviluppo locale e test](sviluppo-locale-e-test.md) | Come si lanciano le suite e quali limiti locali esistono |

Decisioni di architettura: [`docs/adr`](../adr/0001-stack-auth-ambienti.md).

## Storico delle modifiche

| Data | Feature | Modifica |
|---|---|---|
| 2026-11-24 | FEAT-2026-001 | Prima stesura (F4, T18) |
| 2026-11-25 | FEAT-2026-002 | Guida d'uso in app: route, lettura e tracciamento, sicurezza, test dei documenti; "Altro" diventa "Opzioni" |
