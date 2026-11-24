// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
  actions: {
    addNoteAction: vi.fn(),
    addOptionAction: vi.fn(),
    chooseOptionAction: vi.fn(),
    removeOptionAction: vi.fn(),
    reopenDecisionAction: vi.fn(),
    restoreOptionAction: vi.fn(),
    setReactionAction: vi.fn(),
    setReferenceAction: vi.fn(),
    updateOptionAction: vi.fn(),
    updateScenarioAction: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("./actions", () => mocks.actions);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
// Radix radio items measure themselves; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { ChooseSheet } from "./ChooseSheet";
import { CompareOptions } from "./CompareOptions";
import { DecisionDetail, UNDO_MS } from "./DecisionDetail";
import { HistoryList } from "./HistoryList";
import { OptionCard } from "./OptionCard";
import { OptionFormSheet, type OptionFormApi } from "./OptionFormSheet";
import { ReactionButtons } from "./ReactionButtons";
import { ReferenceSheet } from "./ReferenceSheet";
import { ReopenSheet } from "./ReopenSheet";
import type { DecisionDetailView, EventView, OptionView } from "./types";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

function locationOption(overrides: Partial<OptionView> = {}): OptionView {
  return {
    id: "loc-a",
    title: "Mamma Rosa",
    comune: "Lucca",
    link: "https://mammarosa.example.test/menu",
    notes: "Chiedere il preventivo",
    pros: ["Giardino"],
    cons: ["Lontana"],
    costCents: 500000,
    status: "candidate",
    version: 2,
    scenario: null,
    reactions: [],
    ...overrides,
  };
}

function dateOption(
  id: string,
  title: string,
  dateFrom: string,
  extra: Partial<OptionView> = {},
  scenario: Partial<NonNullable<OptionView["scenario"]>> = {},
): OptionView {
  return {
    ...locationOption({
      id,
      title,
      comune: null,
      link: null,
      notes: null,
      pros: [],
      cons: [],
      costCents: null,
    }),
    scenario: {
      id: `sc-${id}`,
      kind: "fixed",
      dateFrom,
      dateTo: null,
      locationOptionId: null,
      locationName: null,
      version: 4,
      ...scenario,
    },
    ...extra,
  };
}

function dateView(overrides: Partial<DecisionDetailView> = {}): DecisionDetailView {
  const a = dateOption("a", "3 settembre 2027", "2027-09-03", {}, { locationName: "Mamma Rosa" });
  const b = dateOption(
    "b",
    "Maggio 2028",
    "2028-05-01",
    {},
    { kind: "period", dateTo: "2028-06-30" },
  );
  return {
    id: "d-date",
    weddingId: "w",
    key: "date",
    type: "date",
    question: "Quando vi sposate?",
    status: "open",
    state: "open",
    version: 3,
    chosenOptionId: null,
    chosenAt: null,
    chosenByName: null,
    options: [a, b],
    events: [],
    reference: {
      optionId: "a",
      date: "2027-09-03",
      isPeriod: false,
      status: "provisional",
      source: "automatic",
      setByName: null,
    },
    manualReferenceId: null,
    changedCounts: { a: 0, b: 14 },
    locationChoices: [{ id: "loc-a", title: "Mamma Rosa" }],
    partnerName: "Jessica",
    meName: "Tony",
    ...overrides,
  };
}

describe("OptionCard (AC17)", () => {
  it("always shows the same key/value rows and pros/cons with a text alternative to the icon", () => {
    render(
      <ul>
        <OptionCard option={locationOption()} />
        <OptionCard
          option={locationOption({
            id: "x",
            title: "Vuota",
            comune: null,
            link: null,
            notes: null,
            pros: [],
            cons: [],
            costCents: null,
          })}
        />
      </ul>,
    );
    for (const label of ["Comune", "Costo indicativo", "Link", "Pro", "Contro", "Note"]) {
      expect(screen.getAllByText(label)).toHaveLength(2);
    }
    expect(screen.getByText("€ 5.000")).toBeTruthy();
    expect(screen.getByText("Pro:", { exact: false }).className).toContain("sr-only");
    expect(screen.getByText("Contro:", { exact: false }).className).toContain("sr-only");
    const link = screen.getByRole("link", { name: /mammarosa\.example\.test/ });
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("marks the chosen option with text, not only colour", () => {
    render(
      <ul>
        <OptionCard option={locationOption({ status: "chosen" })} chosen />
      </ul>,
    );
    expect(screen.getByText("Scelta")).toBeTruthy();
  });
});

describe("ReactionButtons (AC22)", () => {
  it("toggles prefer/doubt and removes the reaction by pressing the active one", async () => {
    const onReact = vi.fn();
    const { rerender } = render(<ReactionButtons option={locationOption()} onReact={onReact} />);
    await userEvent.click(screen.getByRole("button", { name: /Preferisco/ }));
    expect(onReact).toHaveBeenLastCalledWith("prefer");
    rerender(
      <ReactionButtons
        option={locationOption({
          reactions: [{ userId: "me", name: "Tony", reaction: "prefer", mine: true }],
        })}
        onReact={onReact}
      />,
    );
    const pressed = screen.getByRole("button", { name: /Preferisco/ });
    expect(pressed.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(pressed);
    expect(onReact).toHaveBeenLastCalledWith(null);
  });

  it("shows the partner's reaction as text and hides the buttons when disabled", () => {
    render(
      <ReactionButtons
        option={locationOption({
          reactions: [{ userId: "her", name: "Jessica", reaction: "doubt", mine: false }],
        })}
        onReact={() => {}}
        disabled
      />,
    );
    expect(screen.getByText("Jessica: ha dei dubbi")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("CompareOptions (AC17)", () => {
  it("renders a table with a column per option, row headers and a scrollable focusable region", () => {
    render(
      <CompareOptions
        a={locationOption()}
        b={locationOption({
          id: "b",
          title: "Villa Rosa",
          comune: "Pisa",
          pros: [],
          cons: ["Caro"],
        })}
        type="location"
        reference={null}
        onClose={() => {}}
      />,
    );
    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(expect.arrayContaining(["Mamma Rosa", "Villa Rosa"]));
    expect(
      within(table)
        .getAllByRole("rowheader")
        .map((h) => h.textContent),
    ).toContain("Comune");
    const region = screen.getByTestId("compare").querySelector("[role=region]")!;
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.className).toContain("overflow-x-auto");
  });

  it("tells the user to scroll sideways on a phone and gives the sticky column an edge (DES-33)", () => {
    render(
      <CompareOptions
        a={locationOption()}
        b={locationOption({ id: "b" })}
        type="location"
        reference={null}
        onClose={() => {}}
      />,
    );
    const hint = screen.getByTestId("compare-hint");
    expect(hint.textContent).toContain("Scorri di lato");
    expect(hint.className).toContain("md:hidden");
    const rowHeader = screen.getAllByRole("rowheader")[0]!;
    expect(rowHeader.className).toContain("sticky");
    expect(rowHeader.className).toContain("shadow-");
  });

  it("closes", async () => {
    const onClose = vi.fn();
    render(
      <CompareOptions
        a={locationOption()}
        b={locationOption({ id: "b" })}
        type="location"
        reference={null}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Chiudi il confronto/ }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("HistoryList (AC21)", () => {
  const events: EventView[] = [
    {
      id: 1,
      kind: "option_added",
      at: "2026-11-24T10:00:00Z",
      actorName: "Tony",
      optionId: "a",
      optionTitle: "3 settembre 2027",
      reason: null,
      payload: {},
    },
    {
      id: 2,
      kind: "reference_set",
      at: "2026-11-24T10:05:00Z",
      actorName: "Jessica",
      optionId: "b",
      optionTitle: "Maggio 2028",
      reason: null,
      payload: { reference_date: "2028-05-14", kind: "fixed" },
    },
    {
      id: 3,
      kind: "reference_auto",
      at: "2026-11-24T10:06:00Z",
      actorName: "Jessica",
      optionId: null,
      optionTitle: null,
      reason: null,
      payload: {},
    },
  ];

  it("lists the events in order, including the reference ones, with no way to edit them", () => {
    render(<HistoryList events={events} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[1]!.textContent).toContain(
      "Jessica ha impostato il 14 mag 2028 come riferimento provvisorio",
    );
    expect(items[2]!.textContent).toContain("Jessica è tornato al riferimento automatico");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("appends a note and clears the field; an empty note is refused inline", async () => {
    const onAddNote = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    render(<HistoryList events={events} onAddNote={onAddNote} />);
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi nota" }));
    expect(screen.getByText("Scrivi qualcosa nella nota.")).toBeTruthy();
    expect(onAddNote).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Aggiungi nota"), "Chiamare lunedì");
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi nota" }));
    await waitFor(() => expect(onAddNote).toHaveBeenCalledWith("Chiamare lunedì"));
    await waitFor(() =>
      expect((screen.getByLabelText("Aggiungi nota") as HTMLTextAreaElement).value).toBe(""),
    );
  });
});

describe("ChooseSheet (AC18, AC64)", () => {
  it("fixed date: shows the consequence and confirms without a day", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    render(
      <ChooseSheet
        open
        onOpenChange={() => {}}
        option={dateOption("a", "14 mag", "2028-05-14")}
        type="date"
        onConfirm={onConfirm}
      />,
    );
    expect(
      screen.getByText("Le scadenze del Percorso si calcoleranno su questa data."),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Giorno esatto")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Conferma la scelta" }));
    expect(onConfirm).toHaveBeenCalledWith(null);
  });

  it("period: asks for the exact day, refuses an empty or out-of-period day inline, then sends it", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const period = dateOption(
      "b",
      "Maggio 2028",
      "2028-05-01",
      {},
      { kind: "period", dateTo: "2028-06-30" },
    );
    render(
      <ChooseSheet
        open
        onOpenChange={() => {}}
        option={period}
        type="date"
        onConfirm={onConfirm}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Conferma la scelta" }));
    expect(screen.getByText("Indica il giorno esatto dentro il periodo.")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    const field = screen.getByLabelText("Giorno esatto");
    fireEvent.change(field, { target: { value: "2028-07-02" } });
    await userEvent.click(screen.getByRole("button", { name: "Conferma la scelta" }));
    expect(screen.getByText("Il giorno deve cadere dentro il periodo.")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: "2028-05-20" } });
    await userEvent.click(screen.getByRole("button", { name: "Conferma la scelta" }));
    expect(onConfirm).toHaveBeenCalledWith("2028-05-20");
  });

  it("shows a server refusal of the day inline", async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      ok: false,
      code: "exact_date_out_of_period",
      message: "Il giorno deve cadere dentro il periodo.",
    });
    const period = dateOption(
      "b",
      "Maggio 2028",
      "2028-05-01",
      {},
      { kind: "period", dateTo: "2028-06-30" },
    );
    render(
      <ChooseSheet
        open
        onOpenChange={() => {}}
        option={period}
        type="date"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.change(screen.getByLabelText("Giorno esatto"), { target: { value: "2028-05-20" } });
    await userEvent.click(screen.getByRole("button", { name: "Conferma la scelta" }));
    await waitFor(() =>
      expect(screen.getByText("Il giorno deve cadere dentro il periodo.")).toBeTruthy(),
    );
  });
});

describe("ReopenSheet (AC19)", () => {
  it("requires a reason: inline error, no request", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    render(<ReopenSheet open onOpenChange={() => {}} onConfirm={onConfirm} type="date" />);
    await userEvent.click(screen.getByRole("button", { name: "Riapri la scelta" }));
    const field = screen.getByLabelText("Perché vuoi riaprire questa scelta?");
    const error = screen.getByText(/Scrivi il motivo/);
    expect(field.getAttribute("aria-describedby")).toContain(error.id);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("counts characters and sends the trimmed reason", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    render(<ReopenSheet open onOpenChange={() => {}} onConfirm={onConfirm} type="location" />);
    await userEvent.type(
      screen.getByLabelText("Perché vuoi riaprire questa scelta?"),
      "  Ripensiamoci ",
    );
    expect(screen.getByText("15/500")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Riapri la scelta" }));
    expect(onConfirm).toHaveBeenCalledWith("Ripensiamoci");
  });

  it("shows a server reason error inline too", async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      ok: false,
      code: "reason_too_long",
      message: "Il motivo è troppo lungo (massimo 500 caratteri).",
    });
    render(<ReopenSheet open onOpenChange={() => {}} onConfirm={onConfirm} type="location" />);
    await userEvent.type(screen.getByLabelText("Perché vuoi riaprire questa scelta?"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Riapri la scelta" }));
    await waitFor(() => expect(screen.getByText(/troppo lungo/)).toBeTruthy());
  });
});

describe("ReferenceSheet (design §3.8)", () => {
  it("states the consequence with the number of deadlines that change", () => {
    render(
      <ReferenceSheet
        open
        onOpenChange={() => {}}
        option={dateOption("b", "14 mag", "2028-05-14")}
        changedCount={14}
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        /Le scadenze dei compiti si ricalcolano sul 14 maggio 2028\. I compiti già completati o con scadenza modificata da te restano come sono\. 14 scadenze cambiano\./,
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Imposta come riferimento" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Annulla" })).toBeTruthy();
  });
});

describe("DecisionDetail: date decision and reference actions (AC24, D28)", () => {
  it("shows the badge, the linked location, and the actions on the right cards", () => {
    render(<DecisionDetail view={dateView()} />);
    expect(screen.getByText(/Riferimento · provvisorio/)).toBeTruthy();
    expect(screen.getAllByText("Mamma Rosa").length).toBeGreaterThan(0);
    // only the non-reference card has "Imposta come riferimento" and "Anteprima"
    expect(screen.getAllByRole("button", { name: "Imposta come riferimento" })).toHaveLength(1);
    const preview = screen.getByRole("link", { name: "Anteprima" });
    expect(preview.getAttribute("href")).toBe("/percorso?anteprima=b");
    expect(screen.getAllByRole("button", { name: "Scegli questa data" })).toHaveLength(2);
    expect(screen.getByText("Il più vicino: lo usiamo per non farti arrivare tardi.")).toBeTruthy();
  });

  it("sets the reference after confirmation and offers Annulla for at least 8 s that restores the previous one", async () => {
    mocks.actions.setReferenceAction.mockResolvedValue({
      ok: true,
      data: {
        optionId: "b",
        referenceDate: "2028-05-01",
        status: "provisional",
        source: "manual",
        // what the server saw just before writing (the partner's manual choice), not the render
        previousOptionId: "c",
      },
    });
    render(<DecisionDetail view={dateView()} />);
    await userEvent.click(screen.getByRole("button", { name: "Imposta come riferimento" }));
    expect(screen.getByText(/14 scadenze cambiano/)).toBeTruthy();
    const sheet = screen.getByRole("dialog");
    await userEvent.click(within(sheet).getByRole("button", { name: "Imposta come riferimento" }));
    await waitFor(() =>
      expect(mocks.actions.setReferenceAction).toHaveBeenCalledWith({ optionId: "b" }),
    );

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    const [message, options] = mocks.toast.mock.calls[0]!;
    expect(message).toContain("1 mag 2028");
    expect(options.duration).toBeGreaterThanOrEqual(8000);
    expect(UNDO_MS).toBeGreaterThanOrEqual(8000);
    expect(options.action.label).toBe("Annulla");

    mocks.actions.setReferenceAction.mockResolvedValue({ ok: true, data: {} });
    await options.action.onClick();
    expect(mocks.actions.setReferenceAction).toHaveBeenLastCalledWith({ optionId: "c" });
  });

  it("a manual reference offers 'Torna automatico' and Annulla goes back to it", async () => {
    mocks.actions.setReferenceAction.mockResolvedValue({
      ok: true,
      data: {
        optionId: "a",
        referenceDate: "2027-09-03",
        status: "provisional",
        source: "automatic",
        previousOptionId: "b",
      },
    });
    const view = dateView({
      manualReferenceId: "b",
      reference: {
        optionId: "b",
        date: "2028-05-01",
        isPeriod: true,
        status: "provisional",
        source: "manual",
        setByName: "Jessica",
      },
    });
    render(<DecisionDetail view={view} />);
    expect(screen.getByText(/scelto da Jessica/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Torna automatico (il più vicino)" }));
    await waitFor(() =>
      expect(mocks.actions.setReferenceAction).toHaveBeenCalledWith({ optionId: null }),
    );
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    const [message, options] = mocks.toast.mock.calls[0]!;
    expect(message).toContain("(il più vicino)");
    await options.action.onClick();
    expect(mocks.actions.setReferenceAction).toHaveBeenLastCalledWith({ optionId: "b" });
  });

  it("with a single scenario there is no 'Imposta come riferimento' nor 'Anteprima'", () => {
    const only = dateView().options[0]!;
    render(<DecisionDetail view={dateView({ options: [only] })} />);
    expect(screen.queryByRole("button", { name: "Imposta come riferimento" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Anteprima" })).toBeNull();
    expect(screen.getByRole("button", { name: "Scegli questa data" })).toBeTruthy();
  });

  it("once the decision is taken the reference actions disappear and the explanation shows", () => {
    const a = dateOption("a", "3 settembre 2027", "2027-09-03", { status: "discarded" });
    const b = dateOption("b", "14 maggio 2028", "2028-05-14", { status: "chosen" });
    const view = dateView({
      status: "taken",
      state: "taken",
      chosenOptionId: "b",
      chosenAt: "2026-11-24T10:00:00Z",
      chosenByName: "Jessica",
      options: [b, a],
      reference: {
        optionId: "b",
        date: "2028-05-14",
        isPeriod: false,
        status: "definitive",
        source: "chosen",
        setByName: null,
      },
      changedCounts: {},
    });
    render(<DecisionDetail view={view} />);
    expect(screen.queryByRole("button", { name: "Imposta come riferimento" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Torna automatico (il più vicino)" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Anteprima" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Scegli questa data" })).toBeNull();
    expect(
      screen.getByText(/La data è scelta: per cambiare le scadenze riapri la scelta/),
    ).toBeTruthy();
    expect(screen.getAllByText(/Riferimento · definitivo/).length).toBeGreaterThan(0);
    expect(screen.getByText("Data scelta: 14 mag 2028")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Riapri la scelta" })).toBeTruthy();
    // no new candidates on a taken decision
    expect(screen.queryByRole("button", { name: "Aggiungi una data" })).toBeNull();
    // the discarded one sits in the collapsible section
    const discarded = screen.getByTestId("discarded");
    expect(discarded.tagName).toBe("DETAILS");
    expect(within(discarded).getByText(/Opzioni scartate \(1\)/)).toBeTruthy();
  });

  it("choosing a period asks for the exact day and sends it with the decision version", async () => {
    mocks.actions.chooseOptionAction.mockResolvedValue({
      ok: true,
      data: { referenceDate: "2028-05-20" },
    });
    render(<DecisionDetail view={dateView()} />);
    const buttons = screen.getAllByRole("button", { name: "Scegli questa data" });
    await userEvent.click(buttons[1]!);
    const sheet = screen.getByRole("dialog");
    fireEvent.change(within(sheet).getByLabelText("Giorno esatto"), {
      target: { value: "2028-05-20" },
    });
    await userEvent.click(within(sheet).getByRole("button", { name: "Conferma la scelta" }));
    await waitFor(() =>
      expect(mocks.actions.chooseOptionAction).toHaveBeenCalledWith({
        decisionId: "d-date",
        optionId: "b",
        expectedVersion: 3,
        exactDate: "2028-05-20",
      }),
    );
  });

  it("reloads the page when the choice is stale (the partner got there first)", async () => {
    mocks.actions.chooseOptionAction.mockResolvedValue({
      ok: false,
      code: "already_taken",
      message: "Questa scelta è già stata presa.",
    });
    render(<DecisionDetail view={dateView()} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Scegli questa data" })[0]!);
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Conferma la scelta" }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    // the sheet for a choice that no longer applies is gone; the message is toasted
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.toast.error).toHaveBeenCalledWith("Questa scelta è già stata presa.");
  });

  it("'Confronta 2' needs two ticked options and then shows the comparison", async () => {
    render(<DecisionDetail view={dateView()} />);
    const compare = screen.getByRole("button", { name: "Confronta 2" }) as HTMLButtonElement;
    expect(compare.disabled).toBe(true);
    await userEvent.click(screen.getByRole("checkbox", { name: "Confronta «3 settembre 2027»" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Confronta «Maggio 2028»" }));
    expect(compare.disabled).toBe(false);
    await userEvent.click(compare);
    expect(screen.getByTestId("compare")).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "Location collegata" })).toBeTruthy();
  });

  it("removing an option offers Annulla that restores it", async () => {
    mocks.actions.removeOptionAction.mockResolvedValue({ ok: true, data: { version: 5 } });
    mocks.actions.restoreOptionAction.mockResolvedValue({ ok: true, data: { version: 6 } });
    render(<DecisionDetail view={dateView()} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Elimina" })[1]!);
    await waitFor(() =>
      expect(mocks.actions.removeOptionAction).toHaveBeenCalledWith({ optionId: "b", version: 2 }),
    );
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    const [, options] = mocks.toast.mock.calls[0]!;
    expect(options.duration).toBeGreaterThanOrEqual(8000);
    await options.action.onClick();
    expect(mocks.actions.restoreOptionAction).toHaveBeenCalledWith({ optionId: "b", version: 5 });
  });

  it("an empty decision invites to add the first option", () => {
    render(<DecisionDetail view={dateView({ options: [], reference: null, changedCounts: {} })} />);
    expect(screen.getByText("Nessuna data: aggiungi la prima")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aggiungi una data" })).toBeTruthy();
  });
});

describe("DecisionDetail: location decision", () => {
  const locView = (): DecisionDetailView =>
    dateView({
      id: "d-loc",
      key: "location",
      type: "location",
      question: "Dove vi sposate?",
      options: [locationOption(), locationOption({ id: "loc-b", title: "Villa Rosa" })],
      reference: null,
      changedCounts: {},
    });

  it("shows OptionCards with Scegli, no reference actions", () => {
    render(<DecisionDetail view={locView()} />);
    expect(screen.getAllByRole("button", { name: "Scegli" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Imposta come riferimento" })).toBeNull();
    expect(screen.queryByText(/Riferimento/)).toBeNull();
  });

  it("reopens a taken choice with the reason", async () => {
    mocks.actions.reopenDecisionAction.mockResolvedValue({ ok: true, data: undefined });
    const view = {
      ...locView(),
      status: "taken" as const,
      state: "taken" as const,
      chosenOptionId: "loc-a",
      chosenAt: "2026-11-24T10:00:00Z",
      chosenByName: "Tony",
      options: [
        locationOption({ status: "chosen" }),
        locationOption({ id: "loc-b", title: "Villa Rosa", status: "discarded" }),
      ],
    };
    render(<DecisionDetail view={view} />);
    await userEvent.click(screen.getByRole("button", { name: "Riapri la scelta" }));
    const sheet = screen.getByRole("dialog");
    await userEvent.type(
      within(sheet).getByLabelText("Perché vuoi riaprire questa scelta?"),
      "Costa troppo",
    );
    await userEvent.click(within(sheet).getByRole("button", { name: "Riapri la scelta" }));
    await waitFor(() =>
      expect(mocks.actions.reopenDecisionAction).toHaveBeenCalledWith({
        decisionId: "d-loc",
        reason: "Costa troppo",
        expectedVersion: 3,
      }),
    );
  });
});

describe("OptionFormSheet", () => {
  function api(overrides: Partial<OptionFormApi> = {}): OptionFormApi {
    return {
      addOption: vi.fn().mockResolvedValue({ ok: true, data: { optionId: "n" } }),
      updateOption: vi.fn().mockResolvedValue({ ok: true, data: { version: 3 } }),
      updateScenario: vi.fn().mockResolvedValue({ ok: true, data: { version: 5 } }),
      ...overrides,
    };
  }

  function renderForm(props: Partial<React.ComponentProps<typeof OptionFormSheet>> = {}) {
    const defaults: React.ComponentProps<typeof OptionFormSheet> = {
      open: true,
      onOpenChange: vi.fn(),
      decision: { id: "d-loc", type: "location", status: "open" },
      option: null,
      locationChoices: [{ id: "loc-a", title: "Mamma Rosa" }],
      partnerName: "Jessica",
      api: api(),
      onSaved: vi.fn(),
      onStale: vi.fn(),
    };
    const merged = { ...defaults, ...props };
    render(<OptionFormSheet {...merged} />);
    return merged;
  }

  it("adds a location with pros, cons and an indicative cost", async () => {
    const props = renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    expect(screen.getByText("Scrivi un nome.")).toBeTruthy();
    expect(props.api.addOption).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Nome"), "Mamma Rosa");
    await userEvent.type(screen.getByLabelText("Comune"), "Lucca");
    await userEvent.type(screen.getByLabelText("Pro"), "Giardino{enter}Parcheggio");
    await userEvent.type(screen.getByLabelText("Contro"), "Lontana");
    await userEvent.type(screen.getByLabelText("Costo indicativo (facoltativo)"), "1500");
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(props.api.addOption).toHaveBeenCalled());
    expect(props.api.addOption).toHaveBeenCalledWith({
      decisionId: "d-loc",
      option: {
        title: "Mamma Rosa",
        comune: "Lucca",
        link: null,
        notes: null,
        pros: ["Giardino", "Parcheggio"],
        cons: ["Lontana"],
        costCents: 150000,
      },
      scenario: null,
    });
    expect(props.onSaved).toHaveBeenCalledWith("Opzione aggiunta.");
  });

  it("adds a fixed date linked to a location, with the label defaulting to the date", async () => {
    const props = renderForm({ decision: { id: "d-date", type: "date", status: "open" } });
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2028-05-14" } });
    fireEvent.change(screen.getByLabelText("Collegata a una location (facoltativo)"), {
      target: { value: "loc-a" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(props.api.addOption).toHaveBeenCalled());
    const call = vi.mocked(props.api.addOption).mock.calls[0]![0];
    expect(call.scenario).toEqual({
      kind: "fixed",
      dateFrom: "2028-05-14",
      dateTo: null,
      locationOptionId: "loc-a",
    });
    expect(call.option.title).toBe("14 maggio 2028");
  });

  it("warns, without blocking, about a date before 3 Sep 2027", async () => {
    renderForm({ decision: { id: "d-date", type: "date", status: "open" } });
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2027-06-01" } });
    expect(
      screen.getByText("È prima della data che desideravate: ricontrolla con la location."),
    ).toBeTruthy();
  });

  it("an edit conflict opens the dialog: 'Salva comunque' retries with the current version, nothing is silent", async () => {
    const updateOption = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        code: "conflict",
        message: "conflitto",
        conflict: {
          current: {
            title: "Mamma Rosa Bis",
            comune: "Lucca",
            link: null,
            notes: null,
            pros: [],
            cons: [],
            costCents: null,
            version: 7,
          },
          changedByName: "Jessica",
          changedAt: new Date().toISOString(),
        },
      })
      .mockResolvedValueOnce({ ok: true, data: { version: 8 } });
    const props = renderForm({
      option: locationOption({ pros: [], cons: [], link: null, notes: null, costCents: null }),
      api: api({ updateOption }),
    });
    await userEvent.clear(screen.getByLabelText("Nome"));
    await userEvent.type(screen.getByLabelText("Nome"), "Mamma Rosa Due");
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() =>
      expect(screen.getByText(/Jessica ha modificato questo elemento/)).toBeTruthy(),
    );
    expect(updateOption).toHaveBeenCalledTimes(1);
    expect(updateOption.mock.calls[0]![0].version).toBe(2);

    await userEvent.click(screen.getByRole("button", { name: "Salva comunque" }));
    await waitFor(() => expect(updateOption).toHaveBeenCalledTimes(2));
    expect(updateOption.mock.calls[1]![0].version).toBe(7);
    expect(props.onSaved).toHaveBeenCalled();
  });

  it("cancelling a conflict reloads the other version", async () => {
    const updateOption = vi.fn().mockResolvedValue({
      ok: false,
      code: "conflict",
      message: "conflitto",
      conflict: {
        current: { title: "Altro", version: 7 },
        changedByName: "Jessica",
        changedAt: new Date().toISOString(),
      },
    });
    const props = renderForm({ option: locationOption(), api: api({ updateOption }) });
    await userEvent.type(screen.getByLabelText("Nome"), " 2");
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(screen.getByText(/ha modificato questo elemento/)).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(props.onStale).toHaveBeenCalled();
  });

  it("after the date is chosen only the linked location can change, and only the location is sent", async () => {
    const chosen = dateOption("a", "14 maggio 2028", "2028-05-14", { status: "chosen" });
    const props = renderForm({
      decision: { id: "d-date", type: "date", status: "taken" },
      option: chosen,
    });
    expect(screen.queryByLabelText("Data")).toBeNull();
    expect(screen.getByText(/La data è scelta: per cambiarla riapri la scelta/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Collegata a una location (facoltativo)"), {
      target: { value: "loc-a" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(props.api.updateScenario).toHaveBeenCalled());
    expect(props.api.updateScenario).toHaveBeenCalledWith({
      scenarioId: "sc-a",
      version: 4,
      scenario: { kind: "fixed", dateFrom: "2028-05-14", dateTo: null, locationOptionId: "loc-a" },
      locationOnly: true,
    });
    expect(props.api.updateOption).not.toHaveBeenCalled();
  });

  it("shows a server refusal at the bottom of the form", async () => {
    renderForm({
      api: api({
        addOption: vi.fn().mockResolvedValue({
          ok: false,
          code: "decision_taken",
          message: "La scelta è presa: per cambiare le date o aggiungere opzioni riaprila prima.",
        }),
      }),
    });
    await userEvent.type(screen.getByLabelText("Nome"), "X");
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/riaprila prima/));
  });
});
