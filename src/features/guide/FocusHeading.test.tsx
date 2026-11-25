// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { StrictMode, Suspense, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FocusHeading, GuideShell } from "./FocusHeading";

let mockPathname = "/guida";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

function Page({ id }: { id: string }) {
  return (
    <>
      <h1 id="guida-titolo" tabIndex={-1}>
        {id}
      </h1>
      <FocusHeading key={id} targetId="guida-titolo" />
    </>
  );
}

const shell = (children: ReactNode) => <GuideShell>{children}</GuideShell>;
const titleFocused = () => document.activeElement === document.getElementById("guida-titolo");
const go = (path: string) => {
  mockPathname = path;
};

afterEach(cleanup);

describe("FocusHeading", () => {
  it("does not focus the title on the first load of a page", () => {
    go("/guida/budget");
    render(shell(<Page id="a" />));
    expect(titleFocused()).toBe(false);
  });

  it("does not focus on first load in Strict Mode, nor when the page streams in late", async () => {
    go("/guida/budget");
    const view = render(
      <StrictMode>{shell(<Suspense fallback={<p>caricamento</p>}>{null}</Suspense>)}</StrictMode>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    view.rerender(<StrictMode>{shell(<Page id="a" />)}</StrictMode>);
    expect(titleFocused()).toBe(false);
  });

  it("focuses the title of the next Guide page, also after a skeleton", async () => {
    go("/guida");
    const view = render(shell(<Page id="a" />));
    go("/guida/budget");
    view.rerender(shell(<p>caricamento</p>));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    view.rerender(shell(<Page id="b" />));
    expect(titleFocused()).toBe(true);
  });

  it("focuses when going back to the page the visit started on", () => {
    go("/guida");
    const view = render(shell(<Page id="a" />));
    go("/guida/budget");
    view.rerender(shell(<Page id="b" />));
    go("/guida");
    view.rerender(shell(<Page id="c" />));
    expect(titleFocused()).toBe(true);
  });

  it("does not focus when the Guide is entered from another section (shell mounts anew)", () => {
    go("/guida");
    const first = render(shell(<Page id="a" />));
    go("/guida/budget");
    first.rerender(shell(<Page id="b" />));
    first.unmount();
    go("/guida/scelte");
    render(shell(<Page id="c" />));
    expect(titleFocused()).toBe(false);
  });
});
