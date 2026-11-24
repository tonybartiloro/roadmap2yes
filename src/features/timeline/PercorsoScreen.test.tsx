// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUREAUCRATIC_DISCLAIMER } from "@/content/milestones";
import { addDays } from "@/lib/dates/plain-date";
import { generateTasks } from "@/domain/timeline";
import type { PercorsoData } from "./model";
import { ME, PARTNER, makeData, scenario, task, templateTask } from "./test-fixtures";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav, usePathname: () => "/percorso" }));

const toastMock = vi.hoisted(() => {
  const fn = vi.fn() as ReturnType<typeof vi.fn> & { error: ReturnType<typeof vi.fn> };
  fn.error = vi.fn();
  return fn;
});
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));

const actions = vi.hoisted(() => ({
  acceptSuggestedTaskAction: vi.fn(),
  acknowledgeReviewAction: vi.fn(),
  createTaskAction: vi.fn(),
  deleteTaskAction: vi.fn(),
  dismissSuggestionAction: vi.fn(),
  restoreTaskAction: vi.fn(),
  setReferenceAction: vi.fn(),
  setTaskStatusAction: vi.fn(),
  updateTaskAction: vi.fn(),
}));
vi.mock("./actions", () => actions);

import { PercorsoScreen } from "./PercorsoScreen";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
// Radix (switch, checkbox) measures its elements; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const TODAY = "2026-11-24";
const at = (days: number) => addDays(TODAY, days);
const ok = <T,>(data: T) => ({ ok: true as const, data });

function renderScreen(
  overrides: Partial<PercorsoData> = {},
  props: { previewId?: string | null; emailEnabled?: boolean } = {},
) {
  return render(
    <PercorsoScreen
      data={makeData(overrides)}
      today={TODAY}
      previewId={props.previewId ?? null}
      emailEnabled={props.emailEnabled ?? true}
    />,
  );
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  toastMock.mockReset();
  toastMock.error.mockReset();
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.refresh.mockReset();
  actions.setTaskStatusAction.mockResolvedValue(ok({ id: "x", version: 2 }));
  actions.deleteTaskAction.mockResolvedValue(ok({ id: "x", version: 2 }));
  actions.restoreTaskAction.mockResolvedValue(ok({ id: "x", version: 3 }));
  actions.updateTaskAction.mockResolvedValue(ok({ id: "x", version: 2 }));
  actions.createTaskAction.mockResolvedValue(ok({ id: "new", version: 1 }));
  actions.setReferenceAction.mockResolvedValue(
    ok({ previousOptionId: null, referenceDate: "2027-09-03" }),
  );
  actions.acknowledgeReviewAction.mockResolvedValue(ok(2));
  actions.acceptSuggestedTaskAction.mockResolvedValue(ok(1));
  actions.dismissSuggestionAction.mockResolvedValue(ok(null));
});
afterEach(() => cleanup());

const group = (id: string) => screen.getByTestId(`group-${id}`);
const rowsIn = (id: string) => within(group(id)).queryAllByTestId("task-row");

