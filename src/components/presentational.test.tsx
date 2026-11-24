import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Countdown as CountdownValue } from "@/domain/home";
import { BudgetBar } from "./BudgetBar";
import { Countdown, countdownText } from "./Countdown";
import {
  DateScenarioList,
  scenarioDateText,
  scenarioTitle,
  type DateScenarioItem,
} from "./DateScenarioList";
import { EmptyState } from "./EmptyState";
import { ReferenceBadge } from "./ReferenceBadge";

const provisional: CountdownValue = {
  kind: "provisional",
  date: "2027-09-03",
  days: 284,
  weeks: 40,
  phase: "upcoming",
};

describe("Countdown", () => {
  it("uses the approved copy", () => {
    expect(countdownText(provisional)).toBe("Se fosse il 3 settembre 2027: mancano 284 giorni");
    expect(countdownText({ ...provisional, kind: "definitive" })).toBe(
      "Mancano 284 giorni (40 settimane)",
    );
    expect(countdownText({ ...provisional, kind: "definitive", days: 1, weeks: 0 })).toBe(
      "Manca 1 giorno (0 settimane)",
    );
    expect(countdownText({ kind: "none" })).toBe("Data da decidere");
  });

  it("today and past follow design §7.1 (plural verb, months over 60 days)", () => {
    const today = { ...provisional, days: 0, weeks: 0, phase: "today" as const };
    expect(countdownText({ ...today, kind: "definitive" })).toBe("È oggi!");
    expect(countdownText(today)).toBe("Se fosse il 3 settembre 2027: sarebbe oggi");
    const past = (days: number, kind: "definitive" | "provisional") =>
      countdownText({ ...provisional, kind, days: -days, weeks: 0, phase: "past" });
    expect(past(1, "definitive")).toBe("È passato 1 giorno");
    expect(past(5, "definitive")).toBe("Sono passati 5 giorni");
    expect(past(5, "provisional")).toBe("La data del 3 settembre 2027 è passata");
    expect(past(60, "provisional")).toBe("La data del 3 settembre 2027 è passata");
    expect(past(548, "provisional")).toBe("La data del 3 settembre 2027 è passata da 18 mesi");
    expect(past(548, "provisional")).not.toMatch(/548/);
  });

  it("shows the change-reference link only when there is a reference", () => {
    const withLink = renderToStaticMarkup(
      <Countdown value={provisional} changeReferenceHref="/scelte/data" />,
    );
    expect(withLink).toContain('href="/scelte/data"');
    expect(
      renderToStaticMarkup(<Countdown value={{ kind: "none" }} changeReferenceHref="/x" />),
    ).not.toContain("Cambia riferimento");
  });

  it("shows the reference badge and the linked location, and is not a live region", () => {
    const html = renderToStaticMarkup(<Countdown value={provisional} locationName="Mamma Rosa" />);
    expect(html).toContain("Riferimento · provvisorio");
    expect(html).toContain("Mamma Rosa");
    expect(html).not.toContain("aria-live");
    expect(renderToStaticMarkup(<Countdown value={{ kind: "none" }} />)).not.toContain(
      "Riferimento",
    );
  });
});

describe("ReferenceBadge", () => {
  it("says provisional or definitive in text and adds who set it (AC60 location too)", () => {
    const a = renderToStaticMarkup(<ReferenceBadge status="definitive" />);
    expect(a).toContain("Riferimento · definitivo");
    const b = renderToStaticMarkup(
      <ReferenceBadge status="provisional" setBy="Jessica" locationName="Villa Aurora" />,
    );
    expect(b).toContain("provvisorio · scelto da Jessica");
    expect(b).toContain("Villa Aurora");
    expect(b).toContain("Location collegata");
  });
});

describe("BudgetBar", () => {
  it("renders the text equivalent and an accessible progressbar", () => {
    const html = renderToStaticMarkup(
      <BudgetBar label="Catering" value={500000} total={1000000} />,
    );
    expect(html).toContain("Concordato € 5.000 di € 10.000");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="50"');
  });

  it("warns warmly, with icon and text, when over the total", () => {
    const html = renderToStaticMarkup(
      <BudgetBar label="Catering" value={1120000} total={1000000} />,
    );
    expect(html).toContain("Sei oltre di € 1.200.");
    expect(html).toContain('aria-valuenow="100"');
    expect(html).not.toContain("-€");
  });

  it("does not divide by zero", () => {
    const html = renderToStaticMarkup(<BudgetBar label="Totale" value={0} total={0} />);
    expect(html).toContain('aria-valuenow="0"');
  });
});

describe("DateScenarioList", () => {
  const items: DateScenarioItem[] = [
    {
      id: "1",
      label: "Data desiderata",
      kind: "fixed",
      dateFrom: "2027-09-03",
      isReference: true,
      referenceStatus: "provisional",
      locationName: "Mamma Rosa",
    },
    { id: "2", label: "Primavera", kind: "period", dateFrom: "2028-05-01", dateTo: "2028-06-30" },
    { id: "3", label: "Linked", kind: "fixed", dateFrom: "2028-09-02", locationName: "Villa X" },
  ];

  it("formats fixed dates and periods", () => {
    expect(scenarioDateText(items[0] as DateScenarioItem)).toBe("3 set 2027");
    expect(scenarioDateText(items[1] as DateScenarioItem)).toBe(
      "mag–giu 2028 · calcolata dal 1 mag",
    );
    expect(
      scenarioDateText({
        id: "x",
        label: "",
        kind: "period",
        dateFrom: "2027-12-01",
        dateTo: "2028-01-31",
      }),
    ).toBe("dic 2027–gen 2028 · calcolata dal 1 dic");
  });

  it("shows the reference badge and the linked location on every scenario that has one", () => {
    const html = renderToStaticMarkup(
      <DateScenarioList items={items} actions={(item) => <button>Azione {item.id}</button>} />,
    );
    expect(html).toContain("Riferimento · provvisorio");
    expect(html).toContain("Mamma Rosa");
    expect(html).toContain("Villa X");
    expect(html).toContain("Azione 2");
  });

  it("falls back to a neutral title when the label is empty or a raw date", () => {
    const base = { id: "x", kind: "fixed" as const, dateFrom: "2027-09-03" };
    expect(scenarioTitle({ ...base, label: "" })).toBe("Data fissa");
    expect(scenarioTitle({ ...base, label: "03/09/2027" })).toBe("Data fissa");
    expect(scenarioTitle({ ...base, kind: "period", label: " " })).toBe("Periodo");
    expect(scenarioTitle({ ...base, label: "Mamma Rosa" })).toBe("Mamma Rosa");
  });

  it("shows the empty text", () => {
    expect(
      renderToStaticMarkup(<DateScenarioList items={[]} emptyText="Nessuna data" />),
    ).toContain("Nessuna data");
  });
});

describe("EmptyState", () => {
  it("has a title, an explanation and one action", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        title="Ancora nessun compito"
        description="Aggiungi il primo."
        action={<a href="/x">Aggiungi</a>}
      />,
    );
    expect(html).toContain("<h2");
    expect(html).toContain("Aggiungi il primo.");
    expect(html).toContain('href="/x"');
  });
});
