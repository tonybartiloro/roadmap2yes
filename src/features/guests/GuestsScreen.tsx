"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  History,
  Link2,
  Plus,
  TriangleAlert,
  Upload,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { plural } from "@/components/format";
import { HelpLink } from "@/components/HelpLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  countBySide,
  countGuests,
  filterGuests,
  hasActiveFilters,
  NO_FILTERS,
  occupancyByTable,
  overSummary,
  type GuestFilters,
} from "@/domain/guests";
import { CreateAllDialog } from "@/features/rsvp/CreateAllDialog";
import { GroupModeDialog } from "@/features/rsvp/GroupModeDialog";
import { LinkSheet } from "@/features/rsvp/LinkSheet";
import {
  createAllTargets,
  linkOf,
  linkState,
  linkStateText,
  resendNames,
  type Recipient,
  type RsvpSnapshot,
} from "@/features/rsvp/view";
import { PanelContent } from "@/features/timeline/PanelContent";
import type { GroupView, GuestView, GuestsSnapshot, TableView } from "./data";
import { FamilySheet } from "./FamilySheet";
import { FilterChips, FiltersSheet } from "./FiltersSheet";
import { ActionMenu, type MenuAction } from "./GroupHeader";
import { buildRsvpModel } from "./rsvp-model";
import {
  FlatList,
  GroupedList,
  type ListHandlers,
  type ListState,
  type RsvpListView,
} from "./GuestList";
import { GuestSheet, type GuestSheetRsvp } from "./GuestSheet";
import { RecentlyDeleted, ConfirmDialog, type ConfirmRequest } from "./RecentlyDeleted";
import { RenameGroupSheet } from "./RenameGroupSheet";
import { SelectionBar } from "./SelectionBar";
import { exportMenuAction } from "./ExportButton";
import { ImportSheet } from "./ImportSheet";
import { Summary } from "./Summary";
import { TablesTab } from "./TablesTab";
import { TableSheet } from "./TableSheet";
import { useGuestActions } from "./use-guest-actions";
import {
  buildSections,
  COLLAPSE_ABOVE,
  compareNames,
  fullName,
  PAGE_SIZE,
  tableLabel,
  type PartnerNames,
} from "./view";

const MENU_ID = "guests-menu";

type Sheet_ =
  | { kind: "guest"; guest: GuestView | null; groupId: string | null }
  | { kind: "family" }
  | { kind: "rename"; group: GroupView }
  | { kind: "add" }
  | { kind: "deleted" }
  | { kind: "table"; table: TableView | null }
  | { kind: "import" }
  | { kind: "link"; recipient: { kind: "group" | "guest"; id: string } }
  | { kind: "mode"; groupId: string }
  | { kind: "createAll" }
  | null;

/** What the couple-side RSVP needs from the page; absent while the schema is not migrated. */
export interface RsvpProps {
  snapshot: RsvpSnapshot;
  /** ISO instant of the request: one `now` for server and client (no hydration drift). */
  now: string;
  /** The partners' first names (those that exist), for the WhatsApp message. */
  couple: string[];
  /** `guests/write`: without it states stay visible and the actions are hidden. */
  canWrite: boolean;
}

/**
 * Persone (design §2.1): header with "Aiuto", summary and "Per lato", search, filters with chips,
 * the list by groups (flat while filtering), multiple selection and "Eliminati di recente".
 * "Importa" and "Esporta CSV" are in the Altro menu (and "Importa" in the empty state); `menuActions`
 * and `emptyExtra` stay as extension points.
 */
