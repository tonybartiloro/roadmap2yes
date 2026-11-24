// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfilePerson, SettingsView } from "./data";

const mocks = vi.hoisted(() => ({
  saveSettingsAction: vi.fn(),
  savePersonAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("./actions", () => ({
  saveSettingsAction: mocks.saveSettingsAction,
  savePersonAction: mocks.savePersonAction,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/features/budget/actions", () => ({ setTotalAction: vi.fn() }));
vi.mock("@/features/invitations/actions", () => ({
  changePendingEmailAction: vi.fn(),
  createPartnerWithCodeAction: vi.fn(),
  inviteByEmailAction: vi.fn(),
  resendInviteAction: vi.fn(),
  revokeInviteAction: vi.fn(),
  setTemporaryCodeAction: vi.fn(),
}));
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { ProfilesView } from "./ProfilesView";
import { SettingsForm } from "./SettingsForm";

const person = (overrides: Partial<ProfilePerson>): ProfilePerson => ({
  id: "p-a",
  version: 2,
  slot: "A",
  email: "anna@example.test",
  firstName: "Anna",
  lastName: null,
  label: "sposa",
  joined: true,
  isMe: true,
  ...overrides,
});

const view: SettingsView = {
  weddingId: "w1",
  version: 4,
  completed: true,
  rite: "civile",
  guestBand: "50_80",
  styleLabel: "Boho",
  styleNote: null,
  region: "Toscana",
  comune: "Lucca",
  budgetCents: 2_000_000,
  scenarios: [
    {
      id: "s1",
      title: "Prima scelta",
      kind: "fixed",
      dateFrom: "2027-09-03",
      dateTo: null,
      status: "candidate",
      locationName: "Villa Rossi",
    },
  ],
  unknown: [],
  partnerName: "Luca",
};

beforeEach(() => {
  window.localStorage.clear();
  mocks.saveSettingsAction.mockReset();
  mocks.savePersonAction.mockReset();
  mocks.refresh.mockReset();
});
afterEach(() => cleanup());

describe("Profili (AC46, AC58)", () => {
  it("your email is read-only and points to the account page; no date of birth", async () => {
    render(
      <ProfilesView
        view={{
          me: person({}),
          other: person({
            id: "p-b",
            slot: "B",
            isMe: false,
            email: "luca@example.test",
            firstName: "Luca",
            label: "sposo",
            joined: true,
          }),
        }}
        scope="u:p"
      />,
    );
    const emails = (await screen.findAllByLabelText("Email")) as HTMLInputElement[];
    expect(emails).toHaveLength(2);
    expect(emails.every((input) => input.readOnly)).toBe(true);
    expect(screen.getByTestId("profile-account-link").getAttribute("href")).toBe("/altro/account");
    expect(screen.getByText("L'email è il tuo accesso.")).toBeTruthy();
    expect(screen.getByText(/gestisce la propria email da sé/)).toBeTruthy();
    // A partner who has entered: no way to change their email here.
    expect(screen.queryByTestId("profile-partner-email-section")).toBeNull();
    expect(screen.queryByText(/nascita/i)).toBeNull();
  });

  it("the email of a partner who has not entered yet can be changed", async () => {
    render(
      <ProfilesView
        view={{
          me: person({}),
          other: person({
            id: "p-b",
            slot: "B",
            isMe: false,
            email: "luca@example.test",
            firstName: null,
            label: null,
            joined: false,
          }),
        }}
        scope="u:p"
      />,
    );
    expect(await screen.findByTestId("profile-partner-email-section")).toBeTruthy();
    expect(screen.getByTestId("profile-email-form")).toBeTruthy();
    expect(screen.getByLabelText("Nuova email")).toBeTruthy();
  });

  it("saves the person with the version being edited", async () => {
    mocks.savePersonAction.mockResolvedValue({ ok: true, data: { version: 3 } });
    render(<ProfilesView view={{ me: person({}), other: null }} scope="u:p" />);
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: "Annalisa" } });
    fireEvent.click(screen.getByTestId("profile-me-save"));
    await waitFor(() => expect(mocks.savePersonAction).toHaveBeenCalled());
    expect(mocks.savePersonAction).toHaveBeenCalledWith({
      partnerId: "p-a",
      version: 2,
      firstName: "Annalisa",
      lastName: null,
      label: "sposa",
    });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("without a partner it invites you to add one", async () => {
    render(<ProfilesView view={{ me: person({}), other: null }} scope="u:p" />);
    expect(await screen.findByText("Il tuo partner non c'è ancora")).toBeTruthy();
  });
});

describe("Impostazioni nozze (AC16, AC48)", () => {
  it("shows the answers, the dates with their location, and the way to Scelte", async () => {
    render(<SettingsForm view={view} scope="u:w" />);
    expect(await screen.findByTestId("settings-form")).toBeTruthy();
    expect(screen.getByText("Prima scelta")).toBeTruthy();
    expect(screen.getByText(/Villa Rossi/)).toBeTruthy();
    expect(
      screen.getByText("Aggiungi, cambia o scegli le date in Scelte").getAttribute("href"),
    ).toBe("/scelte/date");
    expect(screen.getByText(/Ora è/).textContent).toContain("20.000");
  });

  it("saving a changed rite sends the version and points to the suggestions in Percorso", async () => {
    mocks.saveSettingsAction.mockResolvedValue({ ok: true, data: { version: 5 } });
    render(<SettingsForm view={view} scope="u:w" />);
    const rite = await screen.findByTestId("settings-rite");
    fireEvent.click(rite.querySelector('[value="religioso"]')!);
    fireEvent.click(screen.getByTestId("settings-save"));
    await waitFor(() => expect(mocks.saveSettingsAction).toHaveBeenCalled());
    expect(mocks.saveSettingsAction).toHaveBeenCalledWith({
      version: 4,
      rite: "religioso",
      guestBand: "50_80",
      styleLabel: "Boho",
      styleNote: "",
      region: "Toscana",
      comune: "Lucca",
    });
    const note = await screen.findByTestId("settings-rite-note");
    expect(note.querySelector("a")?.getAttribute("href")).toBe("/percorso");
  });

  it("a conflict opens the dialog and nothing is claimed as saved", async () => {
    mocks.saveSettingsAction.mockResolvedValue({
      ok: false,
      code: "conflict",
      message: "x",
      conflict: {
        current: { rite: "simbolico", comune: "Pisa", version: 9 },
        changedByName: "Luca",
        changedAt: new Date().toISOString(),
      },
    });
    render(<SettingsForm view={view} scope="u:w" />);
    fireEvent.click(await screen.findByTestId("settings-save"));
    expect(await screen.findByText(/Luca ha modificato questo elemento/)).toBeTruthy();
    expect(screen.queryByTestId("settings-rite-note")).toBeNull();
  });
});
