import { beforeAll, describe, expect, it } from "vitest";
import { loadPreferences, setPreference } from "@/features/notifications/data";
import {
  addPartnerB,
  createWedding,
  serviceClient,
  type TestPartnerB,
  type TestWedding,
} from "../support/supabase";

/**
 * T15 Promemoria: the two switches are per user (AC52). No row = both on; one switch changes
 * without touching the other; nobody reads or writes the partner's row.
 */
describe("Promemoria (T15) on the local stack", () => {
  let wedding: TestWedding;
  let partnerB: TestPartnerB;
  let aId: string;
  let bId: string;

  beforeAll(async () => {
    wedding = await createWedding();
    partnerB = await addPartnerB(wedding);
    aId = wedding.founder.id;
    bId = partnerB.user.id;
  });

  it("has both switches on while there is no row", async () => {
    expect(await loadPreferences(wedding.founderClient, aId)).toEqual({
      reminders: true,
      digest: true,
    });
  });

  it("creates the row on the first change and keeps the other switch on", async () => {
    const result = await setPreference(wedding.founderClient, aId, "reminders", false);
    expect(result).toEqual({ ok: true, preferences: { reminders: false, digest: true } });
    expect(await loadPreferences(wedding.founderClient, aId)).toEqual({
      reminders: false,
      digest: true,
    });
  });

  it("changes one switch at a time, in both directions", async () => {
    await setPreference(wedding.founderClient, aId, "digest", false);
    expect(await loadPreferences(wedding.founderClient, aId)).toEqual({
      reminders: false,
      digest: false,
    });
    await setPreference(wedding.founderClient, aId, "reminders", true);
    expect(await loadPreferences(wedding.founderClient, aId)).toEqual({
      reminders: true,
      digest: false,
    });
  });

  it("keeps the partner's choices apart (each decides for themselves)", async () => {
    expect(await loadPreferences(partnerB.client, bId)).toEqual({ reminders: true, digest: true });
    await setPreference(partnerB.client, bId, "digest", true);
    expect(await loadPreferences(wedding.founderClient, aId)).toEqual({
      reminders: true,
      digest: false,
    });
    const rows = await serviceClient()
      .from("notification_preferences")
      .select("user_id")
      .eq("wedding_id", wedding.weddingId);
    expect(rows.data?.map((r) => r.user_id).sort()).toEqual([aId, bId].sort());
  });

  it("never lets a person see or change the other's row", async () => {
    await setPreference(partnerB.client, bId, "reminders", false);
    // A reads B's row by id: RLS shows nothing, and the answer is the defaults.
    const peek = await wedding.founderClient
      .from("notification_preferences")
      .select("user_id")
      .eq("user_id", bId);
    expect(peek.data).toEqual([]);
    // A tries to write B's row: nothing changes.
    await wedding.founderClient
      .from("notification_preferences")
      .update({ reminders_enabled: true })
      .eq("user_id", bId);
    const stored = await serviceClient()
      .from("notification_preferences")
      .select("reminders_enabled")
      .eq("user_id", bId)
      .single();
    expect(stored.data?.reminders_enabled).toBe(false);
    // A cannot create a row in B's name either.
    const forged = await wedding.founderClient.from("notification_preferences").insert({
      user_id: bId,
      wedding_id: wedding.weddingId,
      reminders_enabled: true,
    });
    expect(forged.error).not.toBeNull();
  });
});
