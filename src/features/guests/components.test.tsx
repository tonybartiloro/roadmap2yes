// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav, usePathname: () => "/invitati" }));

vi.mock("sonner", async () => {
  const actual = await vi.importActual<typeof import("sonner")>("sonner");
  const toast = Object.assign(vi.fn(actual.toast), {
    error: vi.fn(),
    dismiss: actual.toast.dismiss,
  });
  return { ...actual, toast };
});

const actions = vi.hoisted(() => ({
  addGuestAction: vi.fn(),
  updateGuestAction: vi.fn(),
  assignGuestAction: vi.fn(),
  addGroupAction: vi.fn(),
  updateGroupAction: vi.fn(),
  createFamilyAction: vi.fn(),
  removeEntityAction: vi.fn(),
  restoreEntityAction: vi.fn(),
  purgeEntityAction: vi.fn(),
  emptyDeletedAction: vi.fn(),
  bulkGuestsAction: vi.fn(),
  undoBulkAction: vi.fn(),
}));
vi.mock("./actions", () => actions);

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
// sonner captures the pointer on a toast; jsdom has no pointer capture.
HTMLElement.prototype.setPointerCapture = () => {};
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
  onchange: null,
}));

import { toast, Toaster } from "sonner";
import { LoadError } from "@/app/(app)/invitati/LoadError";
import type { GroupView, GuestView, GuestsSnapshot, TableView } from "./data";
import { GuestsScreen } from "./GuestsScreen";
import { SelectionBar } from "./SelectionBar";
import { SELECTION_TOO_LARGE } from "./schemas";

const PARTNERS = { a: "Tony", b: "Jessica" };
const ok = <T,>(data: T) => ({ ok: true as const, data });

let n = 0;
function guest(extra: Partial<GuestView> = {}): GuestView {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    firstName: `Nome${n}`,
    lastName: "Rossi",
    category: "adult",
    side: null,
    phone: null,
    email: null,
    notes: null,
    groupId: null,
    tableId: null,
    deletedAt: null,
    version: 1,
    ...extra,
  };
}
const group = (id: string, name: string, deletedAt: string | null = null): GroupView => ({
  id,
  name,
  deletedAt,
  version: 1,
});

function renderScreen(snapshot: Partial<GuestsSnapshot> = {}) {
  const full: GuestsSnapshot = { guests: [], groups: [], tables: [], ...snapshot };
  return render(
    <>
      <GuestsScreen snapshot={full} partners={PARTNERS} />
      <Toaster />
    </>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  n = 0;
});
afterEach(() => {
  toast.dismiss();
  cleanup();
  vi.useRealTimers();
});

const people = () => [
  guest({ firstName: "Mario", side: "A" }),
  guest({ firstName: "Luca", side: "A", category: "child" }),
  guest({ firstName: "Sara", lastName: "Bianchi", side: "B", category: "infant" }),
  guest({ firstName: "Anna", lastName: "Verdi", side: "both" }),
  guest({ firstName: "Paolo", lastName: "Neri" }),
  guest({ firstName: "Gone", deletedAt: "2026-11-01T10:00:00Z" }),
];

describe("summary and empty state (AC1, AC8)", () => {
  it("shows the empty state with the add action", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "Ancora nessun invitato" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aggiungi invitato" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Aiuto" })).toBeTruthy();
  });

  it("counts infants in the total, never counts deleted, and splits by side", async () => {
    renderScreen({ guests: people() });
    expect(screen.getByTestId("guests-summary").textContent).toContain(
      "5 persone · 3 adulti · 1 bambino · 1 neonato",
    );
    await userEvent.click(screen.getByRole("button", { name: "Per lato" }));
    expect(screen.getByTestId("side-A").textContent).toContain("Tony: 2 persone");
    expect(screen.getByTestId("side-none").textContent).toContain("Non indicato: 1 persona");
  });
});

