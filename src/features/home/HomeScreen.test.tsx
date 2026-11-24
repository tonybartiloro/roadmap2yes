// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailStatusProvider } from "@/components/EmailOffBanner";
import { countdown } from "@/domain/home";
import { lastExport } from "@/domain/export";
import type { HomeData, StepsData } from "./types";
import { buildSteps } from "./model";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav, usePathname: () => "/" }));

const actions = vi.hoisted(() => ({ dismissWelcomeAction: vi.fn() }));
vi.mock("./actions", () => actions);

import { HomeScreen } from "./HomeScreen";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const TODAY = "2026-11-24";

const reference = (
  status: "provisional" | "definitive",
  extra: { setBy?: string | null; locationName?: string | null } = {},
) => ({
  ok: true as const,
  data: {
    value: countdown(
      { scenarioId: "s1", date: "2027-09-03", isPeriod: false, status, source: "automatic" },
      TODAY,
    ),
    setBy: extra.setBy ?? null,
    locationName: extra.locationName ?? null,
  },
});

const steps = (over: Partial<Parameters<typeof buildSteps>[0]> = {}): StepsData =>
  buildSteps({
    openDecisions: [],
    tasks: [],
    payments: [],
    mySlot: "A",
    today: TODAY,
    ...over,
  });