describe("groups and states (AC29, AC30; design §4)", () => {
  it("renders the phases with counters; Fatti is collapsed, Da recuperare open when short", () => {
    renderScreen({
      tasks: [
        task("soon", { dueDate: at(3), title: "Prenotare la sala" }),
        task("late", { dueDate: at(-10), title: "Scegliere il fotografo" }),
        task("next", { dueDate: at(60) }),
        task("done", { status: "done" }),
      ],
    });
    expect(screen.getByRole("heading", { name: "Percorso", level: 1 })).toBeTruthy();
    expect(rowsIn("adesso")).toHaveLength(1);
    expect(screen.getByTestId("group-count-da-recuperare").textContent).toBe("(1)");
    expect(screen.getByTestId("group-toggle-da-recuperare").getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(screen.getByTestId("group-toggle-fatti").getAttribute("aria-expanded")).toBe("false");
    expect(within(group("da-recuperare")).getByText(/hai ancora tempo/)).toBeTruthy();
  });

  it("Adesso shows the first 5 rows then 'Mostra tutte (N)'", async () => {
    const tasks = Array.from({ length: 7 }, (_, i) => task(`t${i}`, { dueDate: at(i + 1) }));
    renderScreen({ tasks });
    expect(rowsIn("adesso")).toHaveLength(5);
    await userEvent.click(screen.getByTestId("adesso-show-all"));
    expect(rowsIn("adesso")).toHaveLength(7);
  });

  it("Da recuperare is collapsed by default when longer than 5 rows, never dropped", () => {
    const tasks = Array.from({ length: 6 }, (_, i) => task(`l${i}`, { dueDate: at(-(i + 1)) }));
    renderScreen({ tasks });
    expect(screen.getByTestId("group-toggle-da-recuperare").getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(rowsIn("da-recuperare")).toHaveLength(6);
  });

  it("empty Adesso points to the next step (design §3.4)", () => {
    renderScreen({ tasks: [task("later", { dueDate: at(45), title: "Prenotare il fotografo" })] });
    expect(screen.getByTestId("empty-adesso").textContent).toBe(
      "Per ora niente di urgente. Il prossimo passo è «Prenotare il fotografo», tra 6 settimane.",
    );
  });

  it("no tasks at all: empty state with an action", async () => {
    renderScreen({ tasks: [] });
    expect(screen.getByText("Ancora nessun compito. Aggiungi il primo.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi compito" }));
    expect(screen.getByTestId("task-form")).toBeTruthy();
  });

  it("no reference: explains it and invites to add the first scenario; dependent tasks hidden", () => {
    renderScreen({
      tasks: [templateTask("scegli-catering"), templateTask("scegli-data-e-location")],
    });
    expect(screen.getByTestId("reference-status").textContent).toContain("Nessuna data scelta");
    expect(screen.getByRole("link", { name: "Aggiungi il primo scenario" })).toBeTruthy();
    expect(screen.getByTestId("hidden-note")).toBeTruthy();
    expect(rowsIn("adesso")).toHaveLength(1);
  });

  it("shows the email-off banner only when emails are off (AC59)", () => {
    const { unmount } = renderScreen({}, { emailEnabled: false });
    expect(document.querySelector('[data-slot="email-off-banner"]')).not.toBeNull();
    unmount();
    renderScreen({}, { emailEnabled: true });
    expect(document.querySelector('[data-slot="email-off-banner"]')).toBeNull();
  });

  it("the 'Miei' shortcut and the filter counter work together", async () => {
    renderScreen({
      tasks: [
        task("mine", { assignee: "A", dueDate: at(2) }),
        task("theirs", { assignee: "B", dueDate: at(2) }),
        task("both", { assignee: "both", dueDate: at(2) }),
      ],
    });
    expect(rowsIn("adesso")).toHaveLength(3);
    expect(screen.queryByTestId("filters-count")).toBeNull();
    await userEvent.click(screen.getByTestId("assignee-shortcut-mine"));
    expect(rowsIn("adesso")).toHaveLength(2);
    expect(screen.getByTestId("filters-count").textContent).toContain("1");
    await userEvent.click(screen.getByTestId("assignee-shortcut-partner"));
    expect(screen.getByRole("button", { name: /Di Jessica/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});

describe("task actions (AC31, AC40)", () => {
  it("completing moves the row to Fatti at once, announces it and offers 'Annulla' for at least 8 s", async () => {
    renderScreen({
      tasks: [task("a", { title: "Scegliere il menù", dueDate: at(2), version: 3 })],
    });
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Segna come fatto: Scegliere il menù" }),
    );
    await waitFor(() => expect(actions.setTaskStatusAction).toHaveBeenCalled());
    expect(actions.setTaskStatusAction).toHaveBeenCalledWith({
      id: "a",
      expectedVersion: 3,
      done: true,
    });
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const [message, options] = toastMock.mock.calls[0]!;
    expect(message).toBe("Compito completato.");
    expect(options.duration).toBeGreaterThanOrEqual(8000);
    expect(options.action.label).toBe("Annulla");
    expect(screen.getByTestId("live-region").textContent).toContain("spostato in Fatti");

    options.action.onClick();
    await waitFor(() =>
      expect(actions.setTaskStatusAction).toHaveBeenLastCalledWith({
        id: "a",
        expectedVersion: 2,
        done: false,
      }),
    );
  });

  it("delete: undo toast, then it is listed in 'Eliminati di recente' and restorable", async () => {
    renderScreen({ tasks: [task("a", { title: "Invitare gli zii", dueDate: at(2), version: 5 })] });
    await userEvent.click(screen.getByTestId("task-title"));
    let finish: (value: unknown) => void = () => {};
    actions.deleteTaskAction.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    await userEvent.click(await screen.findByTestId("task-delete"));
    await waitFor(() =>
      expect(actions.deleteTaskAction).toHaveBeenCalledWith({ id: "a", expectedVersion: 5 }),
    );
    // Optimistic: the row is already in 'Eliminati di recente' while the write is pending.
    await waitFor(() => expect(screen.getByTestId("recently-deleted")).toBeTruthy());
    finish(ok({ id: "a", version: 2 }));
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const [, options] = toastMock.mock.calls[0]!;
    expect(options.duration).toBeGreaterThanOrEqual(8000);

    options.action.onClick();
    await waitFor(() =>
      expect(actions.restoreTaskAction).toHaveBeenCalledWith({ id: "a", expectedVersion: 2 }),
    );
  });

  it("restoring from 'Eliminati di recente' uses the task version", async () => {
    renderScreen({
      tasks: [
        task("gone", {
          deleted: true,
          deletedAt: "2026-11-23T10:00:00Z",
          title: "Vecchio",
          version: 7,
        }),
      ],
    });
    await userEvent.click(screen.getByRole("button", { name: /Eliminati di recente/ }));
    await userEvent.click(screen.getByTestId("restore-gone"));
    await waitFor(() =>
      expect(actions.restoreTaskAction).toHaveBeenCalledWith({ id: "gone", expectedVersion: 7 }),
    );
  });

  it("a conflict opens the dialog with the partner's name; 'Salva comunque' retries on the current version", async () => {
    actions.updateTaskAction.mockResolvedValueOnce({
      ok: false,
      code: "unknown",
      message: "x",
      conflict: {
        currentVersion: 9,
        changedByName: "Jessica",
        changedAt: new Date().toISOString(),
        theirs: {
          title: "Fiori",
          dueDate: at(10),
          category: null,
          notes: null,
          assignee: "both",
          remindersEnabled: true,
          status: "todo",
        },
      },
    });
    renderScreen({ tasks: [task("a", { title: "Fiori", dueDate: at(3), version: 4 })] });
    await userEvent.click(screen.getByTestId("task-title"));
    await userEvent.click(await screen.findByTestId("task-edit"));
    const title = screen.getByLabelText("Titolo");
    await userEvent.clear(title);
    await userEvent.type(title, "Fiori e candele");
    await userEvent.click(screen.getByRole("button", { name: "Salva" }));

    expect(await screen.findByText(/Jessica ha modificato questo elemento/)).toBeTruthy();
    expect(actions.updateTaskAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a", expectedVersion: 4 }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Vedi cosa è cambiato" }));
    expect(screen.getByRole("rowheader", { name: "Scadenza" })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Salva comunque" }));
    await waitFor(() =>
      expect(actions.updateTaskAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: "a", expectedVersion: 9 }),
      ),
    );
  });

  it("'Annulla' on the conflict dialog reloads the other version without writing", async () => {
    actions.setTaskStatusAction.mockResolvedValueOnce({
      ok: false,
      code: "unknown",
      message: "x",
      conflict: {
        currentVersion: 6,
        changedByName: null,
        changedAt: null,
        theirs: {
          title: "A",
          dueDate: null,
          category: null,
          notes: null,
          assignee: "both",
          remindersEnabled: true,
          status: "todo",
        },
      },
    });
    renderScreen({ tasks: [task("a", { title: "A" })] });
    await userEvent.click(screen.getByRole("checkbox", { name: /Segna come fatto: A/ }));
    expect(await screen.findByText(/Il tuo partner ha modificato questo elemento/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(nav.refresh).toHaveBeenCalled();
    expect(actions.setTaskStatusAction).toHaveBeenCalledTimes(1);
  });

  it("the form requires a title and creates the task with the chosen assignee and reminder", async () => {
    renderScreen({ tasks: [task("a", { dueDate: at(3) })] });
    await userEvent.click(screen.getByTestId("task-add"));
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi compito" }));
    expect(screen.getByText("Scrivi un titolo per il compito.")).toBeTruthy();
    expect(actions.createTaskAction).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Titolo"), "Provare il menù");
    await userEvent.click(screen.getByRole("radio", { name: "Jessica" }));
    await userEvent.click(screen.getByRole("switch", { name: /Ricordamelo per email/ }));
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi compito" }));
    await waitFor(() => expect(actions.createTaskAction).toHaveBeenCalled());
    expect(actions.createTaskAction).toHaveBeenCalledWith({
      title: "Provare il menù",
      dueDate: null,
      category: null,
      notes: null,
      assignee: "B",
      remindersEnabled: false,
      status: "todo",
    });
  });

  it("the detail shows advice and the bureaucratic note, and 'Va bene così' for a task to review (AC20, AC25)", async () => {
    renderScreen({
      dateDecision: { id: "d", status: "open" },
      scenarios: [scenario("s1", "2027-03-12")],
      tasks: [
        templateTask("richiedi-pubblicazioni", {
          title: "Richiedere le pubblicazioni",
          advice: "Chiedi al comune.",
          dueDate: at(10),
          needsReview: true,
        }),
      ],
    });
    expect(screen.getByTestId("task-review-badge").textContent).toContain("Da rivedere");
    await userEvent.click(screen.getByTestId("task-title"));
    expect(await screen.findByTestId("task-advice")).toBeTruthy();
    expect(screen.getByTestId("task-bureaucratic-note").textContent).toContain(
      BUREAUCRATIC_DISCLAIMER,
    );
    await userEvent.click(screen.getByRole("button", { name: "Va bene così" }));
    await waitFor(() =>
      expect(actions.acknowledgeReviewAction).toHaveBeenCalledWith({
        taskId: "t-richiedi-pubblicazioni",
      }),
    );
  });
});

describe("reopened date, suggestions (AC16, AC20)", () => {
  it("shows the banner and acknowledges every task at once", async () => {
    renderScreen({
      scenarios: [scenario("s1", "2027-03-12"), scenario("s2", "2027-09-03")],
      manualReferenceId: "s1",
      events: [{ kind: "reopened", optionId: "s1", actorId: ME, at: "2026-11-24T08:00:00Z" }],
      tasks: [
        templateTask("scegli-catering", { dueDate: at(10), needsReview: true }),
        templateTask("scegli-testimoni", { dueDate: at(20), needsReview: true }),
      ],
    });
    expect(screen.getByTestId("reopened-banner").textContent).toContain(
      "Data riaperta: scadenze calcolate sull'ultima data scelta",
    );
    await userEvent.click(screen.getByTestId("acknowledge-all"));
    await waitFor(() =>
      expect(actions.acknowledgeReviewAction).toHaveBeenCalledWith({ taskId: null }),
    );
  });

  it("suggestions can be accepted or ignored, nothing happens by itself", async () => {
    const unknownTasks = generateTasks("unknown", "2027-09-03").map((g) =>
      templateTask(g.templateKey, { dueDate: g.dueDate, title: g.title }),
    );
    renderScreen({
      rite: "civile",
      tasks: unknownTasks,
      scenarios: [scenario("s1", "2027-09-03")],
    });
    expect(screen.getByTestId("suggestions-card")).toBeTruthy();
    expect(actions.acceptSuggestedTaskAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("suggestion-accept-contatta-comune-celebrazione"));
    await waitFor(() =>
      expect(actions.acceptSuggestedTaskAction).toHaveBeenCalledWith({
        templateKey: "contatta-comune-celebrazione",
      }),
    );
    await userEvent.click(screen.getByTestId("suggestion-ignore-documenti-pubblicazioni"));
    await waitFor(() =>
      expect(actions.dismissSuggestionAction).toHaveBeenCalledWith({
        templateKey: "documenti-pubblicazioni",
        kind: "add",
      }),
    );
    // Removal of the task that no longer applies: deletion with undo, via the versioned write.
    await userEvent.click(screen.getByTestId("suggestion-accept-scegli-il-rito"));
    await waitFor(() =>
      expect(actions.deleteTaskAction).toHaveBeenCalledWith({
        id: "t-scegli-il-rito",
        expectedVersion: 1,
      }),
    );
  });

  it("the strip 'Scadenze ricalcolate' names the partner who changed the dates (DES-19)", () => {
    renderScreen({
      scenarios: [scenario("s1", "2027-03-12"), scenario("s2", "2027-09-03")],
      previousSeenAt: "2026-11-23T08:00:00Z",
      events: [
        { kind: "option_added", optionId: "s1", actorId: PARTNER, at: "2026-11-23T20:00:00Z" },
      ],
    });
    expect(screen.getByTestId("recalc-strip").textContent).toContain(
      "Jessica ha cambiato qualcosa",
    );
  });
});

describe("scenario selector and preview (AC32)", () => {
  const scenarios = [
    scenario("s-near", "2027-03-12", { label: "Primavera" }),
    scenario("s-far", "2027-09-03", { label: "Mamma Rosa", locationOptionId: "loc" }),
  ];
  const withTasks = {
    scenarios,
    locations: [{ id: "loc", title: "Villa Rossi", status: "candidate" as const }],
    tasks: [
      templateTask("scegli-testimoni", { dueDate: "2026-07-12", title: "Scegliere i testimoni" }),
    ],
  };

  it("the selector is there with ≥ 2 open scenarios and enters the preview through the URL", async () => {
    renderScreen(withTasks);
    const trigger = screen.getByTestId("scenario-picker-trigger");
    expect(trigger.textContent).toContain("Scenario:");
    expect(trigger.textContent).toContain("provvisorio");
    await userEvent.click(trigger);
    expect(await screen.findByRole("radiogroup", { name: "Scenario di data" })).toBeTruthy();
    expect(screen.getByText("Riferimento attuale")).toBeTruthy();
    expect(screen.getByText("Villa Rossi")).toBeTruthy();
    await userEvent.click(screen.getByTestId("scenario-option-s-far"));
    expect(nav.push).toHaveBeenCalledWith("/percorso?anteprima=s-far");
  });

  it("no selector with one scenario or with the decision taken (the decision rules)", () => {
    const { unmount } = renderScreen({ scenarios: [scenarios[0]!] });
    expect(screen.queryByTestId("scenario-picker-trigger")).toBeNull();
    unmount();
    renderScreen({
      dateDecision: { id: "d", status: "taken" },
      scenarios: [
        { ...scenarios[0]!, status: "chosen" },
        { ...scenarios[1]!, status: "discarded" },
      ],
    });
    expect(screen.queryByTestId("scenario-picker-trigger")).toBeNull();
    expect(screen.getByTestId("reference-status").textContent).toContain("definitivo");
    expect(screen.getByTestId("reference-status").textContent).toContain(
      "La data è scelta: per cambiare le scadenze riapri la scelta.",
    );
  });

  it("the preview banner, distinct row style, no write requests, reference unchanged", () => {
    renderScreen(withTasks, { previewId: "s-far" });
    const banner = screen.getByTestId("preview-banner");
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.textContent).toContain("Anteprima: 3 set 2027 — nulla è salvato");
    expect(banner.textContent).toContain("Villa Rossi");
    expect(screen.getByTestId("preview-changed").textContent).toBe(
      "1 scadenza cambia rispetto al riferimento",
    );
    expect(screen.getByRole("link", { name: "Esci" }).getAttribute("href")).toBe("/percorso");
    expect(screen.getByRole("link", { name: "Scegli questa data", hidden: true })).toBeTruthy();
    const row = screen.getByTestId("task-row");
    expect(row.textContent).toContain("Anteprima:");
    expect(row.querySelector("s")).toBeTruthy();
    // The reference is still the nearest scenario, and nothing was sent.
    expect(screen.getByTestId("reference-status").textContent).toContain("12 mar 2027");
    for (const fn of Object.values(actions)) expect(fn).not.toHaveBeenCalled();
    // The banner is not dismissible: there is no close control.
    expect(within(banner).queryByRole("button", { name: /chiudi/i })).toBeNull();
  });

  it("'Imposta come riferimento' confirms the consequence, writes once and offers 'Annulla' (≥ 8 s)", async () => {
    actions.setReferenceAction.mockResolvedValueOnce(
      ok({ previousOptionId: "prev", referenceDate: "2027-09-03" }),
    );
    renderScreen(withTasks, { previewId: "s-far" });
    await userEvent.click(screen.getByTestId("preview-set-reference"));
    const sheet = await screen.findByTestId("reference-confirm");
    expect(sheet.textContent).toContain(
      "Le scadenze dei compiti si ricalcolano sul 3 settembre 2027",
    );
    expect(sheet.textContent).toContain("1 scadenza cambia.");
    expect(actions.setReferenceAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId("reference-confirm-ok"));
    await waitFor(() =>
      expect(actions.setReferenceAction).toHaveBeenCalledWith({ optionId: "s-far" }),
    );
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/percorso"));
    const [, options] = toastMock.mock.calls[0]!;
    expect(options.duration).toBeGreaterThanOrEqual(8000);
    options.action.onClick();
    await waitFor(() =>
      expect(actions.setReferenceAction).toHaveBeenLastCalledWith({ optionId: "prev" }),
    );
  });

  it("a refused reference (e.g. the scenario was removed meanwhile) explains it and writes nothing else", async () => {
    actions.setReferenceAction.mockResolvedValueOnce({
      ok: false,
      code: "invalid_option",
      message: "Questo scenario non è più disponibile. Ricarica e riprova.",
    });
    renderScreen(withTasks, { previewId: "s-far" });
    await userEvent.click(screen.getByTestId("preview-set-reference"));
    await userEvent.click(await screen.findByTestId("reference-confirm-ok"));
    expect(await screen.findByText(/non è più disponibile/)).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("in preview every write control is off: checkboxes, +, sheet actions, suggestions (AC32)", async () => {
    renderScreen(
      {
        ...withTasks,
        rite: "civile",
        tasks: [
          ...withTasks.tasks,
          task("gone", { deleted: true, deletedAt: "2026-11-23T10:00:00Z" }),
        ],
      },
      { previewId: "s-far" },
    );
    const box = screen.getByRole("checkbox", { name: /Scegliere i testimoni/ });
    expect(box.hasAttribute("disabled")).toBe(true);
    await userEvent.click(box);
    expect(screen.queryByTestId("task-add")).toBeNull();
    expect(screen.queryByTestId("suggestions-card")).toBeNull();
    expect(screen.queryByTestId("recently-deleted")).toBeNull();
    await userEvent.click(screen.getByTestId("task-title"));
    const sheet = await screen.findByTestId("task-sheet");
    expect(within(sheet).getByTestId("task-delete").closest("[hidden]")).not.toBeNull();
    for (const fn of Object.values(actions)) expect(fn).not.toHaveBeenCalled();
  });

  it("two quick toggles of one task go in order, the second on the version the first returned (QA-4)", async () => {
    let finish: (value: unknown) => void = () => {};
    actions.setTaskStatusAction.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    actions.setTaskStatusAction.mockResolvedValueOnce(ok({ id: "a", version: 4 }));
    renderScreen({ tasks: [task("a", { title: "Fiori", dueDate: at(2), version: 2 })] });
    await userEvent.click(screen.getByRole("checkbox", { name: /Segna come fatto/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Riapri: Fiori/, hidden: true }));
    expect(actions.setTaskStatusAction).toHaveBeenCalledTimes(1);
    finish(ok({ id: "a", version: 3 }));
    await waitFor(() => expect(actions.setTaskStatusAction).toHaveBeenCalledTimes(2));
    expect(actions.setTaskStatusAction).toHaveBeenLastCalledWith({
      id: "a",
      expectedVersion: 3,
      done: false,
    });
  });

  it("closing the sheet with Escape gives focus back to the task title (QA-6)", async () => {
    renderScreen({ tasks: [task("a", { title: "Fiori", dueDate: at(2) })] });
    const title = screen.getByTestId("task-title");
    await userEvent.click(title);
    await screen.findByTestId("task-sheet");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("task-title")));
  });

  it("the partner shortcut reads well without a name (QA-3)", () => {
    renderScreen({ partners: [{ slot: "A", name: "Tony", userId: ME }] });
    expect(screen.getByTestId("assignee-shortcut-partner").textContent).toBe("Del tuo partner");
  });

  it("a failed undo shows an error and reloads (AC31)", async () => {
    actions.setTaskStatusAction.mockResolvedValueOnce(ok({ id: "a", version: 2 }));
    renderScreen({ tasks: [task("a", { title: "Scegliere il menù", dueDate: at(2) })] });
    await userEvent.click(screen.getByRole("checkbox", { name: /Segna come fatto/ }));
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const [, options] = toastMock.mock.calls[0]!;
    actions.setTaskStatusAction.mockResolvedValueOnce({
      ok: false,
      code: "unavailable",
      message: "Non riesco a raggiungere il servizio. Riprova tra poco.",
    });
    options.action.onClick();
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "Non riesco a raggiungere il servizio. Riprova tra poco.",
      ),
    );
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("a checkbox failure does not leak an error into the next sheet (REV-5)", async () => {
    actions.setTaskStatusAction.mockResolvedValueOnce({
      ok: false,
      code: "unknown",
      message: "Non sono riuscito a salvare. Riprova.",
    });
    renderScreen({ tasks: [task("a", { title: "A", dueDate: at(2) })] });
    await userEvent.click(screen.getByRole("checkbox", { name: /Segna come fatto/ }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    await userEvent.click(screen.getByTestId("task-title"));
    const sheet = await screen.findByTestId("task-sheet");
    expect(within(sheet).queryByRole("alert")).toBeNull();
  });

  it("a preview of a scenario that is gone closes with a notice", () => {
    renderScreen(withTasks, { previewId: "vanished" });
    expect(screen.queryByTestId("preview-banner")).toBeNull();
    expect(screen.getByTestId("preview-closed").textContent).toContain("l'anteprima si è chiusa");
  });

  it("previewing the scenario that is already the reference shows no banner", () => {
    renderScreen(withTasks, { previewId: "s-near" });
    expect(screen.queryByTestId("preview-banner")).toBeNull();
    expect(screen.queryByTestId("preview-closed")).toBeNull();
  });

  it("a period shows how it is computed ('calcolata dal 1 mag')", () => {
    renderScreen(
      {
        scenarios: [
          scenario("p1", "2028-05-01", { kind: "period", dateTo: "2028-06-30" }),
          scenario("f1", "2027-09-03"),
        ],
        tasks: [task("a", { dueDate: at(3) })],
      },
      { previewId: "p1" },
    );
    expect(screen.getByTestId("preview-banner").textContent).toContain("calcolata dal 1 mag");
  });
});
