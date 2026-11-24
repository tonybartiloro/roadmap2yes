import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useInView } from "./use-in-view";

function Probe() {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} data-in-view={String(inView)}>
      {inView ? "var(--font-heading)" : "Georgia"}
    </div>
  );
}

describe("useInView", () => {
  it("is false on the server, so SSR uses the system heading font (no font request)", () => {
    const html = renderToStaticMarkup(<Probe />);
    expect(html).toContain('data-in-view="false"');
    expect(html).toContain("Georgia");
    expect(html).not.toContain("var(--font-heading)");
  });
});
