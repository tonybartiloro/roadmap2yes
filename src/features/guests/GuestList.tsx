"use client";

import { useId } from "react";
import { Pencil, Plus, Reply, Trash2 } from "lucide-react";
import { countGuests } from "@/domain/guests";
import {
  groupAccessibleName,
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
import { GroupHeader } from "./GroupHeader";
import { GuestRow, rowColumns, type GuestRsvp } from "./GuestRow";
import { ShowMore } from "./ShowMore";
import { categorySummary, PAGE_SIZE, type PartnerNames, type Section } from "./view";

export interface ListState {
  /** Rows shown per list key (default one page). */
  shown: Record<string, number>;
  /** Open/closed per group key; absent = the default (closed above 100 people). */
  open: Record<string, boolean>;
}

/** RSVP of a group title (built by `GuestsScreen`). */
export interface GroupRsvp {
  /** "2 sì · 1 in attesa". */
  summary: string;
  /** Who the group's link is for (a "together" group with live people), else `null`. */
  recipient: Recipient | null;
  state: LinkState | null;
  /** Second line of the title; `null` = none (an empty group). */
  line: string | null;
}

/** The couple-side RSVP data of the list; absent while the schema is not migrated. */
export interface RsvpListView {
  canWrite: boolean;
  guests: ReadonlyMap<string, GuestRsvp>;
  groups: ReadonlyMap<string, GroupRsvp>;
  onSend: (recipient: Recipient) => void;
  onMode: (group: GroupView) => void;
}

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

export interface ListHandlers {
  rsvp?: RsvpListView;
  selecting: boolean;
  selected: ReadonlySet<string>;
  /** Live table id to its row label; `null` when there are no live tables (no table text at all). */
  tableLabels: ReadonlyMap<string, string> | null;
  onSelect: (id: string, selected: boolean) => void;
  onOpen: (guest: GuestView) => void;
  onShowMore: (key: string) => void;
  onToggle: (key: string, open: boolean) => void;
  onAddToGroup: (group: GroupView) => void;
  onRename: (group: GroupView) => void;
  onDeleteGroup: (group: GroupView) => void;
}

const keyOf = (id: string | null) => id ?? "none";

/** Column titles from 768 px: decoration (`aria-hidden`), shown ONCE per list, not per group. */
function ColumnHeader({ handlers, withGroup }: { handlers: ListHandlers; withGroup: boolean }) {
  const withTable = handlers.tableLabels !== null;
  return (
    <div
      aria-hidden
      className={`text-muted-foreground border-border hidden border-b py-1.5 pr-3 text-sm font-semibold md:grid md:gap-x-3 ${handlers.selecting ? "md:pl-12" : "md:pl-3"} ${rowColumns(withGroup, withTable, Boolean(handlers.rsvp))}`}
    >
      <span>Nome</span>
      <span>Tipo</span>
      <span>Lato</span>
      {withGroup ? <span>Gruppo</span> : null}
      {withTable ? <span>Tavolo</span> : null}
      {handlers.rsvp ? <span>Presenza</span> : null}
    </div>
  );
}

function Rows({
  id,
  guests,
  state,
  partners,
  groupNames,
  handlers,
}: {
  id: string;
  guests: readonly GuestView[];
  state: ListState;
  partners: PartnerNames;
  /** Group label per guest (flat list only). */
  groupNames: ReadonlyMap<string, string> | null;
  handlers: ListHandlers;
}) {
  const count = state.shown[id] ?? PAGE_SIZE;
  const withGroup = groupNames !== null;
  const withTable = handlers.tableLabels !== null;
  return (
    <>
      <ul id={`list-${id}`} className="flex flex-col">
        {guests.slice(0, count).map((guest) => (
          <GuestRow
            key={guest.id}
            guest={guest}
            partners={partners}
            groupLabel={groupNames?.get(guest.id) ?? null}
            withGroup={withGroup}
            withTable={withTable}
            tableLabel={guest.tableId ? (handlers.tableLabels?.get(guest.tableId) ?? null) : null}
            selecting={handlers.selecting}
            selected={handlers.selected.has(guest.id)}
            onSelect={handlers.onSelect}
            onOpen={handlers.onOpen}
            {...(handlers.rsvp
              ? {
                  rsvp: handlers.rsvp.guests.get(guest.id) ?? { presence: "pending", link: null },
                  ...(handlers.rsvp.canWrite ? { onSend: handlers.rsvp.onSend } : {}),
                }
              : {})}
          />
        ))}
      </ul>
      <div className="p-2">
        <ShowMore remaining={guests.length - count} onClick={() => handlers.onShowMore(id)} />
      </div>
    </>
  );
}

/** Flat alphabetical list, used while a search or a filter is active (group as a label). */
export function FlatList({
  guests,
  groupNames,
  state,
  partners,
  handlers,
}: {
  guests: readonly GuestView[];
  groupNames: ReadonlyMap<string, string>;
  state: ListState;
  partners: PartnerNames;
  handlers: ListHandlers;
}) {
  return (
    <div className="border-border bg-card rounded-lg border" data-testid="guest-list-flat">
      <ColumnHeader handlers={handlers} withGroup />
      <Rows
        id="flat"
        guests={guests}
        state={state}
        partners={partners}
        groupNames={groupNames}
        handlers={handlers}
      />
    </div>
  );
}

function SectionBlock({
  section,
  open,
  state,
  partners,
  handlers,
}: {
  section: Section;
  open: boolean;
  state: ListState;
  partners: PartnerNames;
  handlers: ListHandlers;
}) {
  const key = keyOf(section.id);
  const group = section.group;
  const rsvp = group ? handlers.rsvp?.groups.get(group.id) : undefined;
  const summary = [categorySummary(countGuests(section.members)), rsvp?.summary]
    .filter(Boolean)
    .join(" · ");
  const sendable = handlers.rsvp?.canWrite && rsvp?.recipient;
  const actions = group
    ? [
        {
          label: "Aggiungi persona",
          icon: <Plus aria-hidden />,
          onSelect: () => handlers.onAddToGroup(group),
        },
        {
          label: "Rinomina",
          icon: <Pencil aria-hidden />,
          onSelect: () => handlers.onRename(group),
        },
        ...(handlers.rsvp?.canWrite
          ? [
              {
                label: "Come rispondono",
                icon: <Reply aria-hidden />,
                onSelect: () => handlers.rsvp?.onMode(group),
              },
            ]
          : []),
        {
          label: "Elimina gruppo",
          icon: <Trash2 aria-hidden />,
          destructive: true,
          onSelect: () => handlers.onDeleteGroup(group),
        },
      ]
    : [];
  return (
    <section className="border-border bg-card rounded-lg border" data-testid="guest-group">
      <GroupHeader
        name={section.name}
        summary={summary}
        open={open}
        onToggle={() => handlers.onToggle(key, !open)}
        controlsId={`list-${key}`}
        actions={actions}
        {...(rsvp?.line
          ? {
              rsvp: {
                accessibleName: groupAccessibleName(section.name, summary, rsvp.state),
                line: rsvp.line,
                onSend: sendable && handlers.rsvp ? () => handlers.rsvp?.onSend(sendable) : null,
              },
            }
          : {})}
      />
      {open ? (
        section.members.length === 0 ? (
          <p id={`list-${key}`} className="text-muted-foreground p-3">
            Nessuno qui: aggiungi persone.
          </p>
        ) : (
          <Rows
            id={key}
            guests={section.members}
            state={state}
            partners={partners}
            groupNames={null}
            handlers={handlers}
          />
        )
      ) : null}
    </section>
  );
}

/** The list by groups ("Senza gruppo" last). Groups start closed above 100 people (AC5, AC12). */
export function GroupedList({
  sections,
  collapsed,
  state,
  partners,
  handlers,
}: {
  sections: readonly Section[];
  collapsed: boolean;
  state: ListState;
  partners: PartnerNames;
  handlers: ListHandlers;
}) {
  const listId = useId();
  return (
    <div className="flex flex-col gap-4" data-testid="guest-list" id={listId}>
      <div className="hidden px-px md:block">
        <ColumnHeader handlers={handlers} withGroup={false} />
      </div>
      {sections.map((section) => {
        const key = keyOf(section.id);
        return (
          <SectionBlock
            key={key}
            section={section}
            open={state.open[key] ?? !collapsed}
            state={state}
            partners={partners}
            handlers={handlers}
          />
        );
      })}
    </div>
  );
}
