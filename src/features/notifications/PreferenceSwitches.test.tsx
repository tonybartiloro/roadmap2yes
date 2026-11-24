// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const mocks = vi.hoisted(() => ({
  setPreferenceAction: vi.fn(),
  error: vi.fn(),
}));
vi.mock("./actions", () => ({ setPreferenceAction: mocks.setPreferenceAction }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));

import { PreferenceSwitches } from "./PreferenceSwitches";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PreferenceSwitches", () => {
  it("shows both switches with their saved state and the note on mandatory emails", () => {
    render(<PreferenceSwitches initial={{ reminders: true, digest: false }} />);
    expect(
      screen
        .getByRole("switch", { name: "Promemoria delle scadenze" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("switch", { name: "Riepilogo del lunedì" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen.getByText("Le email di accesso e di invito non si possono disattivare."),
    ).toBeTruthy();
  });

  it("saves one switch at a time", async () => {
    mocks.setPreferenceAction.mockResolvedValue({
      ok: true,
      preferences: { reminders: false, digest: true },
    });
    const user = userEvent.setup();
    render(<PreferenceSwitches initial={{ reminders: true, digest: true }} />);
    await user.click(screen.getByRole("switch", { name: "Promemoria delle scadenze" }));
    expect(mocks.setPreferenceAction).toHaveBeenCalledWith({ kind: "reminders", enabled: false });
    await waitFor(() =>
      expect(
        screen
          .getByRole("switch", { name: "Promemoria delle scadenze" })
          .getAttribute("aria-checked"),
      ).toBe("false"),
    );
    expect(
      screen.getByRole("switch", { name: "Riepilogo del lunedì" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("puts the switch back and says so when saving fails", async () => {
    mocks.setPreferenceAction.mockResolvedValue({
      ok: false,
      code: "unknown",
      message: "Non sono riuscito a salvare.",
    });
    const user = userEvent.setup();
    render(<PreferenceSwitches initial={{ reminders: true, digest: true }} />);
    await user.click(screen.getByRole("switch", { name: "Riepilogo del lunedì" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Non sono riuscito a salvare."));
    expect(
      screen.getByRole("switch", { name: "Riepilogo del lunedì" }).getAttribute("aria-checked"),
    ).toBe("true");
  });
});
