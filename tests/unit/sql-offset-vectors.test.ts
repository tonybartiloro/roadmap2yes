import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R8: the SQL date rule (`private.add_date_offset`) and the TypeScript one must not drift. pgTAP
 * cannot read the shared JSON, so `timeline_offset.test.sql` embeds the vectors; this test keeps
 * that copy identical to `tests/fixtures/date-offset-vectors.json` (count, reference, offset,
 * expected, note).
 */
interface Vector {
  reference: string;
  offset: Record<string, number>;
  expected: string;
  note: string;
}

const root = process.cwd();
const json = JSON.parse(
  readFileSync(join(root, "tests/fixtures/date-offset-vectors.json"), "utf8"),
) as { vectors: Vector[] };
const sql = readFileSync(join(root, "supabase/tests/timeline_offset.test.sql"), "utf8");

const ROW =
  /^\s*\('(\d{4}-\d{2}-\d{2})'::date, '(\{[^']*\})'::jsonb, '(\d{4}-\d{2}-\d{2})'::date, '((?:[^']|'')*)'\)/gm;

describe("pgTAP offset vectors", () => {
  const rows = [...sql.matchAll(ROW)].map((m) => ({
    reference: m[1],
    offset: JSON.parse(m[2] ?? "{}") as Record<string, number>,
    expected: m[3],
    note: (m[4] ?? "").replace(/''/g, "'"),
  }));

  it("has exactly the vectors of the shared JSON, in order", () => {
    expect(rows).toHaveLength(json.vectors.length);
    expect(rows).toEqual(json.vectors.map((v) => ({ ...v, offset: v.offset })));
  });

  it("plan count is vectors + 3", () => {
    expect(sql).toContain(`select plan(${json.vectors.length + 3});`);
  });
});
