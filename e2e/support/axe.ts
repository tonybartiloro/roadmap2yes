import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/**
 * axe for the accessibility specs: WCAG 2.2 AA (A + AA tags of 2.0, 2.1, 2.2). The two rules the
 * plan names (`target-size`, `color-contrast`) carry those tags, so they are in the set; a tag
 * selection runs them even when axe disables a rule by default. Best practices (heading order,
 * landmarks) are NOT part of WCAG: they are reported through `bestPracticeFindings`, as notes.
 */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export type AxeFinding = { id: string; impact: string | null | undefined; nodes: string[] };

async function run(
  page: Page,
  tags: string[],
  options: { include?: string; exclude?: string[] },
): Promise<AxeFinding[]> {
  let builder = new AxeBuilder({ page }).withTags(tags);
  if (options.include) builder = builder.include(options.include);
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
  const results = await builder.analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.slice(0, 4).map((node) => node.target.join(" ")),
  }));
}

export const axeFindings = (page: Page, options: { include?: string; exclude?: string[] } = {}) =>
  run(page, WCAG_TAGS, options);

export const bestPracticeFindings = (
  page: Page,
  options: { include?: string; exclude?: string[] } = {},
) => run(page, ["best-practice"], options);

/** A readable message for `expect(findings, describe(findings)).toEqual([])`. */
export function describeFindings(findings: AxeFinding[]): string {
  return findings.length === 0
    ? "no axe violations"
    : findings.map((f) => `${f.id} (${f.impact}): ${f.nodes.join(" | ")}`).join("\n");
}
