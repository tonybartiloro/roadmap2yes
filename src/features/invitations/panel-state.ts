/**
 * Which state of "the other partner" Altro > Invito shows (design §3.1.5). Pure: the clock is passed in.
 *   none          no invitation yet (or the step was skipped): form "Invita {nome}"
 *   pending_code  access created with a code, B has not entered yet
 *   pending_email invitation by email waiting (link valid)
 *   expired       invitation by email past its 7 days
 *   revoked       the last invitation was revoked (a new one can be made)
 *   active        the partner has joined (account events and temporary code only)
 */
export type PartnerState =
  "none" | "pending_code" | "pending_email" | "expired" | "revoked" | "active";

export type InvitationSummary = {
  id: string;
  email: string;
  method: "code" | "email";
  expiresAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
};

export function derivePartnerState(input: {
  selfSlot: "A" | "B";
  partnerJoined: boolean;
  /** The most recent invitation, if any. */
  invitation: InvitationSummary | null;
  now: Date;
}): PartnerState {
  if (input.selfSlot === "B" || input.partnerJoined) return "active";
  const { invitation } = input;
  if (!invitation) return "none";
  if (invitation.acceptedAt) return "active";
  if (invitation.revokedAt) return "revoked";
  if (invitation.method === "code") return "pending_code";
  const expires = invitation.expiresAt ? new Date(invitation.expiresAt) : null;
  return expires && expires.getTime() <= input.now.getTime() ? "expired" : "pending_email";
}
