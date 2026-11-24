import { describe, expect, it } from "vitest";
import { allPages } from "./supabase-job-db";

/** Regression: PostgREST caps a response at `max_rows` (1000); recipients past it were silently lost. */
describe("allPages", () => {
  const source = (n: number) => Array.from({ length: n }, (_, i) => i);
  const pager = (rows: number[]) => async (from: number, to: number) => ({
    data: rows.slice(from, Math.min(to, from + 999) + 1),
    error: null,
  });

  it("reads past the 1000-row cap", async () => {
    expect(await allPages(pager(source(2503)))).toHaveLength(2503);
  });

  it("stops after an exact multiple of the page size", async () => {
    expect(await allPages(pager(source(2000)))).toHaveLength(2000);
  });

  it("handles empty and short results", async () => {
    expect(await allPages(pager([]))).toEqual([]);
    expect(await allPages(pager(source(3)))).toEqual([0, 1, 2]);
  });

  it("throws on a database error", async () => {
    await expect(allPages(async () => ({ data: null, error: { code: "XX000" } }))).rejects.toThrow();
  });
});
