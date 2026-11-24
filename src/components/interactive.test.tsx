// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessCodeField, DEFAULT_POLICY_CHECKS } from "./AccessCodeField";
import { AppNav, isActivePath } from "./AppNav";
import { ConflictDialog, diffFields } from "./ConflictDialog";
import { DateField } from "./DateField";
import { EmailOffBanner, EmailStatusProvider } from "./EmailOffBanner";
import { MoneyInput } from "./MoneyInput";
import { MonthYearField } from "./MonthYearField";
import { OfflineBanner } from "./OfflineBanner";
import { ServiceDownPage } from "./ServiceDownPage";

vi.mock("next/navigation", () => ({ usePathname: () => "/percorso/oggi" }));
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => cleanup());

describe("MoneyInput", () => {
  function Harness({ error }: { error?: string }) {
    const [text, setText] = useState("");
    return (
      <MoneyInput
        label="Importo"
        value={text}

        error={error}
        onValueChange={(t) => setText(t)}
      />
    );
  }

  it("is a labelled decimal-keyboard text field", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Importo");
    expect(input.getAttribute("inputmode")).toBe("decimal");
    expect(input.getAttribute("type")).toBe("text");
  });

  it("reports cents through onValueChange and shows the error only after blur", async () => {
    const onValueChange = vi.fn();
    render(<MoneyInput label="Importo" value="" onValueChange={onValueChange} />);
    const input = screen.getByLabelText("Importo");
    fireEvent.change(input, { target: { value: "1.500,00" } });
    expect(onValueChange).toHaveBeenLastCalledWith("1.500,00", 150000);
    fireEvent.change(input, { target: { value: "abc" } });
    expect(onValueChange).toHaveBeenLastCalledWith("abc", null);
  });

  it("rewrites a valid amount in canonical form on blur", () => {
    const onValueChange = vi.fn();
    render(<MoneyInput label="Importo" value="1.5" onValueChange={onValueChange} />);
    fireEvent.blur(screen.getByLabelText("Importo"));
    expect(onValueChange).toHaveBeenLastCalledWith("1,50", 150);
  });

  it("shows the format error with aria-describedby after blur", () => {
    render(<MoneyInput label="Importo" value="abc" onValueChange={() => {}} />);
    const input = screen.getByLabelText("Importo");
    expect(screen.queryByText(/Inserisci un importo/)).toBeNull();
    fireEvent.blur(input);
    const message = screen.getByText("Inserisci un importo in euro, ad esempio 1.500,00");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(message.id);
  });
});

