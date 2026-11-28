"use client";

import { useId } from "react";
import { Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { countGuests } from "@/domain/guests";
import { groupAccessibleName, type Recipient } from "@/features/rsvp/view";
import type { GroupView, GuestView } from "./data";
import { GroupHeader } from "./GroupHeader";
import { GuestRow, rowColumns } from "./GuestRow";
import { NO_RSVP, type GroupRsvp, type GuestRsvp } from "./rsvp-model";
import { ShowMore } from "./ShowMore";
import { categorySummary, PAGE_SIZE, type PartnerNames, type Section } from "./view";

export interface ListState {
  /** Rows shown per list key (default one page). */
  shown: Record<string, number>;
  /** Open/closed per group key; absent = the default (closed above 100 people). */
  open: Record<string, boolean>;
}

/** The couple-side RSVP data of the list; absent while the schema is not migrated. */
export interface RsvpListView {
  canWrite: boolean;
  guests: ReadonlyMap<string, GuestRsvp>;
  groups: ReadonlyMap<string, GroupRsvp>;
  /** Stable callbacks: the memoised rows must not re-render for them (REV-26). */
  onSend: (recipient: Recipient) => void;
  onMode: (group: GroupView) => void;
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
  // Rows keep the room of "Invia" on the right so the columns line up (DES-50).
  const reserve = handlers.rsvp?.canWrite && !handlers.selecting;
  return (
    <div
      aria-hidden
      className={`text-muted-foreground border-border hidden border-b py-1.5 text-sm font-semibold md:grid md:gap-x-3 ${reserve ? "pr-[6.5rem]" : "pr-3"} ${handlers.selecting ? "md:pl-12" : "md:pl-3"} ${rowColumns(withGroup, withTable, Boolean(handlers.rsvp))}`}
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
  const rsvp = handlers.rsvp;
  return (
    <>
      <ul id={`list-${id}`} className="flex flex-col">
        {guests.slice(0, count).map((guest) => {
          const entry = rsvp ? (rsvp.guests.get(guest.id) ?? NO_RSVP) : null;
          return (
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
              {...(entry ? { rsvp: entry } : {})}
              {...(rsvp?.canWrite ? { reserveSend: true } : {})}
              {...(rsvp?.canWrite && entry?.link ? { onSend: rsvp.onSend } : {})}
            />
          );
        })}
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
                icon: <UsersRound aria-hidden />,
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
