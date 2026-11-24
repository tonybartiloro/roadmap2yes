/**
 * Reads EVERY row of an ordered query. PostgREST caps each response at `max_rows` and truncates
 * silently, so a plain `select` is wrong for any table that can outgrow it.
 *
 * `PAGE_LIMIT` MUST stay <= `max_rows` in `supabase/config.toml` (1000) AND in the remote project's
 * API settings: a page larger than the cap would come back short and end the loop early. 500 is
 * the same page size as the export.
 *
 * The query MUST have a stable, UNIQUE `order` (end it with the primary key), otherwise rows can
 * be skipped or repeated between pages.
 */
export const PAGE_LIMIT = 500;

export type PageResult<T> = PromiseLike<{ data: T[] | null; error: { code?: string } | null }>;

export class PageReadError extends Error {
  readonly code: string | undefined;
  /**
   * `cause` keeps the original error so `classifyDbError` still sees paused/unreachable outages;
   * the message itself stays value-free.
   */
  constructor(code: string | undefined, cause?: unknown) {
    super("database error", { cause });
    this.name = "PageReadError";
    this.code = code;
  }
}

export async function allPages<T>(page: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_LIMIT) {
    const { data, error } = await page(from, from + PAGE_LIMIT - 1);
    if (error) throw new PageReadError(error.code, error);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_LIMIT) return all;
  }
}

/** Splits a long id list so a `.in()` filter never builds a URL beyond server limits. */
export function chunk<T>(items: readonly T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