describe("AccessCodeField", () => {
  it("is password-manager friendly and lets you paste (no paste handler)", () => {
    render(<AccessCodeField label="Codice" value="" onChange={() => {}} />);
    const input = screen.getByLabelText("Codice") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.autocomplete).toBe("new-password");
    expect(input.name).toBe("accessCode");
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    input.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(false);
  });

  it("uses current-password and no policy hints when typing an existing code", () => {
    render(<AccessCodeField label="Codice" value="" mode="current" onChange={() => {}} />);
    expect((screen.getByLabelText("Codice") as HTMLInputElement).autocomplete).toBe(
      "current-password",
    );
    expect(screen.queryByText("Almeno 10 caratteri")).toBeNull();
    expect(screen.queryByRole("button", { name: "Genera" })).toBeNull();
  });

  it("toggles visibility", async () => {
    const user = userEvent.setup();
    render(<AccessCodeField label="Codice" value="abc" onChange={() => {}} />);
    const input = screen.getByLabelText("Codice") as HTMLInputElement;
    await user.click(screen.getByRole("button", { name: "Mostra il codice" }));
    expect(input.type).toBe("text");
    expect(
      screen.getByRole("button", { name: "Nascondi il codice" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("states which policy rule is met, in text", () => {
    const { rerender } = render(<AccessCodeField label="Codice" value="abc" onChange={() => {}} />);
    expect(screen.getAllByText(/non ancora/)).toHaveLength(2);
    rerender(<AccessCodeField label="Codice" value="abcdefghi1" onChange={() => {}} />);
    expect(screen.queryAllByText(/non ancora/)).toHaveLength(0);
  });

  it("Genera produces a code that satisfies the policy and reveals it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AccessCodeField label="Codice" value="" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Genera" }));
    const code = onChange.mock.calls[0]?.[0] as string;
    expect(DEFAULT_POLICY_CHECKS.every((check) => check.test(code))).toBe(true);
    expect((screen.getByLabelText("Codice") as HTMLInputElement).type).toBe("text");
  });

  it("shows the weak-code message from lib/access-code once the basic rules hold", () => {
    render(<AccessCodeField label="Codice" value="password123" onChange={() => {}} />);
    expect(screen.getByRole("status").textContent).toMatch(/\S/);
  });

  it("warns when the code contains the person's name", () => {
    render(
      <AccessCodeField
        label="Codice"
        value="tonyxk29qw7"
        subject={{ firstName: "Tony" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("status")).toBeTruthy();
  });
});

describe("ConflictDialog", () => {
  const labels = { title: "Titolo", dueDate: "Scadenza", assignee: "Chi se ne occupa" };
  const mine = {
    title: "Prenotare la location",
    dueDate: "2026-12-01",
    assignee: "both",
    version: 3,
  };
  const theirs = {
    title: "Prenotare la location",
    dueDate: "2026-12-10",
    assignee: "jessica",
    version: 4,
  };
  const now = new Date("2026-11-24T12:02:00Z");
  const changedAt = new Date("2026-11-24T12:00:00Z");

  it("diffFields keeps only labelled fields that differ", () => {
    expect(diffFields(labels, mine, theirs).map((row) => row.field)).toEqual([
      "dueDate",
      "assignee",
    ]);
  });

  function setup(overrides: Partial<React.ComponentProps<typeof ConflictDialog>> = {}) {
    const onForceSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConflictDialog
        open
        partnerName="Jessica"
        changedAt={changedAt}
        now={now}
        labels={labels}
        mine={mine}
        theirs={theirs}
        onForceSave={onForceSave}
        onCancel={onCancel}
        {...overrides}
      />,
    );
    return { onForceSave, onCancel };
  }

  it("names the partner and the elapsed time and offers the three actions", () => {
    setup();
    expect(screen.getByText("Jessica ha modificato questo elemento 2 minuti fa")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Vedi cosa è cambiato" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salva comunque" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Annulla" })).toBeTruthy();
  });

  it("expands the table with Tu / partner columns and the labels", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByRole("table")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Vedi cosa è cambiato" }));
    const table = screen.getByRole("table");
    expect(table.textContent).toContain("Scadenza");
    expect(table.textContent).toContain("2026-12-10");
    expect(screen.getByRole("columnheader", { name: "Tu" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Jessica" })).toBeTruthy();
    expect(table.textContent).not.toContain("version");
  });

  it("Salva comunque and Annulla call their handlers; Escape means Annulla", async () => {
    const user = userEvent.setup();
    const { onForceSave, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: "Salva comunque" }));
    expect(onForceSave).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(onForceSave).toHaveBeenCalledTimes(1);
  });
});

describe("OfflineBanner and EmailOffBanner", () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  });

  it("appears when the browser goes offline and disappears when it is back", async () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => {
      Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status").textContent).toContain(
      "Sei offline. Le modifiche non sono ancora salvate.",
    );
    await act(async () => {
      Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("EmailOffBanner shows only when emails are off", () => {
    const { rerender } = render(
      <EmailStatusProvider emailEnabled={false}>
        <EmailOffBanner />
      </EmailStatusProvider>,
    );
    expect(screen.getByText(/Le email sono spente/)).toBeTruthy();
    rerender(
      <EmailStatusProvider emailEnabled>
        <EmailOffBanner />
      </EmailStatusProvider>,
    );
    expect(screen.queryByText(/Le email sono spente/)).toBeNull();
  });
});

describe("ServiceDownPage", () => {
  it("has two distinct pages with distinct texts and no automatic wake-up promise", () => {
    const { unmount } = render(<ServiceDownPage reason="paused" />);
    expect(screen.getByRole("alert").textContent).toBe("L'app è in pausa.");
    expect(screen.getByText(/non riparte da solo/)).toBeTruthy();
    expect(screen.getByText("Per chi gestisce l'app")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeTruthy();
    unmount();
    render(<ServiceDownPage reason="unreachable" />);
    expect(screen.getByRole("alert").textContent).toBe("Non riesco a raggiungere il servizio.");
    expect(screen.queryByText("Per chi gestisce l'app")).toBeNull();
    expect(document.body.textContent).not.toMatch(/svegli/i);
  });

  it("says it is still paused after a failed retry", async () => {
    window.sessionStorage.setItem("r2y-service-retry", `paused:${Date.now()}`);
    render(<ServiceDownPage reason="paused" />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("È ancora in pausa."));
  });
});

describe("AppNav", () => {
  it("lists the five sections and marks the current one", () => {
    render(<AppNav />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Home",
      "Percorso",
      "Scelte",
      "Budget",
      "Altro",
    ]);
    expect(screen.getByRole("navigation", { name: "Principale" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Percorso" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBeNull();
  });

  it("matches paths by section", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/percorso", "/")).toBe(false);
    expect(isActivePath("/budget/categoria/1", "/budget")).toBe(true);
    expect(isActivePath("/budgetx", "/budget")).toBe(false);
  });
});

describe("DateField", () => {
  it("is a labelled native date input with a non-blocking warning before the soft minimum", () => {
    render(
      <DateField
        label="Data"
        value="2027-08-01"
        onChange={() => {}}
        softMin="2027-09-03"
        softMinMessage="È prima della data che desideravate: ricontrolla con la location."
      />,
    );
    const input = screen.getByLabelText("Data") as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(screen.getByText(/ricontrolla con la location/)).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("emits YYYY-MM-DD", () => {
    const onChange = vi.fn();
    render(<DateField label="Data" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2028-05-14" } });
    expect(onChange).toHaveBeenCalledWith("2028-05-14");
  });
});

describe("MonthYearField", () => {
  it("renders a labelled group with month and year selects", () => {
    render(
      <MonthYearField
        legend="Da quando"
        value={{ year: 2028, month: 5 }}
        onChange={() => {}}
        minYear={2027}
        maxYear={2029}
      />,
    );
    expect(screen.getByRole("group", { name: "Da quando" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Mese" }).textContent).toBe("maggio");
    expect(screen.getByRole("combobox", { name: "Anno" }).textContent).toBe("2028");
  });
});
