import { describe, expect, it } from "vitest";
import { allPages, chunk, PAGE_LIMIT } from "./all-pages";

/** PostgREST caps a response at `max_rows`; this helper must see every row anyway. */
describe("allPages", () => {
  const source = (n: number) => Array.from({ length: n }, (_, i) => i);
  const pager = (rows: number[], cap = 1000) => {
    const calls: [number, number][] = [];
    const page = async (from: number, to: number) => {
      calls.push([from, to]);
      return { data: rows.slice(from, Math.min(to, from + cap - 1) + 1), error: null };
    };
    return { page, calls };
  };

  it("reads past the 1000-row cap, in pages of PAGE_LIMIT", async () => {
    const { page, calls } = pager(source(2503));
    expect(await allPages(page)).toEqual(source(2503));
    expect(PAGE_LIMIT).toBeLessThanOrEqual(1000);
    expect(calls[0]).toEqual([0, PAGE_LIMIT - 1]);
    expect(calls).toHaveLength(Math.ceil(2503 / PAGE_LIMIT));
  });

  it("stops after an exact multiple of the page size", async () => {
    expect(await allPages(pager(source(PAGE_LIMIT * 2)).page)).toHaveLength(PAGE_LIMIT * 2);
  });

  it("handles empty, short and null results", async () => {
    expect(await allPages(pager([]).page)).toEqual([]);
    expect(await allPages(pager(source(3)).page)).toEqual([0, 1, 2]);
    expect(await allPages(async () => ({ data: null, error: null }))).toEqual([]);
  });

  it("throws a value-free error carrying only the code", async () => {
    let error: (Error & { code?: string }) | undefined;
    try {
      await allPages(async () => ({ data: null, error: { code: "XX000" } }));
    } catch (e) {
      error = e as Error & { code?: string };
    }
    if (!error) throw new Error("expected a throw");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("XX000");
    expect(error.message).toBe("database error");
    expect((error.cause as { code?: string }).code).toBe("XX000");
  });
});

describe("chunk", () => {
  it("splits into pieces of at most `size`", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
    expect(chunk(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length)).toEqual([
      100, 100, 50,
    ]);
  });
});
