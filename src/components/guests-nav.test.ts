import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { shouldShowGuestsNav } from "./guests-nav";

type Reply = { data: unknown; error: unknown };

/** A query builder double: `.abortSignal()` returns itself, awaiting it gives the reply. */
function builder(reply: () => Promise<Reply>) {
  const b: Record<string, unknown> = {};
  b["select"] = () => b;
  b["limit"] = () => b;
  b["abortSignal"] = () => b;
  b["maybeSingle"] = () => reply();
  b["then"] = (resolve: (r: Reply) => unknown, reject: (e: unknown) => unknown) =>
    reply().then(resolve, reject);
  return b;
}

function fakeDb(wedding: () => Promise<Reply>, permission: () => Promise<Reply>) {
  return {
    from: () => builder(wedding),
    rpc: () => builder(permission),
  } as unknown as SupabaseClient<Database>;
}

const ok = (data: unknown): (() => Promise<Reply>) => async () => ({ data, error: null });
const fail = async (): Promise<Reply> => ({ data: null, error: { message: "boom" } });

describe("shouldShowGuestsNav", () => {
  it("follows has_permission when it answers", async () => {
    expect(await shouldShowGuestsNav(fakeDb(ok({ id: "w" }), ok(true)))).toBe(true);
    expect(await shouldShowGuestsNav(fakeDb(ok({ id: "w" }), ok(false)))).toBe(false);
  });

  it("is fail-open: errors, a thrown query and no visible wedding keep the item", async () => {
    expect(await shouldShowGuestsNav(fakeDb(fail, ok(false)))).toBe(true);
    expect(await shouldShowGuestsNav(fakeDb(ok({ id: "w" }), fail))).toBe(true);
    expect(await shouldShowGuestsNav(fakeDb(ok(null), ok(false)))).toBe(true);
    const throwing = async (): Promise<Reply> => {
      throw new Error("network");
    };
    expect(await shouldShowGuestsNav(fakeDb(ok({ id: "w" }), throwing))).toBe(true);
  });
});
