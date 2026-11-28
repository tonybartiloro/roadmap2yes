import { describe, expect, it } from "vitest";
import type { RsvpLink, RsvpSnapshot } from "@/features/rsvp/view";
import type { GroupView, GuestView } from "./data";
import { buildRsvpModel } from "./rsvp-model";

const NOW = new Date("2027-01-10T10:00:00Z");

let n = 0;
function guest(extra: Partial<GuestView> = {}): GuestView {
  n += 1;
  return {
    id: `g${n}`,
    firstName: `Nome${n}`,
    lastName: "Rossi",
    category: "adult",
    side: null,
    phone: null,
    email: null,
    notes: null,
    groupId: null,
    tableId: null,
    deletedAt: null,
    version: 1,
    ...extra,
  };
}
const group = (id: string, extra: Partial<GroupView> = {}): GroupView => ({
  id,
  name: id,
  deletedAt: null,
  version: 1,
  ...extra,
});
const link = (extra: Partial<RsvpLink>): RsvpLink => ({
  id: "l1",
  groupId: null,
  guestId: null,
  working: true,
  revokedAt: null,
  sharedAt: null,
  createdAt: "2027-01-01T00:00:00Z",
  ...extra,
});
const snap = (extra: Partial<RsvpSnapshot> = {}): RsvpSnapshot => ({
  expiresOn: "2027-10-03",
  links: [],
  resendGuestIds: [],
  responses: [],
  ...extra,
});

describe("buildRsvpModel", () => {
  it("a 'together' group is one recipient; a 'separate' group has no link on its title", () => {
    n = 0;
    const a = guest({ groupId: "t" });
    const b = guest({ groupId: "t" });
    const c = guest({ groupId: "s" });
    const model = buildRsvpModel(
      [a, b, c],
      [group("t"), group("s", { rsvpMode: "separate" })],
      snap({ links: [link({ groupId: "t", sharedAt: "2027-01-08T10:00:00Z" })] }),
      NOW,
    );
    expect(model.groups.get("t")?.line).toBe("Condiviso il 8 gennaio");
    expect(model.groups.get("t")?.recipient?.id).toBe("t");
    expect(model.groups.get("s")).toMatchObject({
      line: "Risponde ognuno per sé",
      recipient: null,
    });
    expect(model.guests.get(a.id)?.link).toBeNull();
    expect(model.guests.get(c.id)?.link?.state).toEqual({ kind: "none" });
  });

  it("a person of a deleted group is a recipient on their own", () => {
    n = 0;
    const a = guest({ groupId: "gone" });
    const model = buildRsvpModel(
      [a],
      [group("gone", { deletedAt: "2027-01-01T00:00:00Z" })],
      snap(),
      NOW,
    );
    expect(model.guests.get(a.id)?.link?.recipient.kind).toBe("guest");
    expect(model.groups.has("gone")).toBe(false);
  });

  it("'Da rimandare' shows on a person and on a group title (AC9)", () => {
    n = 0;
    const a = guest({ groupId: "t" });
    const solo = guest();
    const model = buildRsvpModel(
      [a, solo],
      [group("t")],
      snap({ resendGuestIds: [a.id, solo.id] }),
      NOW,
    );
    expect(model.groups.get("t")?.line).toBe("Da rimandare");
    expect(model.guests.get(solo.id)?.link?.state.kind).toBe("resend");
  });

  it("presence counts and an expired date win over a working link", () => {
    n = 0;
    const a = guest({ groupId: "t" });
    const b = guest({ groupId: "t" });
    const model = buildRsvpModel(
      [a, b],
      [group("t")],
      snap({
        expiresOn: "2026-12-31",
        links: [link({ groupId: "t" })],
        responses: [
          {
            guestId: a.id,
            status: "yes",
            diet: [],
            dietNote: null,
            answeredAt: "2027-01-05T10:00:00Z",
          },
        ],
      }),
      NOW,
    );
    expect(model.groups.get("t")?.summary).toBe("1 sì · 1 in attesa");
    expect(model.groups.get("t")?.state?.kind).toBe("expired");
    expect(model.guests.get(a.id)?.presence).toBe("yes");
    expect(model.guests.get(b.id)?.presence).toBe("pending");
  });
});
