import { describe, expect, it } from "vitest";
import { GuestsLoadError, loadGuests, type Db } from "./data";

type Reply = { data: unknown[] | null; error: { code?: string } | null };

/** A `Db` double: `guest_groups` answers per column list, everything else is empty. */
function fakeDb(groups: (columns: string) => Reply): { db: Db; groupReads: string[] } {
  const groupReads: string[] = [];
  const from = (table: string) => {
    let columns = "";
    const b: Record<string, unknown> = {};
    b["select"] = (cols: string) => {
      columns = cols;
      return b;
    };
    b["order"] = () => b;
    b["range"] = () => b;
    b["then"] = (resolve: (r: Reply) => unknown, reject: (e: unknown) => unknown) => {
      if (table === "guest_groups") groupReads.push(columns);
      const reply = table === "guest_groups" ? groups(columns) : { data: [], error: null };
      return Promise.resolve(reply).then(resolve, reject);
    };
    return b;
  };
  return { db: { from } as unknown as Db, groupReads };
}

const LEGACY_ROW = { id: "g1", name: "Famiglia Rossi", deleted_at: null, version: 3 };

describe("loadGuests on a database before the R-04 migration (REV-12)", () => {
  it("retries the groups without rsvp_mode on 42703: the list still opens, every group together", async () => {
    const { db, groupReads } = fakeDb((cols) =>
      cols.includes("rsvp_mode")
        ? { data: null, error: { code: "42703" } }
        : { data: [LEGACY_ROW], error: null },
    );
    const snapshot = await loadGuests(db);
    expect(groupReads).toHaveLength(2);
    expect(groupReads[0]).toContain("rsvp_mode");
    expect(groupReads[1]).not.toContain("rsvp_mode");
    expect(snapshot.groups).toEqual([
      { id: "g1", name: "Famiglia Rossi", deletedAt: null, version: 3, rsvpMode: "together" },
    ]);
  });

  it("reads rsvp_mode when the column exists", async () => {
    const { db, groupReads } = fakeDb(() => ({
      data: [{ ...LEGACY_ROW, rsvp_mode: "separate" }],
      error: null,
    }));
    expect((await loadGuests(db)).groups[0]?.rsvpMode).toBe("separate");
    expect(groupReads).toHaveLength(1);
  });

  it("any other error code still fails the load (no silent fallback)", async () => {
    const { db, groupReads } = fakeDb(() => ({ data: null, error: { code: "XX000" } }));
    await expect(loadGuests(db)).rejects.toBeInstanceOf(GuestsLoadError);
    expect(groupReads).toHaveLength(1);
  });

  it("a missing table is still not_migrated", async () => {
    const { db } = fakeDb(() => ({ data: null, error: { code: "42P01" } }));
    await expect(loadGuests(db)).rejects.toMatchObject({ code: "not_migrated" });
  });
});
