import { MONTHS_LONG, formatLongDate } from "@/components/format";
import { todayInRome, type PlainDate } from "@/lib/dates/plain-date";
import type { GroupView, GuestView } from "@/features/guests/data";

/**
 * Pure rules of the couple side of RSVP (plan "Regole in SQL"): who a link is FOR (recipients), the
 * state shown for it, the summary of a group and the WhatsApp text. SQL stays the single source of
 * "does the link work" (`rsvp_status`); this file only reads what it says. No I/O, no clock: `now`
 * is a parameter.
 */

export type PresenceStatus = "yes" | "no";
export type Presence = PresenceStatus | "pending";

export interface RsvpLink {
  id: string;
  groupId: string | null;
  guestId: string | null;
  working: boolean;
  revokedAt: string | null;
  sharedAt: string | null;
  createdAt: string;
}

export interface RsvpResponse {
  guestId: string;
  status: PresenceStatus;
  diet: string[];
  dietNote: string | null;
  answeredAt: string;
}

/** What `loadRsvp` hands to the screens. */
export interface RsvpSnapshot {
  /** Last day the links work (chosen date + 30), `null` while the date is not chosen. */
  expiresOn: PlainDate | null;
  links: RsvpLink[];
  /** People of a shared link that no working link covers now ("Da rimandare"). */
  resendGuestIds: string[];
  responses: RsvpResponse[];
}

// ---------------------------------------------------------------- recipients

/** Someone a link is made FOR: a "together" group, or a person alone (no group / "separate"). */
export interface Recipient {
  kind: "group" | "guest";
  /** Group id or guest id. */
  id: string;
  name: string;
  /** Live people the link covers (BR1-BR4). */
  memberIds: string[];
}

const fullName = (g: Pick<GuestView, "firstName" | "lastName">): string =>
  [g.firstName, g.lastName].filter(Boolean).join(" ");

/**
 * The recipients of the wedding. Same rule as "Senza gruppo" in R-03 (a deleted group counts as no
 * group). A group of a "together" mode with no live member is not a recipient (its link would
 * never work); a person in a "separate" group, or without a live group, is one on their own.
 */
export function recipientsOf(
  guests: readonly GuestView[],
  groups: readonly GroupView[],
): Recipient[] {
  const live = guests.filter((g) => g.deletedAt === null);
  const groupById = new Map(groups.filter((g) => g.deletedAt === null).map((g) => [g.id, g]));
  const together = new Map<string, string[]>();
  const alone: Recipient[] = [];
  for (const guest of live) {
    const group = guest.groupId ? groupById.get(guest.groupId) : undefined;
    if (group && (group.rsvpMode ?? "together") === "together") {
      const list = together.get(group.id);
      if (list) list.push(guest.id);
      else together.set(group.id, [guest.id]);
    } else {
      alone.push({ kind: "guest", id: guest.id, name: fullName(guest), memberIds: [guest.id] });
    }
  }
  const groupRecipients: Recipient[] = [...together].map(([id, memberIds]) => ({
    kind: "group",
    id,
    name: groupById.get(id)?.name ?? "",
    memberIds,
  }));
  return [...groupRecipients, ...alone];
}

/** The link of a recipient that is not revoked (at most one: AC7), working or not. */
export function linkOf(recipient: Recipient, links: readonly RsvpLink[]): RsvpLink | null {
  return (
    links.find(
      (l) =>
        l.revokedAt === null &&
        (recipient.kind === "group" ? l.groupId === recipient.id : l.guestId === recipient.id),
    ) ?? null
  );
}

// ---------------------------------------------------------------- link state

export type LinkState =
  | { kind: "expired"; on: PlainDate }
  | { kind: "shared"; sharedAt: string }
  | { kind: "to_share" }
  | { kind: "resend"; guestIds: string[] }
  | { kind: "none" };

/** True when the Europe/Rome day of `now` is after `expiresOn` (same rule as the SQL). */
export function isExpired(expiresOn: PlainDate | null, now: Date): boolean {
  return expiresOn !== null && todayInRome(now) > expiresOn;
}

/**
 * State of a recipient. Precedence: 1 Scaduto, 2 Condiviso / Da condividere (a WORKING link),
 * 3 Da rimandare, 4 Nessun link.
 */
export function linkState(recipient: Recipient, snapshot: RsvpSnapshot, now: Date): LinkState {
  if (snapshot.expiresOn !== null && isExpired(snapshot.expiresOn, now)) {
    return { kind: "expired", on: snapshot.expiresOn }; // the date is the last working day
  }
  const link = linkOf(recipient, snapshot.links);
  if (link?.working) {
    return link.sharedAt ? { kind: "shared", sharedAt: link.sharedAt } : { kind: "to_share" };
  }
  const resend = recipient.memberIds.filter((id) => snapshot.resendGuestIds.includes(id));
  if (resend.length > 0) return { kind: "resend", guestIds: resend };
  return { kind: "none" };
}

