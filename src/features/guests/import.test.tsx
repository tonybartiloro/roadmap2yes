// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav, usePathname: () => "/invitati" }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), dismiss: vi.fn() }),
  Toaster: () => null,
}));

const mocks = vi.hoisted(() => ({
  importGuestsAction: vi.fn(),
  undoGuestImportAction: vi.fn(),
  downloadText: vi.fn(),
}));
vi.mock("./import-actions", () => ({
  importGuestsAction: mocks.importGuestsAction,
  undoGuestImportAction: mocks.undoGuestImportAction,
}));
vi.mock("./actions", () => ({}));
vi.mock("./tables-actions", () => ({}));
vi.mock("@/features/export/download", () => ({ downloadText: mocks.downloadText }));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
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

import { toast } from "sonner";
import type { GroupView, GuestView, GuestsSnapshot } from "./data";
import { exportMenuAction } from "./ExportButton";
import { GuestsScreen } from "./GuestsScreen";

const PARTNERS = { a: "Tony", b: "Jessica" };
const ok = <T,>(data: T) => ({ ok: true as const, data });
const BATCH = "00000000-0000-4000-8000-0000000000aa";

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

function renderScreen(snapshot: Partial<GuestsSnapshot> = {}) {
  const full: GuestsSnapshot = { guests: [], groups: [], tables: [], ...snapshot };
  return render(<GuestsScreen snapshot={full} partners={PARTNERS} importNames={PARTNERS} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  n = 0;
});
afterEach(() => cleanup());

async function openImport() {
  await userEvent.click(screen.getByRole("button", { name: "Importa" }));
}
async function paste(text: string) {
  await userEvent.click(screen.getByRole("textbox", { name: "Una persona per riga" }));
  await userEvent.paste(text);
}
const preview = () => userEvent.click(screen.getByRole("button", { name: "Vedi l'anteprima" }));

