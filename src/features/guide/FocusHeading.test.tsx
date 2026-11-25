// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FocusHeading } from "./FocusHeading";

let mockPathname = "/guida";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

function Page({ id }: { id: string }) {
  return (
    <>
      <h1 id="guida-titolo" tabIndex={-1}>
        T
      </h1>
      <FocusHeading key={id} targetId="guida-titolo" />
    </>
  );
}

const titleFocused = () => document.activeElement === document.getElementById("guida-titolo");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FocusHeading", () => {
  it("does not focus the title on the first load", () => {
    mockPathname = "/guida/budget";
    render(<Page id="a" />);
    expect(titleFocused()).toBe(false);
  });

  it("focuses the title when the navigation started inside the Guide", () => {
    mockPathname = "/guida";
    const view = render(<Page id="a" />);
    mockPathname = "/guida/budget";
    view.rerender(<Page id="b" />); // remount in the same commit, as Next does
    expect(titleFocused()).toBe(true);
  });

  it("does not focus it when arriving from another section", () => {
    vi.useFakeTimers();
    mockPathname = "/guida";
    const first = render(<Page id="a" />);
    first.unmount();
    act(() => {
      vi.runAllTimers();
    });
    mockPathname = "/guida/budget";
    render(<Page id="b" />);
    expect(titleFocused()).toBe(false);
  });
});
