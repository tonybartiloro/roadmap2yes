"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, History, Plus, UserPlus, UsersRound } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { plural } from "@/components/format";
import { HelpLink } from "@/components/HelpLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  countBySide,
  countGuests,
  filterGuests,
  hasActiveFilters,
  NO_FILTERS,
  type GuestFilters,
} from "@/domain/guests";
import { PanelContent } from "@/features/timeline/PanelContent";
import type { GroupView, GuestView, GuestsSnapshot } from "./data";
import { FamilySheet } from "./FamilySheet";
import { FilterChips, FiltersSheet } from "./FiltersSheet";
import { ActionMenu, type MenuAction } from "./GroupHeader";
import { FlatList, GroupedList, type ListHandlers, type ListState } from "./GuestList";
import { GuestSheet } from "./GuestSheet";
import { RecentlyDeleted, ConfirmDialog, type ConfirmRequest } from "./RecentlyDeleted";
import { RenameGroupSheet } from "./RenameGroupSheet";
import { SelectionBar } from "./SelectionBar";
import { Summary } from "./Summary";
import { useGuestActions } from "./use-guest-actions";
import { buildSections, COLLAPSE_ABOVE, fullName, PAGE_SIZE, type PartnerNames } from "./view";

const MENU_ID = "guests-menu";

type Sheet_ =
  | { kind: "guest"; guest: GuestView | null; groupId: string | null }
  | { kind: "family" }
  | { kind: "rename"; group: GroupView }
  | { kind: "add" }
  | { kind: "deleted" }
  | null;

/**
 * Persone (design §2.1): header with "Aiuto", summary and "Per lato", search, filters with chips,
 * the list by groups (flat while filtering), multiple selection and "Eliminati di recente".
 * Extension points for later steps: `menuActions` (Importa, Esporta CSV: T13) and `emptyExtra`
 * (the "Importa" button of the empty state); the Tavoli tab and fields join with T9.
 */
export function GuestsScreen({
  snapshot,
  partners,
  menuActions = [],
  emptyExtra,
}: {
  snapshot: GuestsSnapshot;
  partners: PartnerNames;
  menuActions?: readonly MenuAction[];
  emptyExtra?: React.ReactNode;
}) {
  const router = useRouter();
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
  const effective = useMemo(() => ({ ...filters, query: deferredQuery }), [filters, deferredQuery]);
  const filtered = useMemo(
    () => filterGuests(live, effective, { groups, tables }),
    [live, effective, groups, tables],
  );
  const filtering = hasActiveFilters(effective);
  const total = useMemo(() => countGuests(live), [live]);
  const shownCounts = useMemo(() => countGuests(filtered), [filtered]);
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

  async function run<T>(work: () => Promise<T>): Promise<T> {
    setBusy(true);
    try {
      return await work();
    } finally {
      setBusy(false);
    }
  }

  const handlers: ListHandlers = {
    selecting,
    selected,
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
    ...menuActions,
  ];

  const closeSheet = (open: boolean) => {
    if (!open) setSheet(null);
  };
  const stale = () => router.refresh();

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
              {emptyExtra}
            </div>
          }
        />
      ) : (
        <>
          <Summary total={total} shown={shownCounts} bySide={bySide} partners={partners} />
          <div className="flex items-center gap-2">
            <div role="search" className="min-w-0 flex-1">
              <Label htmlFor="guest-search" className="sr-only">
                Cerca per nome
              </Label>
              <Input
                id="guest-search"
                type="search"
                placeholder="Cerca per nome"
                autoComplete="off"
                value={filters.query}
                onChange={(event) => setFilters({ ...filters, query: event.target.value })}
              />
            </div>
            <FiltersSheet
              filters={filters}
              onChange={setFilters}
              groups={groups}
              partners={partners}
              matchCount={filtered.length}
            />
            <ActionMenu id={MENU_ID} title="Altro" triggerLabel="Altro" actions={menu} />
          </div>
          <FilterChips
            filters={filters}
            groups={groups}
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
              guests={filtered}
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

      {live.length === 0 && deletedCount > 0 ? (
        <Button type="button" variant="outline" onClick={() => setSheet({ kind: "deleted" })}>
          Eliminati di recente ({deletedCount})
        </Button>
      ) : null}

      {selecting ? (
        <SelectionBar
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
          guests={live}
          partners={partners}
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
