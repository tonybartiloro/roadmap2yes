import { describe, expect, it } from "vitest";
import type { GroupView, GuestView } from "@/features/guests/data";
import {
  createAllTargets,
  greetingNames,
  groupAccessibleName,
  isExpired,
  linkOf,
  linkState,
  linkStateText,
  presenceSummary,
  recipientsOf,
  resendNames,
  whatsappHref,
  whatsappText,
  type RsvpLink,
  type RsvpSnapshot,
} from "./view";

const guest = (id: string, groupId: string | null, extra: Partial<GuestView> = {}): GuestView => ({
  id,
  firstName: id.toUpperCase(),
  lastName: "Rossi",
  category: "adult",
  side: null,
  phone: null,
  email: null,
  notes: null,
  groupId,
  tableId: null,
  deletedAt: null,
  version: 1,
  ...extra,
});
const group = (id: string, rsvpMode: "together" | "separate" = "together", deleted = false) =>
  ({
    id,
    name: `G ${id}`,
    deletedAt: deleted ? "2027-01-01T00:00:00Z" : null,
    version: 1,
    rsvpMode,
  }) as GroupView;
const link = (extra: Partial<RsvpLink>): RsvpLink => ({
  id: "l",
  groupId: null,
  guestId: null,
  working: true,
  revokedAt: null,
  sharedAt: null,
  createdAt: "2027-01-01T00:00:00Z",
  ...extra,
});
const snap = (extra: Partial<RsvpSnapshot> = {}): RsvpSnapshot => ({
  expiresOn: null,
  links: [],
  resendGuestIds: [],
  responses: [],
  ...extra,
});
const NOW = new Date("2027-06-01T10:00:00Z");

describe("recipientsOf", () => {
  it("makes one recipient per together group, one per loose person", () => {
    const out = recipientsOf(
      [guest("a", "g1"), guest("b", "g1"), guest("c", null), guest("d", "g2")],
      [group("g1"), group("g2", "separate")],
    );
    expect(out.map((r) => [r.kind, r.id, r.memberIds])).toEqual([
      ["group", "g1", ["a", "b"]],
      ["guest", "c", ["c"]],
      ["guest", "d", ["d"]],
    ]);
  });
  it("a deleted group means no group; deleted people and empty groups are not recipients", () => {
    const out = recipientsOf(
      [guest("a", "g1"), guest("b", "g2", { deletedAt: "2027-01-01T00:00:00Z" })],
      [group("g1", "together", true), group("g2"), group("g3")],
    );
    expect(out.map((r) => [r.kind, r.id])).toEqual([["guest", "a"]]);
  });
  it("treats a group without rsvpMode as together", () => {
    const g = { id: "g1", name: "G", deletedAt: null, version: 1 } as GroupView;
    expect(recipientsOf([guest("a", "g1")], [g])[0]).toMatchObject({ kind: "group" });
  });
});

describe("linkState precedence", () => {
  const [r] = recipientsOf([guest("a", "g1"), guest("b", "g1")], [group("g1")]);
  const recipient = r!;
  const working = link({ id: "l1", groupId: "g1" });

  it("Scaduto comes first, whatever else is true", () => {
    const state = linkState(
      recipient,
      snap({
        expiresOn: "2027-05-31",
        links: [{ ...working, sharedAt: "2027-01-01T10:00:00Z" }],
        resendGuestIds: ["a"],
      }),
      NOW,
    );
    expect(state).toEqual({ kind: "expired", on: "2027-05-31" });
    expect(linkStateText(state)).toBe("Scaduto il 31 maggio 2027");
  });
  it("the expiry day itself still works (Europe/Rome day)", () => {
    expect(isExpired("2027-06-01", new Date("2027-06-01T21:59:59Z"))).toBe(false);
    expect(isExpired("2027-06-01", new Date("2027-06-01T22:00:00Z"))).toBe(true);
    expect(isExpired(null, NOW)).toBe(false);
  });
  it("a working link is Da condividere or Condiviso il", () => {
    expect(linkState(recipient, snap({ links: [working] }), NOW)).toEqual({ kind: "to_share" });
    const shared = linkState(
      recipient,
      snap({ links: [{ ...working, sharedAt: "2027-03-12T10:00:00Z" }] }),
      NOW,
    );
    expect(linkStateText(shared)).toBe("Condiviso il 12 marzo");
  });
  it("a working link wins over Da rimandare", () => {
    expect(linkState(recipient, snap({ links: [working], resendGuestIds: ["a"] }), NOW).kind).toBe(
      "to_share",
    );
  });
  it("Da rimandare when someone was sent a link that no longer covers them", () => {
    const dormant = link({ id: "l1", groupId: "g1", working: false });
    expect(
      linkState(recipient, snap({ links: [dormant], resendGuestIds: ["b", "zz"] }), NOW),
    ).toEqual({
      kind: "resend",
      guestIds: ["b"],
    });
    expect(linkStateText({ kind: "resend", guestIds: ["b"] })).toBe("Da rimandare");
  });
  it("a revoked link is no link", () => {
    const revoked = link({ groupId: "g1", revokedAt: "2027-02-01T00:00:00Z" });
    expect(linkOf(recipient, [revoked])).toBeNull();
    expect(linkState(recipient, snap({ links: [revoked] }), NOW)).toEqual({ kind: "none" });
    expect(linkStateText({ kind: "none" })).toBe("Nessun link");
  });
});