/** "12 marzo" of an instant, as the Europe/Rome day. */
export function formatSharedDay(sharedAt: string): string {
  const [, month, day] = todayInRome(new Date(sharedAt)).split("-");
  return `${Number(day)} ${MONTHS_LONG[Number(month) - 1]}`;
}

/** The words of a state (text, never colour alone). */
export function linkStateText(state: LinkState): string {
  switch (state.kind) {
    case "expired":
      return `Scaduto il ${formatLongDate(state.on)}`;
    case "shared":
      return `Condiviso il ${formatSharedDay(state.sharedAt)}`;
    case "to_share":
      return "Da condividere";
    case "resend":
      return "Da rimandare";
    case "none":
      return "Nessun link";
  }
}

// ---------------------------------------------------------------- presence

export function presenceOf(guestId: string, responses: readonly RsvpResponse[]): Presence {
  return responses.find((r) => r.guestId === guestId)?.status ?? "pending";
}

/** "2 sì · 1 in attesa" (zeros left out; "" for nobody). */
export function presenceSummary(
  memberIds: readonly string[],
  responses: readonly RsvpResponse[],
): string {
  const counts = { yes: 0, no: 0, pending: 0 };
  for (const id of memberIds) counts[presenceOf(id, responses)] += 1;
  return [
    counts.yes > 0 ? `${counts.yes} sì` : "",
    counts.no > 0 ? `${counts.no} no` : "",
    counts.pending > 0 ? `${counts.pending} in attesa` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "Famiglia Rossi, 2 sì, 1 in attesa, link condiviso il 12 marzo" (design §5). */
export function groupAccessibleName(
  name: string,
  summary: string,
  state: LinkState | null,
): string {
  const text = state ? linkStateText(state) : "";
  return [name, summary.replaceAll(" · ", ", "), text ? `link ${text.toLowerCase()}` : ""]
    .filter(Boolean)
    .join(", ");
}

// ---------------------------------------------------------------- "Crea link per tutti"

export interface CreateAll {
  /** Recipients with no link yet (a "Da rimandare" one included): what the button counts. */
  recipients: Recipient[];
  /** After the expiry nothing can be created (AC12). */
  disabled: boolean;
}

/** `N` of "Crea link per tutti (N)": the recipients with no non-revoked link. */
export function createAllTargets(
  recipients: readonly Recipient[],
  snapshot: RsvpSnapshot,
  now: Date,
): CreateAll {
  return {
    recipients: recipients.filter((r) => linkOf(r, snapshot.links) === null),
    disabled: isExpired(snapshot.expiresOn, now),
  };
}

// ---------------------------------------------------------------- WhatsApp

/** "Anna", "Anna e Luca", "Anna, Luca e Sara"; more than 3 (or none) is "a tutti". */
export function greetingNames(firstNames: readonly string[]): string | null {
  const names = firstNames.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0 || names.length > 3) return null;
  return names.length === 1
    ? names[0]!
    : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/**
 * The message of the sheet (design §1.2): first names, at most 3, otherwise "Ciao a tutti!".
 * `couple` = the partners' first names (those that exist). `url` is the full link.
 */
export function whatsappText(input: {
  firstNames: readonly string[];
  couple: readonly string[];
  url: string;
}): string {
  const names = greetingNames(input.firstNames);
  const hello = names ? `Ciao ${names}!` : "Ciao a tutti!";
  const couple = input.couple.map((n) => n.trim()).filter(Boolean);
  const who =
    couple.length >= 2
      ? `${couple[0]} e ${couple[1]} si sposano e vorrebbero`
      : couple.length === 1
        ? `${couple[0]} si sposa e vorrebbe`
        : "Ci sposiamo e vorremmo";
  return `${hello} ${who} sapere se ci sarete. Rispondi da qui, ci vuole un minuto: ${input.url}`;
}

/** `<a href>` of the WhatsApp button: no JavaScript needed, one tap on iOS too. */
export function whatsappHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** "Hai N link da rimandare" helper: the first names of the people to resend to. */
export function resendNames(guestIds: readonly string[], guests: readonly GuestView[]): string[] {
  const byId = new Map(guests.map((g) => [g.id, g]));
  return guestIds.flatMap((id) => {
    const g = byId.get(id);
    return g ? [fullName(g)] : [];
  });
}
