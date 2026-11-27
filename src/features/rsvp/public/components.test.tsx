// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RsvpForm, type RsvpAction } from "./RsvpForm";
import { LinkUnavailable } from "./LinkUnavailable";
import { coupleTitle, dateText, locationText } from "./format";
import type { Person, RsvpFormState } from "./state";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
afterEach(() => cleanup());

const person = (id: string, first: string, extra: Partial<Person> = {}): Person => ({
  id,
  first_name: first,
  last_name: "Rossi",
  category: "adult",
  status: null,
  diet: [],
  diet_note: null,
  answered_at: null,
  ...extra,
});
const MARIO = person("00000000-0000-4000-8000-000000000001", "Mario");
const ANNA = person("00000000-0000-4000-8000-000000000002", "Anna");
const LUCA = person("00000000-0000-4000-8000-000000000003", "Luca", { category: "child" });

function setup(action: RsvpAction, people: Person[] = [MARIO, ANNA, LUCA]) {
  return render(
    <RsvpForm
      action={action}
      couple={["Giulia", "Marco"]}
      dateLabel="sabato 3 settembre 2027"
      locationLabel="Villa Aurora, Tivoli"
      people={people}
    />,
  );
}
const never: RsvpAction = async () => ({ status: "idle" });

describe("RsvpForm (with JavaScript)", () => {
  it("shows the couple, the privacy note and one card per person with the child tagged", () => {
    setup(never);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Giulia e Marco si sposano");
    expect(screen.getByText("sabato 3 settembre 2027")).toBeTruthy();
    expect(screen.getByRole("group", { name: /Luca Rossi · Bambino/ })).toBeTruthy();
    expect(screen.getByText(/Le risposte le vedono solo Giulia e Marco/)).toBeTruthy();
    expect(screen.getByText(/Manca qualcuno/)).toBeTruthy();
    expect(screen.getByText("Dicci chi di voi viene.")).toBeTruthy();
  });

  it("'Vengono tutti' answers yes for everyone, the counter follows, preferences appear only after yes", async () => {
    const user = userEvent.setup();
    setup(never);
    expect(screen.getByText("Hai scelto per 0 di 3 persone")).toBeTruthy();
    expect(screen.queryByText("Vegetariano")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Vengono tutti" }));
    expect(screen.getByText("Hai scelto per 3 di 3 persone")).toBeTruthy();
    expect(screen.getAllByLabelText("Vegetariano")).toHaveLength(3);
    // No hides and clears the preferences (BR11).
    const luca = screen.getByRole("group", { name: /Luca Rossi/ });
    await user.click(luca.querySelectorAll<HTMLInputElement>("input[value=no]")[0]!);
    expect(screen.getAllByLabelText("Vegetariano")).toHaveLength(2);
  });

  it("submits through the action, then shows the saved state with the thanks and 'Modifica'", async () => {
    const user = userEvent.setup();
    const saved: RsvpFormState = {
      status: "saved",
      people: [
        { ...MARIO, status: "yes", diet: ["vegetarian"], answered_at: "2027-03-10T10:00:00+00:00" },
        { ...ANNA, status: "no", answered_at: "2027-03-10T10:00:00+00:00" },
        LUCA,
      ],
      changed: [ANNA.id],
    };
    const action = vi.fn<RsvpAction>(async () => saved);
    setup(action);
    await user.click(screen.getAllByLabelText("Sì, ci sono")[0]!);
    await user.click(screen.getByRole("button", { name: "Invia le risposte" }));
    await waitFor(() =>
      expect(screen.getByText("Grazie! Abbiamo ricevuto le risposte")).toBeTruthy(),
    );
    expect(action).toHaveBeenCalledTimes(1);
    const sent = action.mock.calls[0]![1];
    expect(sent.getAll("p")).toHaveLength(3);
    expect(sent.get(`status:${MARIO.id}`)).toBe("yes");
    expect(screen.getByText(/Mario Rossi:/).textContent).toContain("Sì, vegetariano");
    expect(screen.getByText(/Luca Rossi:/).textContent).toContain("In attesa");
    expect(screen.getByTestId("rsvp-changed").textContent).toBe(
      "Le risposte di Anna Rossi erano già cambiate: ecco quelle salvate.",
    );
    expect(screen.getByText("Modifica")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByTestId("rsvp-summary"));
  });

  it("keeps the choices and shows the message when the server says no", async () => {
    const user = userEvent.setup();
    setup(async () => ({ status: "error", kind: "blocked", values: {} }));
    await user.click(screen.getAllByLabelText("Sì, ci sono")[1]!);
    await user.click(screen.getByRole("button", { name: "Invia le risposte" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Troppi tentativi: riprova tra 15 minuti",
    );
    expect((screen.getAllByLabelText("Sì, ci sono")[1] as HTMLInputElement).checked).toBe(true);
  });

  it("catches a network error, keeps the choices and re-enables the button", async () => {
    const user = userEvent.setup();
    setup(async () => {
      throw new Error("offline");
    });
    await user.click(screen.getAllByLabelText("No, non posso")[0]!);
    await user.click(screen.getByRole("button", { name: "Invia le risposte" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Non sono riuscito a salvare. Controlla la connessione e riprova.",
    );
    expect((screen.getAllByLabelText("No, non posso")[0] as HTMLInputElement).checked).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Invia le risposte" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("replaces the whole page, names included, when the link stops working", async () => {
    const user = userEvent.setup();
    setup(async () => ({ status: "unavailable" }));
    await user.click(screen.getAllByLabelText("Sì, ci sono")[0]!);
    await user.click(screen.getByRole("button", { name: "Invia le risposte" }));
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe(
      "Questo link non funziona più",
    );
    expect(document.body.textContent).not.toMatch(/Giulia|Marco|Mario/);
  });

  it("opens on the summary with 'Modifica' when answers exist, and says 'Dicci se ci sei' for one person", () => {
    setup(never, [{ ...MARIO, status: "no", answered_at: "2027-03-10T10:00:00+00:00" }]);
    expect(screen.queryByText("Grazie! Abbiamo ricevuto le risposte")).toBeNull();
    expect(screen.getByText("Modifica").tagName).toBe("SUMMARY");
    expect(screen.getByText("Dicci se ci sei.")).toBeTruthy();
    expect(screen.queryByText("Vengono tutti")).toBeNull();
  });

  it("stores nothing on the device", async () => {
    const user = userEvent.setup();
    const set = vi.spyOn(Storage.prototype, "setItem");
    setup(never);
    await user.click(screen.getAllByLabelText("Sì, ci sono")[0]!);
    expect(set).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
  });
});

describe("RsvpForm (server render, no JavaScript)", () => {
  it("renders native radios, always-visible preferences labelled 'Solo se vieni', no JS-only controls", () => {
    const html = renderToString(
      <RsvpForm
        action={never}
        couple={["Giulia", "Marco"]}
        dateLabel="Data da confermare"
        locationLabel="Luogo da confermare"
        people={[MARIO, ANNA]}
      />,
    );
    expect(html).toContain('type="radio"');
    expect(html).toContain("Solo se vieni");
    expect(html).toContain("Vegetariano");
    expect(html).toContain("Puoi rispondere adesso e cambiare quando vuoi.");
    expect(html).not.toContain("Vengono tutti");
    expect(html).not.toContain("Hai scelto per");
  });

  it("puts the summary and the form in a <details> whose summary is 'Modifica'", () => {
    const html = renderToString(
      <RsvpForm
        action={never}
        couple={["Giulia", "Marco"]}
        dateLabel="x"
        locationLabel="y"
        people={[{ ...MARIO, status: "yes", answered_at: "2027-03-10T10:00:00+00:00" }, ANNA]}
      />,
    );
    expect(html).toMatch(/<details[^>]*>\s*<summary[^>]*>Modifica<\/summary>/);
    expect(html).toMatch(/Mario Rossi(<!-- -->)?: /);
  });
});

describe("LinkUnavailable and format", () => {
  it("is the neutral text with no button or link", () => {
    render(<LinkUnavailable />);
    expect(screen.getByText("Se pensi sia un errore, scrivi a chi ti ha invitato.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("formats date, location and title with the 'da confermare' fallbacks", () => {
    expect(dateText("2027-09-04")).toBe("sabato 4 settembre 2027");
    expect(dateText(null)).toBe("Data da confermare");
    expect(locationText({ name: "Villa Aurora", comune: "Tivoli" })).toBe("Villa Aurora, Tivoli");
    expect(locationText({ name: "Villa Aurora", comune: null })).toBe("Villa Aurora");
    expect(locationText(null)).toBe("Luogo da confermare");
    expect(coupleTitle(["A", null])).toBe("A si sposa");
    expect(coupleTitle([null, null])).toBe("Un matrimonio");
  });
});
