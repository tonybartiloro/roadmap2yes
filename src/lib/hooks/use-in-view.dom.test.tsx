// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInView } from "./use-in-view";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

function Probe() {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="p">
      {String(inView)}
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

describe("useInView in the browser", () => {
  it("turns true only when the element intersects, and stays true", async () => {
    let callback: (entries: Array<{ isIntersecting: boolean }>) => void = () => {};
    class FakeObserver {
      constructor(cb: typeof callback) {
        callback = cb;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    render(<Probe />);
    expect(screen.getByTestId("p").textContent).toBe("false");
    await act(async () => callback([{ isIntersecting: false }]));
    expect(screen.getByTestId("p").textContent).toBe("false");
    await act(async () => callback([{ isIntersecting: true }]));
    expect(screen.getByTestId("p").textContent).toBe("true");
  });

  it("without IntersectionObserver it becomes true after mount (not during SSR)", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Probe />);
    expect(screen.getByTestId("p").textContent).toBe("false");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(screen.getByTestId("p").textContent).toBe("true");
  });
});
