import {
  linkState,
  linkStateText,
  presenceSummary,
  recipientsOf,
  type LinkState,
  type Presence,
  type Recipient,
  type RsvpSnapshot,
} from "@/features/rsvp/view";
import type { GroupView, GuestView } from "./data";

/** What the list knows about one person's RSVP. */
export interface GuestRsvp {
  presence: Presence;
  /** Set for someone who is a recipient on their own: the state of their personal link. */
  link: { recipient: Recipient; state: LinkState } | null;
}

/** RSVP of a group title. */
export interface GroupRsvp {
  /** "2 sì · 1 in attesa". */
  summary: string;
  /** Who the group's link is for (a "together" group with live people), else `null`. */
  recipient: Recipient | null;
  state: LinkState | null;
  /** Second line of the title; `null` = none (an empty group). */
  line: string | null;
}

/** Shared by every person without a response, so a memoised row sees the same object. */
export const NO_RSVP: GuestRsvp = { presence: "pending", link: null };

/** The per-person and per-group RSVP of the list, from the snapshot (pure; `now` is a parameter). */
export function buildRsvpModel(
  live: readonly GuestView[],
  groups: readonly GroupView[],
  snapshot: RsvpSnapshot,
  now: Date,
): {
  guests: Map<string, GuestRsvp>;
  groups: Map<string, GroupRsvp>;
  recipients: Recipient[];
} {
  const status = new Map(snapshot.responses.map((r) => [r.guestId, r.status]));
  const presence = (id: string): Presence => status.get(id) ?? "pending";
  const recipients = recipientsOf(live, groups);
  const guestMap = new Map<string, GuestRsvp>();
  const groupRecipient = new Map<string, Recipient>();
  for (const r of recipients) {
    if (r.kind === "group") groupRecipient.set(r.id, r);
    else {
      const state = linkState(r, snapshot, now);
      guestMap.set(r.id, { presence: presence(r.id), link: { recipient: r, state } });
    }
  }
  for (const g of live) {
    if (!guestMap.has(g.id)) guestMap.set(g.id, { presence: presence(g.id), link: null });
  }
  const groupMap = new Map<string, GroupRsvp>();
  for (const group of groups.filter((g) => !g.deletedAt)) {
    const memberIds = live.filter((g) => g.groupId === group.id).map((g) => g.id);
    const summary = presenceSummary(memberIds, snapshot.responses);
    const recipient = groupRecipient.get(group.id) ?? null;
    if ((group.rsvpMode ?? "together") === "separate") {
      groupMap.set(group.id, {
        summary,
        recipient: null,
        state: null,
        line: "Risponde ognuno per sé",
      });
    } else {
      const state = recipient ? linkState(recipient, snapshot, now) : null;
      groupMap.set(group.id, {
        summary,
        recipient,
        state,
        line: state ? linkStateText(state) : null,
      });
    }
  }
  return { guests: guestMap, groups: groupMap, recipients };
}