function makeHome(over: Partial<HomeData> = {}): HomeData {
  return {
    userId: "u1",
    mySlot: "A",
    myName: "Tony",
    partnerName: "Jessica",
    today: TODAY,
    visit: { previousSeenAt: "2026-11-20T08:00:00Z", lastExportAt: null, welcomeDismissedAt: null },
    reference: reference("provisional"),
    steps: { ok: true, data: steps() },
    payments: { ok: true, data: { upcoming: [], budgetDefined: true } },
    news: { ok: true, data: [] },
    lastExport: lastExport(null, TODAY),
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("Home screen", () => {
  it("shows the email-off notice when the app sends no email, and not when it does (AC59)", () => {
    const { rerender } = render(
      <EmailStatusProvider emailEnabled={false}>
        <HomeScreen data={makeHome()} />
      </EmailStatusProvider>,
    );
    expect(screen.getByRole("status").textContent).toContain("Le email sono spente");
    rerender(
      <EmailStatusProvider emailEnabled>
        <HomeScreen data={makeHome()} />
      </EmailStatusProvider>,
    );
    expect(screen.queryByText(/Le email sono spente/)).toBeNull();
  });

  it("greets by name and shows the provisional countdown with its label and the link (AC26)", () => {
    render(
      <HomeScreen
        data={makeHome({ reference: reference("provisional", { locationName: "Mamma Rosa" }) })}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Ciao Tony, ecco cosa ti aspetta oggi",
    );
    const section = screen.getByRole("region", { name: "Conto alla rovescia" });
    expect(
      within(section).getByText("Se fosse il 3 settembre 2027: mancano 283 giorni"),
    ).toBeTruthy();
    expect(within(section).getByText(/Riferimento · provvisorio/)).toBeTruthy();
    expect(within(section).getByText("Mamma Rosa")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cambia riferimento" }).getAttribute("href")).toBe(
      "/scelte/date",
    );
  });

  it("a definitive date shows days and weeks, with no 'Cambia riferimento'", () => {
    render(<HomeScreen data={makeHome({ reference: reference("definitive") })} />);
    expect(screen.getByText("Mancano 283 giorni (40 settimane)")).toBeTruthy();
    expect(screen.getByText(/Riferimento · definitivo/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Cambia riferimento" })).toBeNull();
  });

  it("with no date it says 'Data da decidere' and the first step is to choose it", () => {
    const home = makeHome({
      reference: { ok: true, data: { value: { kind: "none" }, setBy: null, locationName: null } },
      steps: {
        ok: true,
        data: steps({ openDecisions: [{ id: "d1", kind: "date", title: "Scegli la data" }] }),
      },
    });
    render(<HomeScreen data={home} />);
    expect(screen.getByText("Data da decidere")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Il primo passo: scegli la data" })).toBeTruthy();
    const links = screen.getAllByRole("link", { name: "Scegli la data" });
    expect(links.every((l) => l.getAttribute("href") === "/scelte/date")).toBe(true);
  });

  it("shows one main step and at most two more (AC27)", () => {
    const data = steps({
      openDecisions: [
        { id: "d1", kind: "date", title: "Scegli la data" },
        { id: "d2", kind: "location", title: "Scegli la location" },
      ],
      payments: [
        { id: "p1", title: "Acconto catering", dueDate: "2026-12-01" },
        { id: "p2", title: "Acconto fiori", dueDate: "2026-12-02" },
      ],
    });
    render(<HomeScreen data={makeHome({ steps: { ok: true, data } })} />);
    const card = screen.getByRole("region", { name: "Prossimo passo" });
    expect(within(card).getAllByRole("listitem")).toHaveLength(2);
    expect(within(card).getByText("Scegli la location")).toBeTruthy();
    expect(within(card).getByText("Acconto catering")).toBeTruthy();
    expect(within(card).queryByText("Acconto fiori")).toBeNull();
  });

  it("the partner's tasks appear only with the switch, and the choice is kept on the device", async () => {
    const data = steps({
      tasks: [
        {
          id: "t1",
          title: "Prenotare il fotografo",
          status: "todo",
          dueDate: "2026-11-27",
          dueOverridden: false,
          source: "user",
          templateKey: null,
          templateVersion: null,
          category: null,
          deleted: false,
          assignee: "B",
        },
      ],
    });
    const user = userEvent.setup();
    const { unmount } = render(<HomeScreen data={makeHome({ steps: { ok: true, data } })} />);
    expect(screen.queryByText("Prenotare il fotografo")).toBeNull();
    await user.click(screen.getByRole("switch", { name: "Mostra anche i compiti di Jessica" }));
    expect(screen.getByText("Prenotare il fotografo")).toBeTruthy();
    expect(window.localStorage.getItem("r2y-home-partner-tasks")).toBe("1");
    unmount();

    render(<HomeScreen data={makeHome({ steps: { ok: true, data } })} />);
    await waitFor(() => expect(screen.getByText("Prenotare il fotografo")).toBeTruthy());
  });

  it("with nothing urgent it says so", () => {
    render(<HomeScreen data={makeHome()} />);
    expect(screen.getByText("Per ora niente di urgente.")).toBeTruthy();
  });

  it("lists the payments in evidence, or says what is missing", () => {
    const upcoming = [
      {
        paymentId: "p1",
        itemId: "i1",
        itemDescription: "Banchetto",
        categoryId: "c1",
        categoryName: "Catering",
        amountCents: 150000,
        dueDate: "2026-12-01",
        daysUntil: 7,
        overdue: false,
      },
    ];
    const { rerender } = render(
      <HomeScreen
        data={makeHome({ payments: { ok: true, data: { upcoming, budgetDefined: true } } })}
      />,
    );
    const block = screen.getByRole("region", { name: "Pagamenti in evidenza (1)" });
    expect(within(block).getByText("Banchetto")).toBeTruthy();
    expect(within(block).getByText(/Catering · Entro il 1 dic 2026/)).toBeTruthy();

    rerender(
      <HomeScreen
        data={makeHome({ payments: { ok: true, data: { upcoming: [], budgetDefined: false } } })}
      />,
    );
    expect(screen.getByText(/Budget da definire/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Definisci il budget" }).getAttribute("href")).toBe(
      "/budget",
    );
  });

  it("shows the news, or an explicit empty message (AC41)", () => {
    const item = {
      id: "n1",
      at: "2026-11-22T10:00:00Z",
      actorId: "u2",
      source: "decision" as const,
      text: "Jessica ha scelto la location",
    };
    const { rerender } = render(
      <HomeScreen data={makeHome({ news: { ok: true, data: [item] } })} />,
    );
    const block = screen.getByRole("region", { name: "Novità dall'ultimo accesso" });
    expect(within(block).getByText("Jessica ha scelto la location")).toBeTruthy();
    rerender(<HomeScreen data={makeHome({ news: { ok: true, data: [] } })} />);
    expect(screen.getByText("Nessuna novità dall'ultima volta.")).toBeTruthy();
  });

  it("the second partner's first visit shows the welcome card instead of the news", async () => {
    actions.dismissWelcomeAction.mockResolvedValue({ ok: true });
    const home = makeHome({
      mySlot: "B",
      myName: "Jessica",
      partnerName: "Tony",
      visit: { previousSeenAt: null, lastExportAt: null, welcomeDismissedAt: null },
      news: { ok: true, data: null },
    });
    const user = userEvent.setup();
    render(<HomeScreen data={home} />);
    expect(
      screen.getByRole("heading", { name: "Ciao Jessica, ti stavamo aspettando" }),
    ).toBeTruthy();
    expect(screen.getByText(/Tony ha già preparato un po' di cose/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Novità dall'ultimo accesso" })).toBeNull();
    expect(screen.getByRole("link", { name: "Guarda il Percorso" }).getAttribute("href")).toBe(
      "/percorso",
    );
    expect(screen.getByRole("link", { name: "Controlla i tuoi dati" }).getAttribute("href")).toBe(
      "/altro/profili",
    );

    await user.click(screen.getByRole("button", { name: "Ho capito" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /ti stavamo aspettando/ })).toBeNull(),
    );
    expect(actions.dismissWelcomeAction).toHaveBeenCalledTimes(1);
  });

  it("if saving 'Ho capito' fails the card is hidden on this device and stays hidden", async () => {
    actions.dismissWelcomeAction.mockResolvedValue({
      ok: false,
      code: "unreachable",
      message: "x",
    });
    const home = makeHome({
      mySlot: "B",
      visit: { previousSeenAt: null, lastExportAt: null, welcomeDismissedAt: null },
      news: { ok: true, data: null },
    });
    const user = userEvent.setup();
    const { unmount } = render(<HomeScreen data={home} />);
    await user.click(screen.getByRole("button", { name: "Ho capito" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /ti stavamo aspettando/ })).toBeNull(),
    );
    expect(window.localStorage.getItem("r2y-welcome-dismissed:u1")).toBe("1");
    unmount();

    render(<HomeScreen data={home} />);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /ti stavamo aspettando/ })).toBeNull(),
    );
  });

  it("the last export line reminds after 30 days or when there never was one (AC42)", () => {
    const { rerender } = render(
      <HomeScreen data={makeHome({ lastExport: lastExport("2026-11-20T10:00:00Z", TODAY) })} />,
    );
    expect(screen.getByText("ultimo export: 4 giorni fa")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Esporta i dati" })).toBeNull();

    rerender(
      <HomeScreen data={makeHome({ lastExport: lastExport("2026-10-01T10:00:00Z", TODAY) })} />,
    );
    expect(screen.getByText("ultimo export: 54 giorni fa")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Esporta i dati" }).getAttribute("href")).toBe(
      "/altro/esporta",
    );
  });

  it("a failed block shows its own error card with 'Riprova' and the others stay", async () => {
    const user = userEvent.setup();
    render(<HomeScreen data={makeHome({ payments: { ok: false }, news: { ok: false } })} />);
    expect(screen.getByText("Non riesco a mostrarti i pagamenti")).toBeTruthy();
    expect(screen.getByText("Non riesco a mostrarti le novità")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Conto alla rovescia" })).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: "Riprova" })[0]!);
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
  });
});
