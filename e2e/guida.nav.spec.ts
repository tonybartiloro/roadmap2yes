/**
 * QA T10: the six menu labels fit, whole, in every theme (FEAT-2026-002 AC1, AC7; QA-1).
 * 12 themes x 320/768/1024 px, light only, one seed and one login. After `document.fonts.ready`
 * the width of each label's text (Range) must not exceed the width of its `li`.
 */
import { OPTIONS_SECTION_LABEL } from "@/components/section-label";
import { loginAs } from "./support/auth";
import { expect, serviceClient, test, uniqueIp } from "./support/fixtures";
import { seedWedding } from "./support/seed";

test.describe.configure({ timeout: 240_000 });

const THEMES = [
  "giardino",
  "sera",
  "mediterraneo",
  "toscana",
  "essenziale",
  "rosa-antico",
  "art-deco",
  "boho",
  "provenza",
  "vivace",
  "velluto",
  "amalfi",
];
const WIDTHS = [320, 768, 1024];
/** Test-only: a longer label that must be caught (local proof, see the 2nd test). */
const PROOF_LABEL = "Impostazioni";

const measure = async (label: string | null) => {
  await document.fonts.ready;
  const items = [...document.querySelectorAll('nav[aria-label="Principale"] li')];
  return items.map((li, i) => {
    const link = li.querySelector("a")!;
    const span = link.querySelector("span:not([aria-hidden])")!;
    if (label && i === items.length - 2) span.textContent = label;
    const range = document.createRange();
    range.selectNodeContents(span);
    return {
      text: span.textContent ?? "",
      text_w: range.getBoundingClientRect().width,
      // A flex item grows to fit a long label (and pushes the bar past the screen), so on the bottom
      // bar the budget is the equal sixth of the bar, not the width the item ended up with.
      li_w:
        innerWidth < 768
          ? li.parentElement!.getBoundingClientRect().width / items.length
          : li.getBoundingClientRect().width,
    };
  });
};

test("6 menu labels fit in their item: 12 themes x 320/768/1024 px", async ({ page }) => {
  const w = await seedWedding({ templateTasks: false });
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.emulateMedia({ colorScheme: "light" });
  const failures: string[] = [];
  for (const theme of THEMES) {
    const saved = await serviceClient()
      .from("weddings")
      .update({ theme_id: theme })
      .eq("id", w.weddingId);
    expect(saved.error).toBeNull();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const rows = await page.evaluate(measure, null);
      expect(rows).toHaveLength(6);
      expect(rows.map((r) => r.text)).toContain(OPTIONS_SECTION_LABEL);
      for (const r of rows) {
        // the rail at 768 px is narrower than the labels' own width budget only if text overflows
        if (r.text_w > r.li_w + 0.5) {
          failures.push(
            `${theme} @${width}: "${r.text}" ${r.text_w.toFixed(1)} > ${r.li_w.toFixed(1)}`,
          );
        }
      }
    }
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

test("the check is not vacuous: a longer label overflows at 320 px", async ({ page }) => {
  const w = await seedWedding({ templateTasks: false });
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  const rows = await page.evaluate(measure, PROOF_LABEL);
  const long = rows.find((r) => r.text === PROOF_LABEL);
  expect(long, "label swapped in").toBeDefined();
  expect(long!.text_w).toBeGreaterThan(long!.li_w);
});