export function GuestsScreen({
  snapshot,
  partners,
  importNames,
  menuActions = [],
  emptyExtra,
  rsvp,
}: {
  snapshot: GuestsSnapshot;
  rsvp?: RsvpProps;
  partners: PartnerNames;
  /** Real first names (`null` = not set) for the `lato` column of the import and export. */
  importNames?: { a: string | null; b: string | null };
  menuActions?: readonly MenuAction[];
  emptyExtra?: React.ReactNode;
}) {
  const router = useRouter();
  const names = importNames ?? partners;
  const actions = useGuestActions();
  const [filters, setFiltersState] = useState<GuestFilters>(NO_FILTERS);
  const [list, setList] = useState<ListState>({ shown: {}, open: {} });
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [sheet, setSheet] = useState<Sheet_>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const { guests, groups, tables } = snapshot;
  const live = useMemo(() => guests.filter((g) => !g.deletedAt), [guests]);
  // The box stays responsive while the (large) list catches up; the count is announced once.
  const deferredQuery = useDeferredValue(filters.query);
  const liveTables = useMemo(() => tables.filter((t) => !t.deletedAt), [tables]);
  const hasTables = liveTables.length > 0;
  // Without a live table there is no table filter at all, even if one was set before (AC16).
  const visible = useMemo(
    () => (!hasTables && filters.tableId !== null ? { ...filters, tableId: null } : filters),
    [filters, hasTables],
  );
  const effective = useMemo(() => ({ ...visible, query: deferredQuery }), [visible, deferredQuery]);
  const occupancies = useMemo(() => occupancyByTable(tables, live), [tables, live]);
  const overLine = overSummary(occupancies.values());
  const tableLabels = useMemo(
    () => (hasTables ? new Map(liveTables.map((t) => [t.id, tableLabel(t.name)])) : null),
    [hasTables, liveTables],
  );
  const [tab, setTab] = useState<"people" | "tables">("people");
  const filtered = useMemo(
    () => filterGuests(live, effective, { groups, tables }),
    [live, effective, groups, tables],
  );
  const filtering = hasActiveFilters(effective);
  const total = useMemo(() => countGuests(live), [live]);
  const shownCounts = useMemo(() => countGuests(filtered), [filtered]);
  // The flat list (search or filters) is alphabetical like the groups, not in query order (DES-01).
  const flat = useMemo(() => filtered.toSorted(compareNames), [filtered]);
  const bySide = useMemo(() => countBySide(live), [live]);
  const sections = useMemo(
    () => buildSections(filtered, groups, !filtering),
    [filtered, groups, filtering],
  );
  const groupNames = useMemo(() => {
    const liveGroups = new Map(groups.filter((g) => !g.deletedAt).map((g) => [g.id, g.name]));
    const names = new Map<string, string>();
    for (const g of filtered) {
      const name = g.groupId ? liveGroups.get(g.groupId) : undefined;
      if (name) names.set(g.id, name);
    }
    return names;
  }, [filtered, groups]);
  const deletedCount =
    guests.filter((g) => g.deletedAt).length +
    groups.filter((g) => g.deletedAt).length +
    tables.filter((t) => t.deletedAt).length;
  const rsvpNow = useMemo(() => (rsvp ? new Date(rsvp.now) : null), [rsvp]);
  const model = useMemo(
    () => (rsvp && rsvpNow ? buildRsvpModel(live, groups, rsvp.snapshot, rsvpNow) : null),
    [rsvp, rsvpNow, live, groups],
  );
  const createAll =
    rsvp && rsvpNow && model ? createAllTargets(model.recipients, rsvp.snapshot, rsvpNow) : null;
  const liveIds = useMemo(() => new Set(live.map((g) => g.id)), [live]);
  const selectedIds = [...selected].filter((id) => liveIds.has(id));

  // A selection never outlives its filter: "Elimina" must only act on people that are in view.
  function setFilters(next: GuestFilters) {
    setFiltersState(next);
    setList((current) => ({ ...current, shown: {} }));
    setSelected((current) => (current.size === 0 ? current : new Set()));
  }

  const onSelect = useCallback((id: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const onOpen = useCallback(
    (guest: GuestView) => setSheet({ kind: "guest", guest, groupId: null }),
    [],
  );

  const onSend = useCallback((recipient: Recipient) => setSheet({ kind: "link", recipient }), []);
  const onMode = useCallback(
    (group: GroupView) => setSheet({ kind: "mode", groupId: group.id }),
    [],
  );

  async function run<T>(work: () => Promise<T>): Promise<T> {
    setBusy(true);
    try {
      return await work();
    } finally {
      setBusy(false);
    }
  }

  const rsvpView: RsvpListView | undefined =
    rsvp && model
      ? { canWrite: rsvp.canWrite, guests: model.guests, groups: model.groups, onSend, onMode }
      : undefined;

  const handlers: ListHandlers = {
    ...(rsvpView ? { rsvp: rsvpView } : {}),
    selecting,
    selected,
    tableLabels,
    onSelect,
    onOpen,
    onShowMore: (key) =>
      setList((c) => ({
        ...c,
        shown: { ...c.shown, [key]: (c.shown[key] ?? PAGE_SIZE) + PAGE_SIZE },
      })),
    onToggle: (key, open) => setList((c) => ({ ...c, open: { ...c.open, [key]: open } })),
    onAddToGroup: (group) => setSheet({ kind: "guest", guest: null, groupId: group.id }),
    onRename: (group) => setSheet({ kind: "rename", group }),
    onDeleteGroup: (group) => {
      const n = live.filter((g) => g.groupId === group.id).length;
      setConfirm({
        title: `Elimini il gruppo «${group.name}»?`,
        description:
          n === 0
            ? "Il gruppo è vuoto. Lo ritrovi in Eliminati di recente."
            : `${n === 1 ? "La persona resta" : `Le ${n} persone restano`}, senza gruppo. Se ripristini il gruppo, rientrano.`,
        confirmLabel: "Elimina gruppo",
        onConfirm: () =>
          void actions.remove(
            { kind: "group", id: group.id, version: group.version },
            `Gruppo «${group.name}»`,
          ),
      });
    },
  };

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
    // The bar (and its focus) disappears: send the focus to the menu that started the selection.
    queueMicrotask(() => document.getElementById(MENU_ID)?.focus());
  };

  const menu: MenuAction[] = [
    {
      label: selecting ? "Fine selezione" : "Seleziona",
      icon: <CheckSquare aria-hidden />,
      onSelect: () => (selecting ? stopSelecting() : setSelecting(true)),
    },
    {
      label: deletedCount > 0 ? `Eliminati di recente (${deletedCount})` : "Eliminati di recente",
      icon: <History aria-hidden />,
      onSelect: () => setSheet({ kind: "deleted" }),
    },
    {
      label: "Importa",
      icon: <Upload aria-hidden />,
      onSelect: () => setSheet({ kind: "import" }),
    },
    exportMenuAction(live, groups, names),
    ...(rsvp?.canWrite && createAll
      ? [
          {
            label: `Crea link per tutti (${createAll.recipients.length})`,
            icon: <Link2 aria-hidden />,
            disabled: createAll.disabled || createAll.recipients.length === 0,
            ...(createAll.disabled
              ? { description: "I link sono scaduti: sposta la data per riattivarli." }
              : createAll.recipients.length === 0
                ? { description: "Tutti hanno già un link." }
                : {}),
            onSelect: () => setSheet({ kind: "createAll" }),
          },
        ]
      : []),
    ...menuActions,
  ];

  function guestSheetRsvp(guest: GuestView | null): GuestSheetRsvp | undefined {
    const entry = guest ? model?.guests.get(guest.id) : undefined;
    if (!guest || !rsvp || !entry) return undefined;
    const group = guest.groupId ? model?.groups.get(guest.groupId) : undefined;
    const groupName = groups.find((g) => g.id === guest.groupId)?.name;
    const open = (r: Recipient) => () => setSheet({ kind: "link", recipient: r });
    let invite: GuestSheetRsvp["invite"] = null;
    if (entry.link) {
      invite = {
        text: `Invito: link personale, ${linkStateText(entry.link.state).toLowerCase()}`,
        onOpen: open(entry.link.recipient),
      };
    } else if (group?.recipient && groupName) {
      invite = {
        text: `Invito: risponde con il gruppo ${groupName}`,
        onOpen: open(group.recipient),
      };
    }
    return {
      presence: entry.presence,
      response: rsvp.snapshot.responses.find((r) => r.guestId === guest.id) ?? null,
      invite,
    };
  }

  const linkTarget = sheet?.kind === "link" ? sheet.recipient : null;
  const linkRecipient = linkTarget
    ? model?.recipients.find((r) => r.kind === linkTarget.kind && r.id === linkTarget.id)
    : undefined;
  const modeGroup = sheet?.kind === "mode" ? groups.find((g) => g.id === sheet.groupId) : undefined;

  // Props of the link sheet and of the mode dialog (the state is computed once, here).
  const linkSheet =
    rsvp && rsvpNow && linkRecipient
      ? (() => {
          const { snapshot } = rsvp;
          const state = linkState(linkRecipient, snapshot, rsvpNow);
          return {
            recipient: linkRecipient,
            link: linkOf(linkRecipient, snapshot.links),
            hadLink: snapshot.links.some(
              (l) =>
                l.revokedAt !== null &&
                (linkRecipient.kind === "group"
                  ? l.groupId === linkRecipient.id
                  : l.guestId === linkRecipient.id),
            ),
            state,
            expiresOn: snapshot.expiresOn,
            dateChosen: snapshot.expiresOn !== null,
            firstNames: live
              .filter((g) => linkRecipient.memberIds.includes(g.id))
              .map((g) => g.firstName),
            couple: rsvp.couple,
            resendNames: state.kind === "resend" ? resendNames(state.guestIds, live) : [],
            canWrite: rsvp.canWrite,
          };
        })()
      : null;
  const modeDialog =
    rsvp && modeGroup
      ? {
          groupId: modeGroup.id,
          groupName: modeGroup.name,
          version: modeGroup.version,
          mode: modeGroup.rsvpMode ?? ("together" as const),
          people: live.filter((g) => g.groupId === modeGroup.id).length,
          personalLinks: rsvp.snapshot.links.filter(
            (l) =>
              l.revokedAt === null &&
              l.guestId !== null &&
              live.some((g) => g.id === l.guestId && g.groupId === modeGroup.id),
          ).length,
          groupLink: rsvp.snapshot.links.some(
            (l) => l.revokedAt === null && l.groupId === modeGroup.id,
          ),
        }
      : null;

  const closeSheet = (open: boolean) => {
    if (!open) setSheet(null);
  };
  const stale = () => router.refresh();

  function changeTab(next: string) {
    if (next === "people" || next === "tables") {
      if (next === "tables" && selecting) stopSelecting();
      setTab(next);
    }
  }

  function askDeleteTable(table: TableView) {
    const n = live.filter((g) => g.tableId === table.id).length;
    setConfirm({
      title: `Elimini il tavolo «${table.name}»?`,
      description:
        n === 0
          ? "Il tavolo è vuoto. Lo ritrovi in Eliminati di recente."
          : `${n === 1 ? "La persona resta" : `Le ${n} persone restano`}, senza tavolo. Se ripristini il tavolo, rientrano.`,
      confirmLabel: "Elimina il tavolo",
      onConfirm: () => {
        setSheet(null);
        void actions.remove(
          { kind: "table", id: table.id, version: table.version },
          `Tavolo «${table.name}»`,
        );
      },
    });
  }

  return (
    // Room under the list for the fixed FAB, or for the (up to three rows tall) selection bar.
    <div
      className={`flex flex-col gap-4 ${selecting ? "pb-44" : "pb-12"}`}
      data-testid="guests-screen"
    >
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl leading-8 font-semibold">Invitati</h1>
        <HelpLink route="/invitati" />
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList aria-label="Sezioni" className="h-14 w-full md:w-fit">
          <TabsTrigger value="people" className="h-11 flex-1 md:flex-none">
            Persone
          </TabsTrigger>
          <TabsTrigger value="tables" className="h-11 flex-1 md:flex-none">
            Tavoli
          </TabsTrigger>
        </TabsList>
        <TabsContent value="people" className="flex flex-col gap-4">
          {live.length === 0 ? (
            <EmptyState
              icon={<UsersRound className="size-8" />}
              title="Ancora nessun invitato"
              description="Aggiungili uno a uno o incolla la tua lista."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    onClick={() => setSheet({ kind: "guest", guest: null, groupId: null })}
                  >
                    Aggiungi invitato
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSheet({ kind: "import" })}
                  >
                    Importa
                  </Button>
                  {emptyExtra}
                </div>
              }
            />
          ) : (
            <>
              <Summary
                total={total}
                shown={shownCounts}
                bySide={bySide}
                partners={partners}
                extra={
                  overLine ? (
                    <p className="text-destructive flex items-center gap-1.5 text-base font-semibold">
                      <TriangleAlert aria-hidden className="size-4 shrink-0" />
                      {overLine}
                    </p>
                  ) : null
                }
              />
              {rsvp && !rsvp.canWrite ? (
                <p className="text-muted-foreground text-base">Serve il permesso di modifica.</p>
              ) : null}
              <div className="flex items-center gap-2">
                <div role="search" className="min-w-0 flex-1">
                  <Label htmlFor="guest-search" className="sr-only">
                    Cerca per nome
                  </Label>
                  <Input
                    id="guest-search"
                    type="search"
                    placeholder="Cerca"
                    autoComplete="off"
                    value={filters.query}
                    onChange={(event) => setFilters({ ...filters, query: event.target.value })}
                  />
                </div>
                <FiltersSheet
                  filters={visible}
                  onChange={setFilters}
                  groups={groups}
                  tables={liveTables}
                  partners={partners}
                  matchCount={filtered.length}
                />
                <ActionMenu id={MENU_ID} title="Altro" triggerLabel="Altro" actions={menu} />
              </div>
              <FilterChips
                filters={visible}
                groups={groups}
                tables={liveTables}
                partners={partners}
                onChange={setFilters}
              />

              {filtered.length === 0 ? (
                <EmptyState
                  title="Nessun invitato con questi filtri"
                  action={
                    <Button type="button" variant="outline" onClick={() => setFilters(NO_FILTERS)}>
                      Azzera filtri
                    </Button>
                  }
                />
              ) : filtering ? (
                <FlatList
                  guests={flat}
                  groupNames={groupNames}
                  state={list}
                  partners={partners}
                  handlers={handlers}
                />
              ) : (
                <GroupedList
                  sections={sections}
                  collapsed={live.length > COLLAPSE_ABOVE}
                  state={list}
                  partners={partners}
                  handlers={handlers}
                />
              )}
            </>
          )}
        </TabsContent>
        <TabsContent value="tables">
          <TablesTab
            tables={tables}
            occupancies={occupancies}
            onCreate={() => setSheet({ kind: "table", table: null })}
            onOpen={(table) => setSheet({ kind: "table", table })}
          />
        </TabsContent>
      </Tabs>

      {live.length === 0 && deletedCount > 0 ? (
        <Button type="button" variant="outline" onClick={() => setSheet({ kind: "deleted" })}>
          Eliminati di recente ({deletedCount})
        </Button>
      ) : null}

      {tab === "tables" ? null : selecting ? (
        <SelectionBar
          tables={liveTables}
          onAssignTable={(tableId) =>
            run(async () => {
              const name = tables.find((t) => t.id === tableId)?.name ?? "il tavolo";
              const ok = await actions.bulk(
                "assign_table",
                selectedIds,
                (n) => `${plural(n, "persona", "persone")} al tavolo «${name}».`,
                tableId,
              );
              if (ok) stopSelecting();
              return ok;
            })
          }
          selectedCount={selectedIds.length}
          filteredCount={filtered.length}
          filtering={filtering}
          groups={groups}
          busy={busy}
          onSelectAll={() => setSelected(new Set(filtered.map((g) => g.id)))}
          onClear={() => setSelected(new Set())}
          onDone={stopSelecting}
          onAssignGroup={(groupId) =>
            run(async () => {
              const name = groups.find((g) => g.id === groupId)?.name ?? "il gruppo";
              const ok = await actions.bulk(
                "assign_group",
                selectedIds,
                (n) => `${plural(n, "persona", "persone")} in «${name}».`,
                groupId,
              );
              if (ok) stopSelecting();
              return ok;
            })
          }
          onDelete={() =>
            void run(async () => {
              const ok = await actions.bulk(
                "delete",
                selectedIds,
                (n) => `${plural(n, "persona eliminata", "persone eliminate")}.`,
              );
              if (ok) stopSelecting();
            })
          }
        />
      ) : (
        <Button
          type="button"
          size="icon"
          aria-label="Aggiungi"
          onClick={() => setSheet({ kind: "add" })}
          className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 size-14 rounded-full shadow-lg md:right-8 md:bottom-8"
        >
          <Plus aria-hidden className="size-6!" />
        </Button>
      )}

      {sheet?.kind === "add" ? (
        <Sheet open onOpenChange={closeSheet}>
          <PanelContent aria-describedby="add-hint">
            <SheetHeader>
              <SheetTitle>Aggiungi</SheetTitle>
              <SheetDescription id="add-hint">
                Una persona o un&apos;intera famiglia.
              </SheetDescription>
            </SheetHeader>
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              onClick={() => setSheet({ kind: "guest", guest: null, groupId: null })}
            >
              <UserPlus aria-hidden />
              Una persona
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              onClick={() => setSheet({ kind: "family" })}
            >
              <UsersRound aria-hidden />
              Una famiglia
            </Button>
          </PanelContent>
        </Sheet>
      ) : null}
      {sheet?.kind === "guest" ? (
        <GuestSheet
          key={sheet.guest?.id ?? `new-${sheet.groupId ?? ""}`}
          open
          onOpenChange={closeSheet}
          guest={sheet.guest}
          groupId={sheet.groupId}
          groups={groups}
          tables={liveTables}
          guests={live}
          partners={partners}
          rsvp={guestSheetRsvp(sheet.guest)}
          onStale={stale}
          onDelete={(guest) => {
            setSheet(null);
            void actions.remove(
              { kind: "guest", id: guest.id, version: guest.version },
              fullName(guest),
            );
          }}
        />
      ) : null}
      {sheet?.kind === "family" ? (
        <FamilySheet open onOpenChange={closeSheet} partners={partners} />
      ) : null}
      {sheet?.kind === "rename" ? (
        <RenameGroupSheet
          key={sheet.group.id}
          group={sheet.group}
          onOpenChange={closeSheet}
          onStale={stale}
        />
      ) : null}
      {sheet?.kind === "table" ? (
        <TableSheet
          key={sheet.table?.id ?? "new-table"}
          table={sheet.table}
          occupancy={sheet.table ? (occupancies.get(sheet.table.id) ?? null) : null}
          tables={tables}
          members={sheet.table ? live.filter((g) => g.tableId === sheet.table?.id) : []}
          guests={live}
          groups={groups}
          actions={actions}
          onClose={() => setSheet(null)}
          onDelete={askDeleteTable}
          onStale={stale}
        />
      ) : null}
      {sheet?.kind === "import" ? (
        <ImportSheet
          onClose={() => setSheet(null)}
          names={names}
          groups={groups}
          guests={live}
          onStale={stale}
        />
      ) : null}
      {linkSheet ? (
        <LinkSheet key={linkSheet.recipient.id} {...linkSheet} onOpenChange={closeSheet} />
      ) : null}
      {modeDialog && modeGroup ? (
        <GroupModeDialog key={modeGroup.id} {...modeDialog} onOpenChange={closeSheet} />
      ) : null}
      {rsvp && createAll && sheet?.kind === "createAll" ? (
        <CreateAllDialog
          recipients={createAll.recipients}
          dateChosen={rsvp.snapshot.expiresOn !== null}
          onOpenChange={closeSheet}
        />
      ) : null}
      <RecentlyDeleted
        open={sheet?.kind === "deleted"}
        onOpenChange={closeSheet}
        guests={guests}
        groups={groups}
        tables={tables}
        busy={busy}
        onRestore={(item) => void run(() => actions.restore(item))}
        onPurge={(item) => void run(() => actions.purge(item))}
        onEmpty={(scope) => void run(() => actions.empty(scope))}
      />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
