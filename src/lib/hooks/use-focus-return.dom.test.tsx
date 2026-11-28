// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFocusReturn } from "./use-focus-return";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

/** An AlertDialog opened from state (no Radix Trigger), like the guests ConfirmDialog. */
function Harness({
  removeOpener = false,
  fallbackLabels,
}: {
  removeOpener?: boolean;
  fallbackLabels?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [openerShown, setOpenerShown] = useState(true);
  const returnFocus = useFocusReturn(open, fallbackLabels);
  return (
    <>
      <button type="button">Prima</button>
      {openerShown ? (
        <button type="button" onClick={() => setOpen(true)}>
          Apri
        </button>
      ) : null}
      <button type="button" aria-label="Menu">
        …
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent onCloseAutoFocus={returnFocus}>
          <AlertDialogTitle>Sicuro?</AlertDialogTitle>
          <AlertDialogDescription>Prova</AlertDialogDescription>
          <AlertDialogCancel onClick={() => removeOpener && setOpenerShown(false)}>
            Annulla
          </AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Radix sends the close focus in a `setTimeout(0)`. */
async function closeWith(name: string) {
  await userEvent.click(screen.getByRole("button", { name }));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => cleanup());

describe("useFocusReturn", () => {
  it("gives the focus back to the control that opened the dialog", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Apri" }));
    expect(document.activeElement?.textContent).toBe("Annulla");
    await closeWith("Annulla");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Apri" })),
    );
  });

  it("falls back to the first labelled button still on the page when the opener is gone", async () => {
    render(<Harness removeOpener fallbackLabels={["Non c'è", "Menu"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Apri" }));
    await closeWith("Annulla");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Menu" })),
    );
  });

  it("falls back to the dialog the opener sat in when the opener is gone", () => {
    const sheet = document.createElement("div");
    sheet.setAttribute("role", "dialog");
    sheet.tabIndex = -1;
    const opener = document.createElement("button");
    sheet.append(opener);
    document.body.append(sheet);
    opener.focus();

    const { result, rerender } = renderHook(({ open }) => useFocusReturn(open), {
      initialProps: { open: false },
    });
    rerender({ open: true });
    opener.remove();
    const event = new Event("focus-return", { cancelable: true });
    result.current(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(sheet);
    sheet.remove();
  });

  it("leaves Radix's default alone when nothing to return to is left", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const { result, rerender } = renderHook(({ open }) => useFocusReturn(open, ["Assente"]), {
      initialProps: { open: false },
    });
    rerender({ open: true });
    opener.remove();
    const event = new Event("focus-return", { cancelable: true });
    result.current(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
