import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { derivePartnerState, type InvitationSummary, type PartnerState } from "./panel-state";

/** What Altro > Invito shows. Everything is read with the USER's client (RLS): never the token. */
export type PartnerPerson = {
  slot: "A" | "B";
  email: string;
  firstName: string | null;
  lastName: string | null;
  label: string | null;
  joined: boolean;
};

export type InvitePanelData = {
  selfSlot: "A" | "B";
  /** The OTHER partner (the one invited / given a temporary code); null while there is no row. */
  partner: PartnerPerson | null;
  invitation: InvitationSummary | null;
  state: PartnerState;
};

type PartnerRow = {
  slot: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  label: string | null;
  user_id: string | null;
};

type InvitationRow = {
  id: string;
  email: string;
  method: string;
  expires_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
};

export async function loadInvitePanel(
  db: SupabaseClient,
  selfId: string,
  now: Date,
): Promise<InvitePanelData | null> {
  const membership = await db
    .from("memberships")
    .select("partner_slot")
    .eq("user_id", selfId)
    .limit(1);
  const slot = (membership.data as { partner_slot: string | null }[] | null)?.[0]?.partner_slot;
  if (slot !== "A" && slot !== "B") return null;

  const partners = await db
    .from("wedding_partners")
    .select("slot,email,first_name,last_name,label,user_id");
  const rows = (partners.data as PartnerRow[] | null) ?? [];
  const other = rows.find((row) => row.slot !== slot);

  const invitations = await db
    .from("invitations")
    .select("id,email,method,expires_at,accepted_at,revoked_at")
    .order("created_at", { ascending: false })
    .limit(1);
  const last = ((invitations.data as InvitationRow[] | null) ?? [])[0];
  const invitation: InvitationSummary | null = last
    ? {
        id: last.id,
        email: last.email,
        method: last.method === "email" ? "email" : "code",
        expiresAt: last.expires_at,
        acceptedAt: last.accepted_at,
        revokedAt: last.revoked_at,
      }
    : null;

  const partner: PartnerPerson | null = other
    ? {
        slot: other.slot === "A" ? "A" : "B",
        email: other.email,
        firstName: other.first_name,
        lastName: other.last_name,
        label: other.label,
        joined: other.user_id !== null,
      }
    : null;

  return {
    selfSlot: slot,
    partner,
    invitation,
    state: derivePartnerState({
      selfSlot: slot,
      partnerJoined: partner?.joined ?? false,
      invitation,
      now,
    }),
  };
}
