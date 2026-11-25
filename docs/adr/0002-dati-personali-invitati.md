# ADR-0002 — Dati personali degli invitati

| Status | Date | Deciders | Related feature | Supersedes |
|---|---|---|---|---|
| proposed | 2026-11-25 | architect (proposta); tonybartiloro (da approvare al Gate B) | FEAT-2026-003 (`.adf/features/FEAT-2026-003/plan.md`) | — |

## Context
- **Dati di terzi**: con R-03 l'app conserva per la prima volta dati di persone che non sono utenti: nome, cognome, telefono, email, note (anche allergie, cioè dati sulla salute), gruppo familiare, lato, tavolo.
- **Precedenti da non copiare** (ADR-0001, FEAT-2026-001):
  - `audit_log` è append-only: nessun UPDATE, DELETE o TRUNCATE, nemmeno con la chiave segreta (`supabase/migrations/20261201100000_core.sql:300-303`);
  - `private.audit_row` copia tutta la riga in `old_data`/`new_data` (`core.sql:311-340`);
  - le tabelle di dominio usano solo l'eliminazione logica (`deleted_at`) e nessun job le svuota.
  - Applicato agli invitati, questo schema conserverebbe per sempre i loro dati personali, senza alcun modo di cancellarli.
- **Repository pubblico**: niente dati reali in codice, seed, fixture, log CI.
- **Roadmap**:
  - R-04 (RSVP) darà accesso **senza login** a una pagina con i dati del proprio invitato o gruppo;
  - R-06 (sala visuale) userà forma e posizione dei tavoli.
- **Decisioni dello sviluppatore** (brief FEAT-2026-003, 2026-11-25):
  - nessun tetto al numero di invitati;
  - nessuna scadenza automatica degli eliminati;
  - "Elimina definitivamente" e "Svuota" cancellano davvero.

## Decision
1. **Audit senza dati personali.**
   - Le tabelle `guests`, `guest_groups` e `guest_tables` hanno il trigger `audit_row`, ma con le colonne personali escluse tramite l'argomento del trigger, che esiste già:
     - `guests`: `first_name`, `last_name`, `phone`, `email`, `notes`;
     - `guest_groups` e `guest_tables`: `name`.
   - L'audit conserva chi, quando e l'operazione, più gli identificativi e i campi strutturali (categoria, lato, gruppo, tavolo, `deleted_at`).
   - Le tabelle degli invitati non entrano in "Novità" né nel job (whitelist `AUDIT_TABLES`).
2. **Cancellazione vera.**
   - L'eliminazione normale resta logica (Annulla, "Eliminati di recente").
   - "Elimina definitivamente" e "Svuota" sono un `DELETE` fisico, permesso dalla RLS solo su righe già eliminate logicamente e solo con il permesso `guests/delete`.
   - Le chiavi esterne verso gruppi e tavoli si azzerano (`on delete set null (col)`).
   - Dopo la cancellazione il dato non esiste più né nel database né nell'audit, e non compare in nessuna esportazione futura.
   - Restano due eccezioni:
     - i backup gestiti da Supabase, che ruotano da soli;
     - i file già scaricati dalla coppia.
3. **Mai `anon` sulle tabelle degli invitati.**
   - Nessun grant né policy per `anon`, ora e in R-04.
   - La pagina pubblica di R-04 leggerà e scriverà solo tramite RPC `SECURITY DEFINER` chiamate con la chiave segreta, con questo schema:
     - il link contiene un token casuale;
     - il DB conserva solo il suo sha256;
     - la risposta è neutra per token sconosciuto, revocato o scaduto;
     - si espongono i dati minimi dell'invitato o del gruppo collegato.
   - È lo stesso schema di `invitation_by_token` (`core.sql:1012-1042`).
   - Le tabelle di R-04 si chiameranno `rsvp_*`, mai `invitations` (che già indica gli inviti del partner).
4. **Modello estendibile senza migrazioni distruttive.**
   - Identificativi uuid stabili per invitato, gruppo e tavolo, con FK composte `(id, wedding_id)`.
   - Il lato si salva come `A`/`B`/`both` (mai il nome del partner).
   - Categoria e forma sono `text` con `check`, che si allarga quando serve.
   - Il tavolo ha forma e posizione facoltative per R-06.
5. **Permessi.**
   - Nuova area `guests` in `private.role_permissions`: `read`, `write` e la nuova azione `delete` (il `check` si allarga), solo per `partner`.
   - Famiglia e planner non hanno righe: per loro la RLS nega tutto.
6. **Nessun dato reale fuori dal database.**
   - Seed, fixture ed e2e usano solo nomi inventati ed email `@example.test`.
   - I log del server registrano solo codici d'errore, mai valori dei campi.
   - Nessun invitato finisce in analytics.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Audit completo come le altre tabelle | Storico completo | Dati personali (anche sanitari) non cancellabili per sempre |
| Nessun audit sulle tabelle degli invitati | Più semplice | Si perde chi ha cambiato cosa anche per i dati non personali; eccezione alla regola "ogni dato di dominio è tracciato" |
| Purga automatica dopo N giorni (job giornaliero) | Pulizia senza azioni | Respinta dallo sviluppatore: i dati spariscono senza una scelta esplicita |
| Cifratura delle colonne (pgsodium/Vault) | Difesa in profondità | Complessità e chiavi da gestire; con RLS come unico confine non cambia chi può leggere |
| Lettura pubblica R-04 via policy `anon` con token nel JWT | Niente RPC | La superficie `anon` su dati personali diventa permanente; un errore di policy espone tutti gli invitati |

## Consequences
- **Positive**:
  - la coppia può cancellare davvero i dati di un invitato;
  - l'audit resta utile senza diventare un archivio di dati personali;
  - R-04 e R-06 si aggiungono con sole migrazioni additive;
  - nessuna nuova dipendenza né servizio.
- **Negative**:
  - l'audit degli invitati non permette di ricostruire un nome o un telefono cambiato per errore;
  - la cancellazione definitiva è irreversibile, quindi serve una conferma esplicita;
  - i backup del fornitore conservano i dati fino alla loro rotazione.
- **Follow-up**:
  - R-04: tabella `rsvp_links` (hash del token, invitato o gruppo, scadenza, revoca), rate limit e `noindex`;
  - eventuale informativa privacy per la pagina pubblica.

## Compliance
- **pgTAP**:
  - RLS nega lettura e scrittura a `anon`, a un altro matrimonio e a un utente `family`/`planner`;
  - dopo insert, update e delete su invitati, gruppi e tavoli, `audit_log.old_data`/`new_data` non contengono le chiavi escluse;
  - `DELETE` rifiutato su righe non eliminate logicamente e senza `guests/delete`;
  - allowlist delle funzioni e oracolo del catalogo aggiornati.
- **Test d'accettazione via PostgREST** con JWT reali: stessi dinieghi.
- **Revisione**:
  - round di sicurezza sulla migrazione e sulle server action (nessun valore nei log);
  - gitleaks e controllo delle email `@example.test`, che già girano in CI.
