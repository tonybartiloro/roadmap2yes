import { describe, expect, it } from "vitest";
import { derivePartnerState, type InvitationSummary } from "./panel-state";

const NOW = new Date("2026-12-01T10:00:00Z");

const invitation = (patch: Partial<InvitationSummary> = {}): InvitationSummary => ({
  id: "00000000-0000-4000-8000-000000000001",
  email: "b@example.test",
  method: "code",
  expiresAt: null,
  acceptedAt: null,
  revokedAt: null,
  ...patch,
});

const derive = (
  invitationValue: InvitationSummary | null,
  extra: { selfSlot?: "A" | "B"; partnerJoined?: boolean } = {},
) =>
  derivePartnerState({
    selfSlot: extra.selfSlot ?? "A",
    partnerJoined: extra.partnerJoined ?? false,
    invitation: invitationValue,
    now: NOW,
  });

describe("derivePartnerState", () => {
  it("none without an invitation", () => {
    expect(derive(null)).toBe("none");
  });

  it("pending_code for a code invitation, whatever the date", () => {
    expect(derive(invitation())).toBe("pending_code");
  });

  it("pending_email until the expiry instant, expired from then on", () => {
    const email = { method: "email" as const };
    expect(derive(invitation({ ...email, expiresAt: "2026-12-01T10:00:01Z" }))).toBe(
      "pending_email",
    );
    expect(derive(invitation({ ...email, expiresAt: "2026-12-01T10:00:00Z" }))).toBe("expired");
    expect(derive(invitation({ ...email, expiresAt: "2026-11-30T10:00:00Z" }))).toBe("expired");
  });

  it("revoked, and active once accepted or when the partner joined", () => {
    expect(derive(invitation({ revokedAt: "2026-11-30T10:00:00Z" }))).toBe("revoked");
    expect(derive(invitation({ acceptedAt: "2026-11-30T10:00:00Z" }))).toBe("active");
    expect(derive(null, { partnerJoined: true })).toBe("active");
  });

  it("is always active when the viewer is partner B (A is already in)", () => {
    expect(derive(null, { selfSlot: "B" })).toBe("active");
  });
});
