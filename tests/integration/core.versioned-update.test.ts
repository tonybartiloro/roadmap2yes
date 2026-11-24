import { beforeAll, describe, expect, it } from "vitest";
import { versionedUpdate, VersionedUpdateError } from "@/lib/supabase/versioned-update";
import { addPartnerB, createWedding, type TestPartnerB, type TestWedding } from "../support/supabase";

/** Optimistic concurrency (AC40): two partners editing the same wedding row. */
describe("versionedUpdate", () => {
  let wedding: TestWedding;
  let partnerB: TestPartnerB;

  beforeAll(async () => {
    wedding = await createWedding();
    partnerB = await addPartnerB(wedding);
  });

  it("writes when the version matches and returns the new row", async () => {
    const current = await wedding.founderClient.from("weddings").select("version").single();
    const result = await versionedUpdate(wedding.founderClient, "weddings", wedding.weddingId, current.data!.version, {
      style_label: "boho",
    });
    expect(result.conflict).toBe(false);
    if (!result.conflict) {
      expect(result.row.style_label).toBe("boho");
      expect(result.row.version).toBe(current.data!.version + 1);
      expect(result.row.updated_by).toBe(wedding.founder.id);
    }
  });

  it("reports a conflict with author and time instead of overwriting silently", async () => {
    const seen = await wedding.founderClient.from("weddings").select("version").single();
    const stale = seen.data!.version;

    // B saves first.
    const b = await versionedUpdate(partnerB.client, "weddings", wedding.weddingId, stale, { style_label: "classico" });
    expect(b.conflict).toBe(false);

    // A still holds the old version.
    const a = await versionedUpdate(wedding.founderClient, "weddings", wedding.weddingId, stale, { style_label: "moderno" });
    expect(a.conflict).toBe(true);
    if (a.conflict) {
      expect(a.changedBy).toBe(partnerB.user.id);
      expect(a.changedAt).toEqual(expect.any(String));
      expect(a.current?.style_label).toBe("classico");
    }
    const stored = await wedding.founderClient.from("weddings").select("style_label").single();
    expect(stored.data?.style_label).toBe("classico");
  });

  it("'save anyway' = retry with the current version", async () => {
    const stale = 1;
    const conflict = await versionedUpdate(wedding.founderClient, "weddings", wedding.weddingId, stale, { style_label: "moderno" });
    expect(conflict.conflict).toBe(true);
    if (!conflict.conflict) return;
    const retry = await versionedUpdate(wedding.founderClient, "weddings", wedding.weddingId, conflict.current!.version, {
      style_label: "moderno",
    });
    expect(retry.conflict).toBe(false);
  });

  it("two simultaneous saves with the same version: exactly one wins", async () => {
    const { data } = await wedding.founderClient.from("weddings").select("version").single();
    const version = data!.version;
    const results = await Promise.all([
      versionedUpdate(wedding.founderClient, "weddings", wedding.weddingId, version, { comune: "Siena" }),
      versionedUpdate(partnerB.client, "weddings", wedding.weddingId, version, { comune: "Lucca" }),
    ]);
    expect(results.filter((r) => !r.conflict)).toHaveLength(1);
    expect(results.filter((r) => r.conflict)).toHaveLength(1);
  });

  it("a row that is not visible is a conflict with no current row", async () => {
    const other = await createWedding();
    const result = await versionedUpdate(wedding.founderClient, "weddings", other.weddingId, 1, { comune: "Roma" });
    expect(result).toEqual({ conflict: true, current: null, changedBy: null, changedAt: null });
  });

  it("surfaces a refusal that is not a conflict (column grant) as an error", async () => {
    const { data } = await wedding.founderClient.from("weddings").select("version").single();
    await expect(
      versionedUpdate(wedding.founderClient, "weddings", wedding.weddingId, data!.version, {
        applied_reference_date: "2027-09-03",
      } as never),
    ).rejects.toBeInstanceOf(VersionedUpdateError);
  });

  it("works on wedding_partners too (names), and refuses its email", async () => {
    const own = await wedding.founderClient.from("wedding_partners").select("id,version").eq("slot", "A").single();
    const ok = await versionedUpdate(wedding.founderClient, "wedding_partners", own.data!.id, own.data!.version, { first_name: "Anna" });
    expect(ok.conflict).toBe(false);
    await expect(
      versionedUpdate(wedding.founderClient, "wedding_partners", own.data!.id, own.data!.version + 1, { email: "x@example.test" }),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
