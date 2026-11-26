// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportFileNames } from "@/domain/export";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const mocks = vi.hoisted(() => ({ prepareExportAction: vi.fn(), downloadText: vi.fn() }));
vi.mock("./actions", () => ({ prepareExportAction: mocks.prepareExportAction }));
vi.mock("./download", () => ({ downloadText: mocks.downloadText }));

import { ExportPanel } from "./ExportPanel";

const fileNames = exportFileNames("2026-11-24");
const bundle = { fileNames, json: "{}", tasksCsv: "t", budgetCsv: "b", guestsCsv: "g" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ExportPanel", () => {
  it("lists the four files with the date in their names", () => {
    render(<ExportPanel fileNames={fileNames} />);
    expect(screen.getByText("roadmap2yes-2026-11-24.json")).toBeTruthy();
    expect(screen.getByText("roadmap2yes-compiti-2026-11-24.csv")).toBeTruthy();
    expect(screen.getByText("roadmap2yes-budget-2026-11-24.csv")).toBeTruthy();
    expect(screen.getByText("roadmap2yes-invitati-2026-11-24.csv")).toBeTruthy();
  });

  it("the guests button says plainly that it exports everyone, filters or not (AC21)", async () => {
    mocks.prepareExportAction.mockResolvedValue({ ok: true, bundle });
    const user = userEvent.setup();
    render(<ExportPanel fileNames={fileNames} />);
    expect(screen.getByText(/tutti gli invitati, anche se hai dei filtri attivi/)).toBeTruthy();
    await user.click(screen.getByTestId("export-guestsCsv"));
    await waitFor(() => expect(mocks.downloadText).toHaveBeenCalledTimes(1));
    expect(mocks.downloadText).toHaveBeenCalledWith(
      "roadmap2yes-invitati-2026-11-24.csv",
      "g",
      expect.stringContaining("text/csv"),
    );
  });

  it("downloads only the file asked for, then says it is ready", async () => {
    mocks.prepareExportAction.mockResolvedValue({ ok: true, bundle });
    const user = userEvent.setup();
    render(<ExportPanel fileNames={fileNames} />);
    await user.click(screen.getByTestId("export-tasksCsv"));
    await waitFor(() => expect(mocks.downloadText).toHaveBeenCalledTimes(1));
    expect(mocks.downloadText).toHaveBeenCalledWith(
      "roadmap2yes-compiti-2026-11-24.csv",
      "t",
      expect.stringContaining("text/csv"),
    );
    expect(screen.getByText("File pronto: roadmap2yes-compiti-2026-11-24.csv")).toBeTruthy();
  });

  it("shows a progress bar with text while it works", async () => {
    let finish: (value: unknown) => void = () => undefined;
    mocks.prepareExportAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<ExportPanel fileNames={fileNames} />);
    await user.click(screen.getByTestId("export-json"));
    const bar = await screen.findByRole("progressbar", { name: "Avanzamento dell'esportazione" });
    expect(bar.getAttribute("aria-valuenow")).toBe("15");
    expect(screen.getByText("Raccolgo i dati del matrimonio…")).toBeTruthy();
    expect((screen.getByTestId("export-json") as HTMLButtonElement).disabled).toBe(true);
    finish({ ok: true, bundle });
    await waitFor(() => expect(screen.getByText(/File pronto/)).toBeTruthy());
  });

  it("says so when the file cannot be prepared and downloads nothing", async () => {
    mocks.prepareExportAction.mockResolvedValue({
      ok: false,
      code: "unknown",
      message: "Non riesco a preparare il file. Riprova.",
    });
    const user = userEvent.setup();
    render(<ExportPanel fileNames={fileNames} />);
    await user.click(screen.getByTestId("export-budgetCsv"));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Non riesco a preparare il file. Riprova.",
    );
    expect(mocks.downloadText).not.toHaveBeenCalled();
  });
});
