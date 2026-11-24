// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingState } from "./data";
import { EMPTY_ANSWERS } from "./model";

const mocks = vi.hoisted(() => ({
  saveStepAction: vi.fn(),
  finishOnboardingAction: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("./actions", () => mocks);
vi.mock("@/features/appearance/actions", () => ({ saveThemeAction: vi.fn() }));
// The gallery has its own tests (T3); here only the step around it matters.
vi.mock("@/components/ThemeGallery", () => ({
  ThemeGallery: () => <div data-testid="theme-gallery" />,
}));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ cancelPreview: vi.fn() }) }));
vi.mock("@/features/invitations/actions", () => ({
  changePendingEmailAction: vi.fn(),
  createPartnerWithCodeAction: vi.fn(),
  inviteByEmailAction: vi.fn(),
  resendInviteAction: vi.fn(),
  revokeInviteAction: vi.fn(),
  setTemporaryCodeAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
// Radix (radio group, switch) measures with ResizeObserver, which jsdom does not have.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { OnboardingWizard } from "./OnboardingWizard";

const person = {
  id: "p1",
  version: 1,
  slot: "A" as const,
  email: "anna@example.test",
  firstName: null,
  lastName: null,
  label: "sposa",
  joined: true,
};

function state(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return {
    weddingId: "w1",
    version: 1,
    completed: false,
    selfSlot: "A",
    rite: null,
    guestBand: null,
    styleLabel: null,
    styleNote: null,
    region: null,
    comune: null,
    themeId: "giardino",
    answers: EMPTY_ANSWERS,
    unknown: [],
    you: person,
    partner: null,
    invitation: null,
    ...overrides,
  };
}

function wizard(initial: OnboardingState, emailOn = false) {
  return render(
    <OnboardingWizard initial={initial} scope="u1:w1" emailOn={emailOn} today="2026-11-24" />,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.saveStepAction.mockReset();
  mocks.finishOnboardingAction.mockReset();
  mocks.replace.mockReset();
});
afterEach(() => cleanup());

describe("OnboardingWizard (AC12, AC13)", () => {
  it("opens on step 1 with the progress in text and bar, the title focused and no 'non lo so'", async () => {
    wizard(state());
    expect(await screen.findByTestId("onboarding-progress-text")).toHaveProperty(
      "textContent",
      "Passo 1 di 8",
    );
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("1");
    expect(bar.getAttribute("aria-valuemax")).toBe("8");
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(title);
    // The email of the login is shown and not editable; there is no date of birth anywhere.
    const email = (await screen.findByLabelText("Email")) as HTMLInputElement;
    expect(email.readOnly).toBe(true);
    expect(email.value).toBe("anna@example.test");
    expect(screen.queryByText(/nascita/i)).toBeNull();
    expect(screen.queryByTestId("step-skip")).toBeNull();
    expect(screen.queryByRole("button", { name: "Indietro" })).toBeNull();
  });

  it("step 1 needs the first name, then saves and moves to step 2", async () => {
    mocks.saveStepAction.mockResolvedValue({
      ok: true,
      state: state({ answers: { ...EMPTY_ANSWERS, lastStep: 1 } }),
    });
    wizard(state());
    fireEvent.click(await screen.findByTestId("step-continue"));
    expect(await screen.findByText("Scrivi il tuo nome.")).toBeTruthy();
    expect(mocks.saveStepAction).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: "Anna" } });
    fireEvent.click(screen.getByTestId("step-continue"));
    await waitFor(() => expect(mocks.saveStepAction).toHaveBeenCalledTimes(1));
    expect(mocks.saveStepAction).toHaveBeenCalledWith({
      step: "you",
      firstName: "Anna",
      lastName: "",
      label: "sposa",
    });
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-progress-text").textContent).toBe("Passo 2 di 8"),
    );
    expect(screen.getByRole("button", { name: "Indietro" })).toBeTruthy();
    // Every step but the first accepts "Non lo so ancora".
    expect(screen.getByTestId("step-skip")).toBeTruthy();
  });

  it("a failed save keeps the person on the step with the message and the draft", async () => {
    mocks.saveStepAction.mockResolvedValue({
      ok: false,
      code: "unknown",
      message: "Non sono riuscito a salvare. Riprova: quello che hai scritto resta qui.",
    });
    wizard(state());
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: "Anna" } });
    fireEvent.click(screen.getByTestId("step-continue"));
    expect(await screen.findByTestId("onboarding-error")).toBeTruthy();
    expect(screen.getByTestId("onboarding-progress-text").textContent).toBe("Passo 1 di 8");
    await waitFor(() =>
      expect(JSON.stringify(Object.entries(window.localStorage))).toContain("Anna"),
    );
  });

  it("resumes after the last confirmed step and says so", async () => {
    wizard(state({ answers: { ...EMPTY_ANSWERS, lastStep: 3 } }));
    expect((await screen.findByTestId("onboarding-progress-text")).textContent).toBe(
      "Passo 4 di 8",
    );
    expect(screen.getByTestId("onboarding-resume").textContent).toBe(
      "Rieccoti, riprendiamo dal passo 4 di 8.",
    );
    // The date step starts with the prefilled scenario of 3 September 2027 (AC12).
    const date = (await screen.findByLabelText("Data", { selector: "input" })) as HTMLInputElement;
    expect(date.value).toBe("2027-09-03");
    expect(screen.getByTestId("scenario-add")).toBeTruthy();
  });

  it("'Non lo so ancora' on the dates step sends no scenario; scenarios can be added and removed", async () => {
    mocks.saveStepAction.mockResolvedValue({
      ok: true,
      state: state({ answers: { ...EMPTY_ANSWERS, lastStep: 4 } }),
    });
    wizard(state({ answers: { ...EMPTY_ANSWERS, lastStep: 3 } }));
    fireEvent.click(await screen.findByTestId("scenario-add"));
    expect(screen.getAllByTestId("scenario-item")).toHaveLength(2);
    fireEvent.click(screen.getAllByTestId("scenario-remove")[0]!);
    fireEvent.click(screen.getAllByTestId("scenario-remove")[0]!);
    expect(screen.getByTestId("scenario-empty")).toBeTruthy();

    fireEvent.click(screen.getByTestId("step-skip"));
    await waitFor(() => expect(mocks.saveStepAction).toHaveBeenCalled());
    expect(mocks.saveStepAction).toHaveBeenCalledWith({ step: "dates", skip: true, scenarios: [] });
  });

  it("the partner step never puts the code in the draft and hides the email invite when emails are off", async () => {
    wizard(state({ answers: { ...EMPTY_ANSWERS, lastStep: 1 } }), false);
    expect(await screen.findByTestId("partner-email-off")).toBeTruthy();
    expect(screen.queryByTestId("partner-mode-email")).toBeNull();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "luca@example.test" } });
    fireEvent.change(screen.getByLabelText("Il codice iniziale"), {
      target: { value: "Segreto12345x" },
    });
    await waitFor(() => {
      const stored = JSON.stringify(Object.entries(window.localStorage));
      expect(stored).toContain("luca@example.test");
    });
    expect(JSON.stringify(Object.entries(window.localStorage))).not.toContain("Segreto12345x");
  });

  it("with emails on the email invite is offered, with 'Invia l'invito alla fine' on", async () => {
    wizard(state({ answers: { ...EMPTY_ANSWERS, lastStep: 1 } }), true);
    expect(await screen.findByTestId("partner-mode-email")).toBeTruthy();
    expect(screen.getByTestId("partner-invite-at-end").getAttribute("aria-checked")).toBe("true");
  });

  it("the last step finishes and shows 'Ecco il tuo percorso' with the way to the home", async () => {
    mocks.finishOnboardingAction.mockResolvedValue({
      ok: true,
      summary: {
        state: state({ styleLabel: "Boho", answers: { ...EMPTY_ANSWERS, lastStep: 8 } }),
        tasksCreated: 24,
        referenceDate: "2027-09-03",
        referenceStatus: "provisional",
        warnings: [],
        invite: { kind: "code_ready" },
      },
    });
    wizard(state({ answers: { ...EMPTY_ANSWERS, lastStep: 7 } }));
    fireEvent.click(await screen.findByTestId("step-finish"));
    expect(await screen.findByText("Ecco il tuo percorso")).toBeTruthy();
    expect(mocks.finishOnboardingAction).toHaveBeenCalledWith({ skipTheme: false });
    expect(screen.getByTestId("summary-tasks").textContent).toContain("24 tappe");
    expect(screen.getByTestId("summary-reference").textContent).toBe(
      "3 settembre 2027 (provvisoria)",
    );
    expect(screen.getByTestId("summary-style-tip").textContent).toContain("Lascia spazio");
    expect(screen.getByTestId("summary-invite").textContent).toContain("consegna il codice");
    expect(screen.getByTestId("summary-home").getAttribute("href")).toBe("/");
  });

  it("the summary stays when the page is re-rendered as completed (QA-2) and nothing sends the person Home", async () => {
    const finished = state({ completed: true, answers: { ...EMPTY_ANSWERS, lastStep: 8 } });
    mocks.finishOnboardingAction.mockResolvedValue({
      ok: true,
      summary: {
        state: finished,
        tasksCreated: 12,
        referenceDate: null,
        referenceStatus: null,
        warnings: [],
        invite: { kind: "sent", link: "https://app.example.test/invito/abc" },
      },
    });
    const view = wizard(state({ answers: { ...EMPTY_ANSWERS, lastStep: 7 } }));
    fireEvent.click(await screen.findByTestId("step-finish"));
    expect(await screen.findByText("Ecco il tuo percorso")).toBeTruthy();
    // The revalidation after "finish" hands the wizard a completed state.
    view.rerender(
      <OnboardingWizard initial={finished} scope="u1:w1" emailOn={false} today="2026-11-24" />,
    );
    expect(screen.getByText("Ecco il tuo percorso")).toBeTruthy();
    expect(screen.getByTestId("invite-link-box")).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("opening /onboarding when it is already completed goes Home", async () => {
    wizard(state({ completed: true, answers: { ...EMPTY_ANSWERS, lastStep: 8 } }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
  });
});