describe("import (AC17-AC20)", () => {
  it("opens from the empty state in steps, with the privacy line", async () => {
    renderScreen();
    await openImport();
    expect(screen.getByRole("heading", { name: "Importa invitati" })).toBeTruthy();
    expect(screen.getByText(/Passo 1 di 3/)).toBeTruthy();
    expect(screen.getByText(/Il file resta nel tuo dispositivo/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scegli un file CSV" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scarica un modello" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Vedi l'anteprima" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("is in the Altro menu too, with Esporta CSV", async () => {
    renderScreen({ guests: [guest()] });
    await userEvent.click(screen.getByRole("button", { name: "Altro" }));
    expect(screen.getByRole("button", { name: "Importa" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Esporta CSV" })).toBeTruthy();
  });

  it("shows the preview as cards: errors first, warnings, new groups, counts; writes nothing", async () => {
    renderScreen({ guests: [guest({ firstName: "Mario", lastName: "Rossi" })] });
    await userEvent.click(screen.getByRole("button", { name: "Altro" }));
    await userEvent.click(screen.getByRole("button", { name: "Importa" }));
    await paste(
      "nome;cognome;tipo;gruppo\nMario;Rossi;;Famiglia Rossi\nLuca;Rossi;bambino;Famiglia Rossi\n;Bianchi;;\n",
    );
    await preview();
    expect(screen.getByText("Pronte 2 · Da correggere 1 · Avvisi 1")).toBeTruthy();
    expect(screen.getByText("Creo 1 gruppo: Famiglia Rossi.")).toBeTruthy();
    expect(screen.getByText(/Riga 4: manca il nome/)).toBeTruthy();
    expect(screen.getByText(/Riga 2: c'è già Mario Rossi/)).toBeTruthy();
    const cards = screen.getAllByTestId(/import-row-/);
    expect(cards[0]?.getAttribute("data-testid")).toBe("import-row-error");
    expect(mocks.importGuestsAction).not.toHaveBeenCalled();
    expect(screen.getByText(/1 riga da correggere viene saltata/)).toBeTruthy();
  });

  it("'Torna indietro' keeps the text; closing the sheet saves nothing", async () => {
    renderScreen();
    await openImport();
    await paste("Mario Rossi");
    await preview();
    await userEvent.click(screen.getByRole("button", { name: "Torna indietro" }));
    expect(
      (screen.getByRole("textbox", { name: "Una persona per riga" }) as HTMLTextAreaElement).value,
    ).toBe("Mario Rossi");
    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(screen.queryByRole("heading", { name: "Importa invitati" })).toBeNull();
    expect(mocks.importGuestsAction).not.toHaveBeenCalled();
  });

  it("explains an empty text and more than 500 rows", async () => {
    renderScreen();
    await openImport();
    await paste("   \n  \n");
    expect(
      (screen.getByRole("button", { name: "Vedi l'anteprima" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await userEvent.clear(screen.getByRole("textbox", { name: "Una persona per riga" }));
    await paste(Array.from({ length: 501 }, (_, i) => `Nome${i}`).join("\n"));
    await preview();
    expect(screen.getByRole("alert").textContent).toBe(
      "Sono più di 500 righe: importane al massimo 500 alla volta.",
    );
  });

  it("shows 100 cards at a time with 'Mostra altre'", async () => {
    renderScreen();
    await openImport();
    await paste(Array.from({ length: 150 }, (_, i) => `Persona${i}`).join("\n"));
    await preview();
    expect(screen.getAllByTestId("import-row-ready")).toHaveLength(100);
    await userEvent.click(screen.getByRole("button", { name: "Mostra altre 50 (ne restano 50)" }));
    expect(screen.getAllByTestId("import-row-ready")).toHaveLength(150);
  });

  it("imports the ready rows, closes, and offers 'Annulla importazione' for at least 8 s", async () => {
    mocks.importGuestsAction.mockResolvedValue(ok({ batchId: BATCH, guests: 2, groups: 1 }));
    mocks.undoGuestImportAction.mockResolvedValue({ ok: true, data: undefined });
    renderScreen();
    await openImport();
    await paste("Mario Rossi\nLuca Rossi");
    await preview();
    await userEvent.click(screen.getByRole("button", { name: "Importa 2 invitati" }));
    await waitFor(() => expect(mocks.importGuestsAction).toHaveBeenCalledTimes(1));
    expect(mocks.importGuestsAction.mock.calls[0]![0].rows).toHaveLength(2);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Importa invitati" })).toBeNull(),
    );
    const [message, options] = vi.mocked(toast).mock.calls.at(-1) as unknown as [
      string,
      { duration: number; description: string; action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe("2 invitati importati.");
    expect(options.description).toBe("Annulla importazione rimuove le 2 persone importate.");
    expect(options.duration).toBeGreaterThanOrEqual(8_000);
    expect(options.action.label).toBe("Annulla importazione");
    options.action.onClick();
    await waitFor(() =>
      expect(mocks.undoGuestImportAction).toHaveBeenCalledWith({ batchId: BATCH }),
    );
  });

  it("skips the rows with an error, lists them and copies them; 'Fine' then shows the toast", async () => {
    mocks.importGuestsAction.mockResolvedValue(ok({ batchId: BATCH, guests: 1, groups: 0 }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderScreen();
    await openImport();
    await paste("Mario Rossi\n;Bianchi;;");
    await preview();
    await userEvent.click(screen.getByRole("button", { name: "Importa 1 invitato" }));
    const done = await screen.findByTestId("import-done");
    expect(within(done).getByText(/1 invitato importato\. 1 riga saltata\./)).toBeTruthy();
    expect(within(done).getByText(/Riga 2: manca il nome/)).toBeTruthy();
    expect(mocks.importGuestsAction.mock.calls[0]![0].rows).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Copia le righe saltate" }));
    expect(writeText).toHaveBeenCalledWith(";Bianchi;;");
    expect(toast).toHaveBeenCalledWith("Righe copiate.");
    await userEvent.click(screen.getByRole("button", { name: "Fine" }));
    const last = vi.mocked(toast).mock.calls.at(-1) as unknown as [
      string,
      { action: { label: string } },
    ];
    expect(last[0]).toBe("1 invitato importato.");
    expect(last[1].action.label).toBe("Annulla importazione");
  });

  it("says 'Non ho importato nulla' with Riprova when saving fails, and keeps the preview", async () => {
    mocks.importGuestsAction.mockResolvedValueOnce({
      ok: false,
      code: "unknown",
      message: "Riprova tra un attimo.",
    });
    mocks.importGuestsAction.mockResolvedValueOnce(ok({ batchId: BATCH, guests: 1, groups: 0 }));
    renderScreen();
    await openImport();
    await paste("Mario Rossi");
    await preview();
    await userEvent.click(screen.getByRole("button", { name: "Importa 1 invitato" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Non ho importato nulla.");
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    await waitFor(() => expect(mocks.importGuestsAction).toHaveBeenCalledTimes(2));
  });

  it("reads a Windows-1252 file: 'Niccolò' stays correct", async () => {
    renderScreen();
    await openImport();
    // "Niccol" + 0xF2 (ò in Windows-1252, not valid UTF-8) + ";Rossi"
    const bytes = new Uint8Array([
      0x4e, 0x69, 0x63, 0x63, 0x6f, 0x6c, 0xf2, 0x3b, 0x52, 0x6f, 0x73, 0x73, 0x69,
    ]);
    const file = new File([bytes], "lista.csv", { type: "text/csv" });
    if (typeof file.arrayBuffer !== "function") {
      Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer });
    }
    await userEvent.upload(screen.getByLabelText("File CSV"), file);
    await waitFor(() =>
      expect(
        (screen.getByRole("textbox", { name: "Una persona per riga" }) as HTMLTextAreaElement)
          .value,
      ).toBe("Niccolò;Rossi"),
    );
  });

  it("refuses a file that is not text", async () => {
    renderScreen();
    await openImport();
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x00]);
    const file = new File([bytes], "foto.csv");
    if (typeof file.arrayBuffer !== "function") {
      Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer });
    }
    await userEvent.upload(screen.getByLabelText("File CSV"), file);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Non riesco a leggere il file. Salvalo come CSV (UTF-8) e riprova.",
    );
  });

  it("downloads a template with the columns and one example", async () => {
    renderScreen();
    await openImport();
    await userEvent.click(screen.getByRole("button", { name: "Scarica un modello" }));
    const [name, content] = mocks.downloadText.mock.calls[0] as [string, string];
    expect(name).toBe("modello-invitati.csv");
    expect(content).toContain("nome;cognome;tipo;lato;gruppo;telefono;email;note");
    expect(content).toContain("Mario;Rossi;adulto;entrambi;Famiglia Rossi");
  });
});

describe("Esporta CSV (AC21)", () => {
  const groups: GroupView[] = [{ id: "g1", name: "Famiglia Rossi", deletedAt: null, version: 1 }];

  it("says it exports everybody even with filters, and exports the live guests only", async () => {
    renderScreen({
      groups,
      guests: [
        guest({ firstName: "Mario", side: "A", groupId: "g1" }),
        guest({ firstName: "Luca", category: "child", side: "both" }),
        guest({ firstName: "Gone", deletedAt: "2026-11-01T10:00:00Z" }),
      ],
    });
    await userEvent.type(screen.getByRole("searchbox"), "Mario");
    await userEvent.click(screen.getByRole("button", { name: "Altro" }));
    expect(
      screen.getByText("Esporta tutti i 2 invitati, anche se hai dei filtri attivi."),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Esporta CSV" }));
    const [name, content, mime] = mocks.downloadText.mock.calls[0] as [string, string, string];
    expect(name).toMatch(/^roadmap2yes-invitati-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(mime).toBe("text/csv;charset=utf-8");
    expect(content.startsWith("﻿nome;cognome;tipo;lato;gruppo;telefono;email;note\r\n")).toBe(true);
    expect(content).toContain("Mario;Rossi;adulto;Tony;Famiglia Rossi");
    expect(content).toContain("Luca;Rossi;bambino;entrambi");
    expect(content).not.toContain("Gone");
  });

  it("is off, with the reason, when there is nobody to export", () => {
    const action = exportMenuAction([], [], PARTNERS);
    expect(action.disabled).toBe(true);
    expect(action.description).toBe("Nessun invitato da esportare.");
  });
});