describe("presenceSummary", () => {
  const responses = [
    { guestId: "a", status: "yes" as const, diet: [], dietNote: null, answeredAt: "x" },
    { guestId: "b", status: "yes" as const, diet: [], dietNote: null, answeredAt: "x" },
    { guestId: "c", status: "no" as const, diet: [], dietNote: null, answeredAt: "x" },
  ];
  it("says '2 sì · 1 in attesa' and leaves zeros out", () => {
    expect(presenceSummary(["a", "b", "d"], responses)).toBe("2 sì · 1 in attesa");
    expect(presenceSummary(["a", "b"], responses)).toBe("2 sì");
    expect(presenceSummary(["a", "c", "d"], responses)).toBe("1 sì · 1 no · 1 in attesa");
    expect(presenceSummary([], responses)).toBe("");
  });
  it("builds the accessible name of a group", () => {
    expect(
      groupAccessibleName("Famiglia Rossi", "2 sì · 1 in attesa", {
        kind: "shared",
        sharedAt: "2027-03-12T10:00:00Z",
      }),
    ).toBe("Famiglia Rossi, 2 sì, 1 in attesa, link condiviso il 12 marzo");
  });
});

describe("createAllTargets", () => {
  const recipients = recipientsOf(
    [guest("a", "g1"), guest("b", null), guest("c", null)],
    [group("g1")],
  );
  it("counts recipients without a non-revoked link, Da rimandare included", () => {
    const s = snap({ links: [link({ groupId: "g1" })], resendGuestIds: ["b"] });
    expect(createAllTargets(recipients, s, NOW).recipients.map((r) => r.id)).toEqual(["b", "c"]);
  });
  it("is disabled after the expiry", () => {
    expect(createAllTargets(recipients, snap({ expiresOn: "2027-05-01" }), NOW).disabled).toBe(
      true,
    );
    expect(createAllTargets(recipients, snap(), NOW).disabled).toBe(false);
  });
});

describe("WhatsApp text", () => {
  const input = { couple: ["Tony", "Jessica"], url: "https://x.test/rsvp/T" };
  it("greets 1, 2 and 3 first names", () => {
    expect(greetingNames(["Anna"])).toBe("Anna");
    expect(greetingNames(["Anna", "Luca"])).toBe("Anna e Luca");
    expect(whatsappText({ ...input, firstNames: ["Anna", "Luca", "Sara"] })).toBe(
      "Ciao Anna, Luca e Sara! Tony e Jessica si sposano e vorrebbero sapere se ci sarete. Rispondi da qui, ci vuole un minuto: https://x.test/rsvp/T",
    );
  });
  it("with 4 people or none says 'Ciao a tutti!'", () => {
    expect(whatsappText({ ...input, firstNames: ["A", "B", "C", "D"] })).toMatch(/^Ciao a tutti! /);
    expect(whatsappText({ ...input, firstNames: [] })).toMatch(/^Ciao a tutti! /);
  });
  it("encodes special characters in the href", () => {
    const href = whatsappHref(whatsappText({ ...input, firstNames: ["Zoë"] }));
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(href).toContain("Zo%C3%AB");
    expect(href).toContain("%3A%20https%3A%2F%2Fx.test%2Frsvp%2FT");
    expect(href).not.toMatch(/[ ?&]text=.*[ &]/);
  });
  it("lists the names of the people to resend to", () => {
    expect(resendNames(["a", "zz"], [guest("a", null)])).toEqual(["A Rossi"]);
  });
});
