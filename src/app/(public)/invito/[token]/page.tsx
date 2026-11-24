import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PublicShell } from "@/components/PublicShell";
import { Button } from "@/components/ui/button";
import { peekInviteToken, type InvitePeek } from "@/features/accounts/admin-ops";
import { UNAVAILABLE } from "@/features/auth/messages";
import { AcceptInviteForm } from "@/features/invitations/AcceptInviteForm";
import {
  INVITE_LINK_ACTION,
  INVITE_LINK_INVALID,
  INVITE_USED_HINT,
} from "@/features/invitations/messages";
import { hashInviteToken, isTokenShape } from "@/features/invitations/token";

export const metadata: Metadata = {
  title: "Il tuo invito",
  robots: { index: false, follow: false },
};

/**
 * Invite link (plan §4.5.2). GET changes nothing (mail scanners open links): it only says whether the
 * link can be used and by whom it was made. The one-time token is consumed by the POST of the form
 * (`acceptInviteAction`). One neutral text for every unusable link (expired, used, revoked, wrong
 * account): the DB gives one answer for all of them, on purpose (no enumeration of invitations).
 * The proxy sends `Referrer-Policy: no-referrer` on `/invito/*`.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const peek: InvitePeek = isTokenShape(token)
    ? await peekInviteToken(hashInviteToken(token))
    : { ok: false, error: "invalid_link" };

  if (peek.ok) {
    return (
      <PublicShell>
        <h1 className="font-heading mb-2 text-[28px] leading-9" data-testid="invite-title">
          {peek.inviterName
            ? `${peek.inviterName} ti ha invitato a organizzare il matrimonio insieme.`
            : "Ti hanno invitato a organizzare il matrimonio insieme."}
        </h1>
        <p className="text-muted-foreground mb-6">Scegli il tuo codice: da ora entri con quello.</p>
        <AcceptInviteForm token={token} maskedEmail={peek.maskedEmail} />
      </PublicShell>
    );
  }

  if (peek.error !== "invalid_link") {
    return (
      <PublicShell>
        <h1 className="font-heading mb-4 text-[28px] leading-9">Un attimo</h1>
        <p className="text-muted-foreground mb-8" data-testid="invite-unavailable">
          {UNAVAILABLE}
        </p>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <h1 className="font-heading mb-4 text-[28px] leading-9">Invito non valido</h1>
      <p className="mb-2" data-testid="invite-invalid">
        {INVITE_LINK_INVALID}
      </p>
      <p className="text-muted-foreground mb-8">
        {INVITE_LINK_ACTION} {INVITE_USED_HINT}
      </p>
      <Button asChild size="lg">
        <Link href="/accesso">Vai al login</Link>
      </Button>
    </PublicShell>
  );
}