describe("filters (AC9)", () => {
  it("shows '2 di 5 persone' with a chip, keeps the side numbers on the total, and clears", async () => {
    renderScreen({ guests: people() });
    await userEvent.click(screen.getByRole("button", { name: /Filtri/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Tony" }));
    const panel = screen.getByRole("dialog");
    await userEvent.click(within(panel).getByRole("button", { name: /Mostra 2 persone/ }));
    expect(screen.getByTestId("guests-count").textContent).toBe("2 di 5 persone");
    await userEvent.click(screen.getByRole("button", { name: "Per lato" }));
    expect(screen.getByTestId("side-A").textContent).toContain("Tony: 2 persone");
    await userEvent.click(screen.getByRole("button", { name: "Rimuovi filtro Lato: Tony" }));
    expect(screen.getByTestId("guests-count").textContent).toBe("5 persone");
  });

  it("searches by name ignoring accents and offers 'Azzera filtri' when nothing matches", async () => {
    renderScreen({ guests: [...people(), guest({ firstName: "Niccolò" })] });
    await userEvent.type(screen.getByRole("searchbox", { name: "Cerca per nome" }), "niccolo");
    expect(screen.getByTestId("guests-count").textContent).toBe("1 di 6 persone");
    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText("Nessun invitato con questi filtri")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Azzera filtri" }));
    expect(screen.getByTestId("guests-count").textContent).toBe("6 persone");
  });
});

describe("long lists (AC5, AC12)", () => {
  it("closes groups above 100 people and shows 100 rows at a time with 'Mostra altre'", async () => {
    const many = Array.from({ length: 250 }, () => guest());
    renderScreen({ guests: many });
    expect(screen.queryAllByTestId("guest-row")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: /Senza gruppo/ }));
    expect(screen.getAllByTestId("guest-row")).toHaveLength(100);
    await userEvent.click(
      screen.getByRole("button", { name: "Mostra altre 100 (ne restano 150)" }),
    );
    expect(screen.getAllByTestId("guest-row")).toHaveLength(200);
    await userEvent.click(screen.getByRole("button", { name: "Mostra altre 50 (ne restano 50)" }));
    expect(screen.getAllByTestId("guest-row")).toHaveLength(250);
    expect(screen.queryByRole("button", { name: /Mostra altre/ })).toBeNull();
    // counts are on the whole list, not on what is rendered
    expect(screen.getByTestId("guests-count").textContent).toBe("250 persone");
  });
});

describe("guest sheet (AC2, AC3, BR4)", () => {
  it("'Salva e aggiungi un altro' keeps type and side, clears the name and refocuses it", async () => {
    actions.addGuestAction.mockResolvedValue(ok({ guestId: "x" }));
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi invitato" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Nome" }), "Mario");
    await userEvent.type(screen.getByRole("textbox", { name: "Cognome" }), "Rossi");
    await userEvent.click(screen.getByRole("radio", { name: "Bambino" }));
    await userEvent.selectOptions(screen.getByLabelText("Lato"), "A");
    await userEvent.click(screen.getByRole("button", { name: "Salva e aggiungi un altro" }));

    await waitFor(() => expect(actions.addGuestAction).toHaveBeenCalledTimes(1));
    expect(actions.addGuestAction).toHaveBeenCalledWith({
      guest: expect.objectContaining({
        firstName: "Mario",
        lastName: "Rossi",
        category: "child",
        side: "A",
      }),
      groupId: null,
    });
    await waitFor(() =>
      expect((screen.getByRole("textbox", { name: "Nome" }) as HTMLInputElement).value).toBe(""),
    );
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Nome" }));
    expect((screen.getByRole("radio", { name: "Bambino" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Lato") as HTMLSelectElement).value).toBe("A");
    expect(screen.getByText("Mario Rossi aggiunto")).toBeTruthy();
  });

  it("refuses an empty name with a message in Italian", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi invitato" }));
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(screen.getByText("Scrivi il nome.")).toBeTruthy();
    expect(actions.addGuestAction).not.toHaveBeenCalled();
  });

  it("warns about a duplicate (accents ignored) without blocking the save", async () => {
    actions.addGuestAction.mockResolvedValue(ok({ guestId: "x" }));
    renderScreen({ guests: [guest({ firstName: "Niccolò", lastName: "Rossi" })] });
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await userEvent.click(screen.getByRole("button", { name: "Una persona" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Nome" }), "Niccolo");
    await userEvent.type(screen.getByRole("textbox", { name: "Cognome" }), "Rossi");
    expect(screen.getByText(/Hai già un Niccolò Rossi/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(actions.addGuestAction).toHaveBeenCalled());
  });

  it("shows the conflict dialog when the other partner changed the guest (AC6)", async () => {
    const mario = guest({ firstName: "Mario" });
    actions.updateGuestAction.mockResolvedValue({
      ok: false,
      code: "conflict",
      message: "x",
      conflict: {
        current: { firstName: "Marco", version: 4 },
        changedByName: "Jessica",
        changedAt: new Date().toISOString(),
      },
    });
    renderScreen({ guests: [mario] });
    await userEvent.click(screen.getByRole("button", { name: /^Mario Rossi/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "Nome" }), "o");
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(await screen.findByText(/Jessica ha modificato questo elemento/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salva comunque" })).toBeTruthy();
  });
});

describe("delete and Annulla (AC10)", () => {
  it("keeps the Annulla button on screen at 7.9 s and restores on click", async () => {
    const mario = guest({ firstName: "Mario" });
    actions.removeEntityAction.mockResolvedValue(ok({ version: 2 }));
    actions.restoreEntityAction.mockResolvedValue(ok({ version: 3 }));
    renderScreen({ guests: [mario] });
    await userEvent.click(screen.getByRole("button", { name: /^Mario Rossi/ }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: "Elimina" }));

    const toastButton = await screen.findByRole("button", { name: "Annulla" });
    expect(toastButton).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(7_900);
    });
    const still = screen
      .getAllByRole("button", { name: "Annulla" })
      .find((b) => b.closest("[data-sonner-toast]"));
    expect(still).toBeTruthy();
    await user.click(still as HTMLElement);
    expect(actions.restoreEntityAction).toHaveBeenCalledWith({
      kind: "guest",
      id: mario.id,
      version: 2,
    });
  });

  it("asks before deleting a group and says what happens to the members", async () => {
    actions.removeEntityAction.mockResolvedValue(ok({ version: 2 }));
    const g = group("g1", "Famiglia Rossi");
    renderScreen({
      guests: [guest({ groupId: "g1" }), guest({ groupId: "g1" })],
      groups: [g],
    });
    await userEvent.click(screen.getByRole("button", { name: "Azioni del gruppo Famiglia Rossi" }));
    await userEvent.click(screen.getByRole("button", { name: "Elimina gruppo" }));
    expect(screen.getByText(/Le 2 persone restano, senza gruppo/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Elimina gruppo" }));
    await waitFor(() =>
      expect(actions.removeEntityAction).toHaveBeenCalledWith({
        kind: "group",
        id: "g1",
        version: 1,
      }),
    );
  });

  it("members of a deleted group are listed under Senza gruppo", () => {
    renderScreen({
      guests: [guest({ groupId: "g1" })],
      groups: [group("g1", "Famiglia Rossi", "2026-11-01T10:00:00Z")],
    });
    expect(screen.getByRole("button", { name: /Senza gruppo/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Famiglia Rossi/ })).toBeNull();
  });
});

describe("multiple selection (AC7)", () => {
  async function startSelecting() {
    await userEvent.click(screen.getByRole("button", { name: "Altro" }));
    await userEvent.click(screen.getByRole("button", { name: "Seleziona" }));
  }

  it("selects all the filtered people and deletes them with an Annulla toast of at least 8 s", async () => {
    const all = people().filter((g) => !g.deletedAt);
    const previous = [
      { id: all[0]!.id, op: "delete", group_id: null, table_id: null, deleted: false },
    ];
    actions.bulkGuestsAction.mockResolvedValue(ok({ previous, changed: 5 }));
    actions.undoBulkAction.mockResolvedValue(ok({ restored: 5 }));
    renderScreen({ guests: [...all, guest({ deletedAt: "2026-11-01T10:00:00Z" })] });
    await startSelecting();
    expect(screen.getByRole("button", { name: "Elimina" }).hasAttribute("disabled")).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Seleziona tutti i 5" }));
    expect(screen.getByText("5 selezionati")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Elimina" }));

    await waitFor(() => expect(actions.bulkGuestsAction).toHaveBeenCalled());
    expect(actions.bulkGuestsAction).toHaveBeenCalledWith({
      ids: all.map((g) => g.id),
      op: "delete",
    });
    const [, options] = vi.mocked(toast).mock.calls.at(-1) as [
      string,
      { duration: number; action: { label: string; onClick: () => void } },
    ];
    expect(options.duration).toBeGreaterThanOrEqual(8_000);
    expect(options.action.label).toBe("Annulla");
    options.action.onClick();
    await waitFor(() => expect(actions.undoBulkAction).toHaveBeenCalledWith({ previous }));
  });

  it("explains and disables the actions above 5,000 people", () => {
    render(
      <SelectionBar
        selectedCount={5_001}
        filteredCount={6_000}
        groups={[]}
        busy={false}
        onSelectAll={() => {}}
        onClear={() => {}}
        onDone={() => {}}
        onAssignGroup={async () => true}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText(SELECTION_TOO_LARGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Elimina" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Assegna a gruppo" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("shows the server message and reloads after a partial bulk failure", async () => {
    actions.bulkGuestsAction.mockResolvedValue({
      ok: false,
      code: "partial",
      message: "Ne ho cambiati solo alcuni.",
    });
    renderScreen({ guests: [guest(), guest()] });
    await startSelecting();
    await userEvent.click(screen.getByRole("button", { name: "Seleziona tutti i 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Ne ho cambiati solo alcuni."));
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("shows the message of a denied bulk action and does not reload", async () => {
    actions.bulkGuestsAction.mockResolvedValue({
      ok: false,
      code: "forbidden",
      message: "Non hai il permesso di farlo.",
    });
    renderScreen({ guests: [guest(), guest()] });
    await startSelecting();
    await userEvent.click(screen.getByRole("button", { name: "Seleziona tutti i 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Non hai il permesso di farlo."));
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("drops the selection when the filters change, so Elimina only acts on what is in view", async () => {
    renderScreen({
      guests: [
        guest({ firstName: "Mario" }),
        guest({ firstName: "Luca" }),
        guest({ firstName: "Sara" }),
      ],
    });
    await startSelecting();
    await userEvent.click(screen.getByRole("button", { name: "Seleziona tutti i 3" }));
    expect(screen.getByText("3 selezionati")).toBeTruthy();
    await userEvent.type(screen.getByRole("searchbox"), "Mario");
    await waitFor(() => expect(screen.getByText("0 selezionati")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Elimina" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Seleziona tutti i 1 filtrati" })).toBeTruthy();
  });

  it("assigns the selected people to a group from the bar, with Annulla", async () => {
    actions.bulkGuestsAction.mockResolvedValue(ok({ previous: [], changed: 2 }));
    const guests = [guest(), guest()];
    renderScreen({ guests, groups: [group("g1", "Famiglia Rossi")] });
    await startSelecting();
    await userEvent.click(screen.getByRole("button", { name: "Seleziona tutti i 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Assegna a gruppo" }));
    await userEvent.selectOptions(screen.getByLabelText("Gruppo"), "g1");
    await userEvent.click(screen.getByRole("button", { name: "Assegna" }));
    await waitFor(() =>
      expect(actions.bulkGuestsAction).toHaveBeenCalledWith({
        ids: guests.map((g) => g.id),
        op: "assign_group",
        target: "g1",
      }),
    );
  });

  it("does not create a second group when 'Assegna' is retried after a failure", async () => {
    actions.addGroupAction.mockResolvedValue(ok({ groupId: "g-new" }));
    actions.bulkGuestsAction
      .mockResolvedValueOnce({
        ok: false,
        code: "unknown",
        message: "Non sono riuscito a cambiarli tutti. Riprova.",
      })
      .mockResolvedValueOnce(ok({ previous: [], changed: 1 }));
    renderScreen({ guests: [guest()] });
    await startSelecting();
    await userEvent.click(screen.getByRole("button", { name: "Seleziona tutti i 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Assegna a gruppo" }));
    await userEvent.selectOptions(screen.getByLabelText("Gruppo"), "Nuovo gruppo…");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Nome del nuovo gruppo" }),
      "Famiglia Verdi",
    );
    await userEvent.click(screen.getByRole("button", { name: "Assegna" }));
    await waitFor(() => expect(actions.bulkGuestsAction).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: "Assegna" }));
    await waitFor(() => expect(actions.bulkGuestsAction).toHaveBeenCalledTimes(2));
    expect(actions.addGroupAction).toHaveBeenCalledTimes(1);
    expect(actions.bulkGuestsAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ op: "assign_group", target: "g-new" }),
    );
  });
});

describe("Eliminati di recente (AC10, AC11)", () => {
  const deleted = "2026-11-01T10:00:00Z";
  async function openDeleted(snapshot: Partial<GuestsSnapshot>) {
    renderScreen(snapshot);
    await userEvent.click(screen.getByRole("button", { name: "Altro" }));
    await userEvent.click(screen.getByRole("button", { name: /Eliminati di recente/ }));
  }

  it("shows people, groups and tables in their own sections, with the member count of a group", async () => {
    const tables: TableView[] = [
      { id: "t1", name: "Tavolo 1", capacity: 8, deletedAt: deleted, version: 1 },
    ];
    await openDeleted({
      guests: [
        guest({ groupId: "g1" }),
        guest({ groupId: "g1" }),
        guest({ firstName: "Gone", deletedAt: deleted }),
      ],
      groups: [group("g1", "Famiglia Rossi", deleted)],
      tables,
    });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Persone (1)" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Gruppi (1)" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Tavoli (1)" })).toBeTruthy();
    expect(within(dialog).getByText("2 persone, rientrano se lo ripristini")).toBeTruthy();
    expect(
      within(dialog).getByText(/Restano qui finché non li elimini definitivamente/),
    ).toBeTruthy();
  });

  it("restores a person", async () => {
    actions.restoreEntityAction.mockResolvedValue(ok({ version: 3 }));
    const gone = guest({ firstName: "Gone", deletedAt: deleted, version: 2 });
    await openDeleted({ guests: [guest(), gone] });
    await userEvent.click(screen.getByRole("button", { name: "Ripristina Gone Rossi" }));
    expect(actions.restoreEntityAction).toHaveBeenCalledWith({
      kind: "guest",
      id: gone.id,
      version: 2,
    });
  });

  it("confirms with the number before 'Svuota' and only then deletes for good", async () => {
    actions.emptyDeletedAction.mockResolvedValue(ok({ guests: 2, groups: 0, tables: 0 }));
    await openDeleted({
      guests: [guest(), guest({ deletedAt: deleted }), guest({ deletedAt: deleted })],
    });
    await userEvent.click(screen.getByRole("button", { name: "Svuota persone" }));
    const confirm = screen.getByRole("alertdialog");
    expect(within(confirm).getByText("Elimini definitivamente 2 persone?")).toBeTruthy();
    expect(within(confirm).getByText(/Non si può annullare/)).toBeTruthy();
    expect(actions.emptyDeletedAction).not.toHaveBeenCalled();
    await userEvent.click(within(confirm).getByRole("button", { name: "Elimina definitivamente" }));
    expect(actions.emptyDeletedAction).toHaveBeenCalledWith({ scope: "guests" });
  });

  it("deletes one person for good after the confirmation", async () => {
    actions.purgeEntityAction.mockResolvedValue({ ok: true, data: undefined });
    const gone = guest({ firstName: "Gone", deletedAt: deleted });
    await openDeleted({ guests: [guest(), gone] });
    await userEvent.click(
      screen.getByRole("button", { name: "Elimina definitivamente Gone Rossi" }),
    );
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Elimina definitivamente",
      }),
    );
    expect(actions.purgeEntityAction).toHaveBeenCalledWith({ kind: "guest", id: gone.id });
  });

  it("says so when nothing was deleted", async () => {
    await openDeleted({ guests: [guest()] });
    expect(screen.getByText("Niente di eliminato di recente.")).toBeTruthy();
  });
});

describe("family (AC5)", () => {
  it("saves the group and all the people in one request, proposing the surname", async () => {
    actions.createFamilyAction.mockResolvedValue(ok({ groupId: "g", guestIds: ["a", "b"] }));
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await userEvent.click(screen.getByRole("button", { name: "Una famiglia" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Nome del gruppo" }),
      "Famiglia Rossi",
    );
    expect(
      (screen.getByRole("textbox", { name: "Cognome (persona 1)" }) as HTMLInputElement).value,
    ).toBe("Rossi");
    await userEvent.type(screen.getByRole("textbox", { name: "Nome (persona 1)" }), "Mario");
    await userEvent.type(screen.getByRole("textbox", { name: "Nome (persona 2)" }), "Luca");
    await userEvent.selectOptions(screen.getByLabelText("Tipo (persona 2)"), "child");
    await userEvent.click(screen.getByRole("button", { name: "Salva la famiglia" }));
    await waitFor(() => expect(actions.createFamilyAction).toHaveBeenCalled());
    expect(actions.createFamilyAction).toHaveBeenCalledWith({
      name: "Famiglia Rossi",
      side: null,
      guests: [
        { firstName: "Mario", lastName: "Rossi", category: "adult" },
        { firstName: "Luca", lastName: "Rossi", category: "child" },
      ],
    });
  });
});

describe("load error", () => {
  it("shows an ErrorState with Riprova that reloads, and the not-migrated wording", async () => {
    render(<LoadError notMigrated />);
    expect(screen.getByText("Non riesco a caricare gli invitati")).toBeTruthy();
    expect(screen.getByText(/non sono ancora pronti/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(nav.refresh).toHaveBeenCalled();
  });
});
