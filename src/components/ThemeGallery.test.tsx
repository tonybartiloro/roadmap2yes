// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEMES } from "@/themes/catalog";
import { ThemeGallery } from "./ThemeGallery";
import { ThemeProvider } from "./ThemeProvider";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

beforeEach(() => {
  document.documentElement.setAttribute("data-theme", "giardino");
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  window.localStorage.clear();
});
afterEach(() => cleanup());

function setup(onSave = vi.fn().mockResolvedValue({ ok: true })) {
  render(
    <ThemeProvider initialThemeId="giardino">
      <ThemeGallery onSave={onSave} />
    </ThemeProvider>,
  );
  return onSave;
}

describe("ThemeGallery", () => {
  it("is a radiogroup with the 12 approved themes and the saved one checked", () => {
    setup();
    expect(screen.getByRole("radiogroup", { name: "Tema" })).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(THEMES.length);
    expect(radios.filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /Giardino/ }).getAttribute("aria-checked")).toBe(
      "true",
    );
    // only the checked card is in the tab order (roving tabindex)
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });

  it("each card has a clean accessible name and no stray decorative text", () => {
    setup();
    for (const theme of THEMES) {
      const radio = screen.getByRole("radio", { name: `${theme.name}: ${theme.mood}` });
      expect(radio.textContent).not.toContain("Pulsante");
    }
    expect(screen.getByRole("radiogroup").textContent).not.toContain("Pulsante");
  });

  it("each card carries its own theme and mode", () => {
    setup();
    const sera = screen.getByRole("radio", { name: /Sera/ });
    expect(sera.getAttribute("data-theme")).toBe("sera");
    expect(sera.getAttribute("data-mode")).toBe("light");
  });

  it("arrow keys move the selection and apply the theme provisionally", async () => {
    const user = userEvent.setup();
    setup();
    screen.getByRole("radio", { name: /Giardino/ }).focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(document.documentElement.getAttribute("data-theme")).toBe("sera"));
    expect(screen.getByRole("radio", { name: /Sera/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/Nulla è salvato/)).toBeTruthy();
  });

  it("Annulla restores the saved theme without saving", async () => {
    const user = userEvent.setup();
    const onSave = setup();
    await user.click(screen.getByRole("radio", { name: /Boho/ }));
    await waitFor(() => expect(document.documentElement.getAttribute("data-theme")).toBe("boho"));
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("giardino");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("'Usa questo tema' saves, sets the cookie (id only) and keeps the theme", async () => {
    const user = userEvent.setup();
    const onSave = setup();
    await user.click(screen.getByRole("radio", { name: /Velluto/ }));
    await waitFor(() => screen.getByRole("button", { name: "Usa questo tema" }));
    await user.click(screen.getByRole("button", { name: "Usa questo tema" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("velluto"));
    await waitFor(() => expect(document.cookie).toContain("r2y-theme=velluto"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("velluto");
    expect(screen.queryByRole("button", { name: "Usa questo tema" })).toBeNull();
  });

  it("a failed save keeps the preview and says so", async () => {
    const user = userEvent.setup();
    setup(vi.fn().mockResolvedValue({ ok: false }));
    await user.click(screen.getByRole("radio", { name: /Amalfi/ }));
    await waitFor(() => screen.getByRole("button", { name: "Usa questo tema" }));
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Usa questo tema" }));
    });
    expect(screen.getByRole("alert").textContent).toContain("Non sono riuscito a salvare il tema");
    expect(screen.getByRole("button", { name: "Usa questo tema" })).toBeTruthy();
  });

  it("the mode switch persists the per-device preference", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Scuro" }));
    expect(window.localStorage.getItem("r2y-mode")).toBe("dark");
    expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
  });
});
