import { beforeAll, describe, expect, it } from "vitest";
import { saveTheme } from "@/features/appearance/data";
import {
  addPartnerB,
  createWedding,
  type TestPartnerB,
  type TestWedding,
} from "../support/supabase";

/**
 * T15 Aspetto: the theme is saved on the wedding with the user's own client (RLS and the column
 * grant decide), and both partners then read the same value (AC49).
 */
describe("Aspetto (T15) on the local stack", () => {
  let wedding: TestWedding;
  let other: TestWedding;
  let partnerB: TestPartnerB;

  const themeOf = async (client: TestWedding["founderClient"]) => {
    const { data } = await client.from("weddings").select("theme_id").limit(1).maybeSingle();
    return data?.theme_id;
  };

  beforeAll(async () => {
    wedding = await createWedding();
    partnerB = await addPartnerB(wedding);
    other = await createWedding("sposa");
  });

  it("saves an approved theme on the wedding and the other partner sees it", async () => {
    expect(await saveTheme(wedding.founderClient, "sera")).toEqual({ ok: true });
    expect(await themeOf(wedding.founderClient)).toBe("sera");
    expect(await themeOf(partnerB.client)).toBe("sera");
  });

  it("lets partner B change it too, and leaves another wedding alone", async () => {
    expect(await saveTheme(partnerB.client, "giardino")).toEqual({ ok: true });
    expect(await themeOf(wedding.founderClient)).toBe("giardino");
    expect(await themeOf(other.founderClient)).toBe("giardino");
    expect(await saveTheme(other.founderClient, "sera")).toEqual({ ok: true });
    expect(await themeOf(wedding.founderClient)).toBe("giardino");
  });

  it("refuses a theme that is not approved, without touching the wedding", async () => {
    const result = await saveTheme(wedding.founderClient, "non-esiste");
    expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(await themeOf(wedding.founderClient)).toBe("giardino");
  });
});
