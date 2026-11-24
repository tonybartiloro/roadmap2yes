import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  anonClient,
  addPartnerB,
  createWedding,
  type TestClient,
  type TestPartnerB,
  type TestWedding,
} from "../support/supabase";

/**
 * T10: the settings server actions are the trust boundary: zod, session, data layer and RLS run for
 * real; only the cookie client and `revalidatePath` are replaced.
 */
const state = vi.hoisted(() => ({ client: null as unknown, revalidate: [] as unknown[][] }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => {
    state.revalidate.push(args);
  },
}));

import { savePersonAction, saveSettingsAction } from "@/features/settings/actions";
import { loadProfiles, loadSettings, type Db } from "@/features/settings/data";

let wedding: TestWedding;
let partnerB: TestPartnerB;

const body = (version: number, patch: Record<string, unknown> = {}) => ({
  version,
  rite: "civile",
  guestBand: "80_120",
  styleLabel: "Moderno",
  styleNote: "  Linee pulite  ",
  region: "Veneto",
  comune: "Verona",
  ...patch,
});

beforeAll(async () => {
  wedding = await createWedding();
  partnerB = await addPartnerB(wedding);
});

beforeEach(() => {
  state.client = wedding.founderClient as TestClient;
  state.revalidate = [];
});

describe("settings server actions", () => {
  it("rejects malformed input before touching the database", async () => {
    const version = (await loadSettings(wedding.founderClient as unknown as Db, wedding.founder.id))
      .version;
    const bad = [
      await saveSettingsAction(body(version, { rite: "pagano" })),
      await saveSettingsAction(body(version, { region: "Atlantide" })),
      await saveSettingsAction(body(0)),
      await saveSettingsAction(body(version, { styleNote: "x".repeat(501) })),
      await saveSettingsAction({}),
      await savePersonAction({ partnerId: "no", version: 1 }),
    ];
    for (const result of bad) expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(state.revalidate).toEqual([]);
  });

  it("without a session nothing is written and nothing is revalidated", async () => {
    state.client = anonClient();
    const result = await saveSettingsAction(body(1));
    expect(result).toMatchObject({ ok: false, code: "session" });
    expect(state.revalidate).toEqual([]);
  });

  it("a save trims the text and revalidates only Impostazioni, Percorso and Home", async () => {
    const db = wedding.founderClient as unknown as Db;
    const { version } = await loadSettings(db, wedding.founder.id);
    const result = await saveSettingsAction(body(version));
    expect(result).toMatchObject({ ok: true });
    expect(state.revalidate).toEqual([["/altro/impostazioni"], ["/percorso"], ["/"]]);
    expect(await loadSettings(db, wedding.founder.id)).toMatchObject({
      rite: "civile",
      styleNote: "Linee pulite",
      comune: "Verona",
    });
  });

  it("a stale save is a conflict and revalidates nothing", async () => {
    const db = wedding.founderClient as unknown as Db;
    const { version } = await loadSettings(db, wedding.founder.id);
    state.client = partnerB.client as TestClient;
    expect(await saveSettingsAction(body(version, { comune: "Padova" }))).toMatchObject({
      ok: true,
    });
    state.client = wedding.founderClient as TestClient;
    state.revalidate = [];
    const stale = await saveSettingsAction(body(version, { comune: "Treviso" }));
    expect(stale).toMatchObject({ ok: false, code: "conflict" });
    expect(state.revalidate).toEqual([]);
    expect((await loadSettings(db, wedding.founder.id)).comune).toBe("Padova");
  });

  it("a person is saved with an email ignored and the people pages revalidated", async () => {
    const profiles = await loadProfiles(wedding.founderClient as unknown as Db, wedding.founder.id);
    const result = await savePersonAction({
      partnerId: profiles.me.id,
      version: profiles.me.version,
      firstName: " Anna ",
      lastName: "",
      label: "sposa",
      email: "intruso@example.test",
    });
    expect(result).toMatchObject({ ok: true });
    expect(state.revalidate).toEqual([["/altro/profili"], ["/altro/invito"], ["/"], ["/percorso"]]);
    const after = await loadProfiles(wedding.founderClient as unknown as Db, wedding.founder.id);
    expect(after.me).toMatchObject({ firstName: "Anna", lastName: null, label: "sposa" });
    expect(after.me.email).toBe(wedding.founder.email);
  });
});
