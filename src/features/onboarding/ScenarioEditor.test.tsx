// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SOFT_MIN_MESSAGE, type ScenarioDraft } from "./model";
import { ScenarioEditor } from "./ScenarioEditor";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
afterEach(() => cleanup());

const period = (dateFrom: string, dateTo: string): ScenarioDraft => ({
  id: "p",
  kind: "period",
  dateFrom,
  dateTo,
  label: null,
});

describe("ScenarioEditor soft warning (DES-40)", () => {
  it("a period before 3 Sep 2027 shows icon AND text, not colour alone", () => {
    render(
      <ScenarioEditor
        scenarios={[period("2027-05-01", "2027-06-30")]}
        onChange={() => {}}
        today="2026-11-24"
        showProblems={false}
      />,
    );
    const note = screen.getByTestId("scenario-soft-warning");
    expect(note.textContent).toBe(SOFT_MIN_MESSAGE);
    expect(note.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("no warning for a period from 3 Sep 2027 on", () => {
    render(
      <ScenarioEditor
        scenarios={[period("2028-05-01", "2028-06-30")]}
        onChange={() => {}}
        today="2026-11-24"
        showProblems={false}
      />,
    );
    expect(screen.queryByTestId("scenario-soft-warning")).toBeNull();
  });
});
