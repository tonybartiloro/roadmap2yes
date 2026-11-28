// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "./sonner";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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

afterEach(() => {
  act(() => toast.dismiss());
  cleanup();
});

describe("Toaster", () => {
  it("draws action and cancel buttons as 44 x 44 px touch targets with the app focus outline (DES-54)", async () => {
    render(<Toaster />);
    act(() => {
      toast("Persona eliminata", {
        action: { label: "Annulla", onClick: () => {} },
        cancel: { label: "Chiudi", onClick: () => {} },
      });
    });
    for (const name of ["Annulla", "Chiudi"]) {
      const button = await screen.findByRole("button", { name });
      // Sonner's own rule is `height: 24px; font-size: 12px` on an attribute selector: ours must win.
      expect(button.className).toContain("h-11!");
      expect(button.className).toContain("min-w-11!");
      expect(button.className).toContain("text-sm!");
      expect(button.className).toContain("focus-visible:outline-ring!");
    }
  });
});
