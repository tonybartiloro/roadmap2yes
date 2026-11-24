import { displayName } from "@/lib/display-name";
import { formatEuro } from "@/lib/money";
import { isPlainDate, parsePlainDate } from "@/lib/dates/plain-date";
import type {
  AccountEventEntry,
  AuditEntry,
  DecisionEventEntry,
  NewsInput,
  NewsItem,
  NewsPerson,
} from "./types";

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/** "12 mar 2027". */
export function formatShortDate(date: string): string {
  if (!isPlainDate(date)) return date;
  const { year, month, day } = parsePlainDate(date);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

const DECISION_PHRASES: Record<string, { object: string; added: string }> = {
  date: { object: "la data", added: "un'opzione per la data" },
  location: { object: "la location", added: "una location" },
};

function decisionObject(key: string): string {
  return DECISION_PHRASES[key]?.object ?? "una scelta";
}

function decisionEventText(e: DecisionEventEntry, who: string): string | null {
  if (e.actorId === null) {
    // System events are never attributed to a person.
    return e.kind === "reference_auto"
      ? `Il riferimento è tornato automatico${e.referenceDate ? `: ora le scadenze seguono il ${formatShortDate(e.referenceDate)}` : ""}`
      : null;
  }
  switch (e.kind) {
    case "chosen":
      return DECISION_PHRASES[e.decisionKey]
        ? `${who} ha scelto ${decisionObject(e.decisionKey)}`
        : `${who} ha fatto una scelta`;
    case "reopened":
      return `${who} ha riaperto la scelta: ${decisionObject(e.decisionKey)}`;
    case "option_added":
      return e.optionTitle
        ? `${who} ha aggiunto un'opzione: ${e.optionTitle}`
        : `${who} ha aggiunto ${DECISION_PHRASES[e.decisionKey]?.added ?? "un'opzione"}`;
    case "reference_set":
      return e.referenceDate
        ? `${who} ha impostato il ${formatShortDate(e.referenceDate)} come riferimento per le scadenze`
        : `${who} ha impostato un riferimento per le scadenze`;
    case "reference_auto":
      return `${who} è tornato al riferimento automatico`;
    default:
      return null; // option_updated / option_removed / note: too noisy for the Home.
  }
}

function accountEventText(
  e: AccountEventEntry,
  who: string,
  viewerId: string,
  nameOf: (id: string | null) => string,
): string {
  switch (e.kind) {
    case "temp_code_set":
      return e.targetUserId === viewerId
        ? `${who} ha impostato un codice temporaneo per te`
        : `${who} ha impostato un codice temporaneo per ${nameOf(e.targetUserId)}`;
    case "code_changed":
      return `${who} ha cambiato il proprio codice d'accesso`;
    case "email_changed":
      return `${who} ha cambiato la propria email di accesso`;
    case "partner_account_created":
      return e.targetUserId === viewerId
        ? `${who} ha creato il tuo accesso`
        : `${who} ha creato l'accesso per ${nameOf(e.targetUserId)}`;
    case "invite_revoked":
      return `${who} ha annullato l'invito`;
  }
}

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** Whitelist of audit changes that matter to the other partner; anything else is `null`. */
function auditText(e: AuditEntry, who: string): string | null {
  const next = e.newData ?? {};
  const prev = e.oldData ?? {};
  switch (e.tableName) {
    case "tasks": {
      const title = str(next.title);
      if (!title) return null;
      if (e.op === "INSERT" && next.source === "user")
        return `${who} ha aggiunto il compito «${title}»`;
      if (e.op === "UPDATE" && prev.status === "todo" && next.status === "done") {
        return `${who} ha completato «${title}»`;
      }
      return null;
    }
    case "budget_versions": {
      const cents = next.total_cents;
      return e.op === "INSERT" && typeof cents === "number" && Number.isSafeInteger(cents)
        ? `${who} ha impostato il budget a ${formatEuro(cents)}`
        : null;
    }
    case "payments":
      return e.op === "UPDATE" && prev.paid !== true && next.paid === true
        ? `${who} ha segnato un pagamento come pagato`
        : null;
    default:
      return null;
  }
}

/**
 * "Novità dall'ultimo accesso" (AC41, plan §9): the other partner's relevant changes after
 * `since`, newest first. Audit rows are filtered through a whitelist; decision and account
 * events are mapped to Italian sentences. The viewer's own actions are left out.
 */
export function buildNews(input: NewsInput): NewsItem[] {
  const { viewerId, since, people } = input;
  if (since === null) return [];
  const byId = new Map<string, NewsPerson>(people.map((p) => [p.userId, p]));
  const nameOf = (id: string | null): string => displayName(id ? byId.get(id) : null);
  const isNew = (at: string, actorId: string | null) =>
    new Date(at).getTime() > new Date(since).getTime() && actorId !== viewerId;

  const items: NewsItem[] = [];
  for (const e of input.audit ?? []) {
    if (e.actorId === null || !isNew(e.at, e.actorId)) continue;
    const text = auditText(e, nameOf(e.actorId));
    if (text)
      items.push({ id: `audit:${e.id}`, at: e.at, actorId: e.actorId, source: "audit", text });
  }
  for (const e of input.accountEvents ?? []) {
    if (!isNew(e.at, e.actorId)) continue;
    const text = accountEventText(e, nameOf(e.actorId), viewerId, nameOf);
    items.push({ id: `account:${e.id}`, at: e.at, actorId: e.actorId, source: "account", text });
  }
  for (const e of input.decisionEvents ?? []) {
    if (!isNew(e.at, e.actorId)) continue;
    const text = decisionEventText(e, nameOf(e.actorId));
    if (text) {
      items.push({
        id: `decision:${e.id}`,
        at: e.at,
        actorId: e.actorId,
        source: "decision",
        text,
      });
    }
  }
  items.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime() || (a.id < b.id ? -1 : 1),
  );
  return input.limit === undefined ? items : items.slice(0, input.limit);
}
