import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import {
  ChangePendingEmailForm,
  CreateWithCodeForm,
  InviteByEmailForm,
  ResendForm,
  RevokeForm,
  TemporaryCodeForm,
} from "@/features/invitations/InviteForms";
import { loadInvitePanel } from "@/features/invitations/load";
import type { PartnerState } from "@/features/invitations/panel-state";
import { getNow } from "@/lib/clock";
import { displayName } from "@/lib/display-name";
import { emailEnabled } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Invito al partner" };

const STATE_LABEL: Record<PartnerState, string> = {
  none: "Nessun invito",
  pending_code: "In attesa",
  pending_email: "In attesa",
  expired: "Scaduto",
  revoked: "Revocato",
  active: "Accettato",
};

const formatDay = (iso: string): string =>
  new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "Europe/Rome" }).format(
    new Date(iso),
  );

/**
 * Altro > Invito partner (AC5, AC57, AC58, design §3.1.5). The state comes from the DB (RLS reads):
 * nothing here authorizes anything, the RPCs behind the forms do. With emails off the invite by email
 * is explained, not offered (AC59); the access with a code is always there.
 */
export default async function InvitePage() {
  await connection();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/accesso");

  const panel = await loadInvitePanel(supabase, userId, await getNow());
  if (!panel) redirect("/su-invito");

  const { partner, invitation, state } = panel;
  const emailOn = emailEnabled();
  const name = displayName(partner ? { firstName: partner.firstName, label: partner.label } : null);
  const defaults = {
    email: partner?.email ?? "",
    firstName: partner?.firstName ?? "",
    lastName: partner?.lastName ?? "",
    label: partner?.label ?? "",
  };
  const subject = {
    email: partner?.email ?? "",
    firstName: partner?.firstName ?? null,
    lastName: partner?.lastName ?? null,
  };
  const canInvite = state === "none" || state === "revoked";
  const pending = state === "pending_code" || state === "pending_email" || state === "expired";

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <h1 className="font-heading text-[28px] leading-9">Invito al partner</h1>

      <section aria-labelledby="invite-section-state" className="flex flex-col gap-2">
        <h2 id="invite-section-state" className="text-xl font-semibold">
          Com&apos;è messo l&apos;invito
        </h2>
        <p className="flex flex-wrap items-center gap-2" data-testid="partner-state">
          <Badge
            variant={state === "active" ? "default" : "outline"}
            data-testid="partner-state-badge"
          >
            {STATE_LABEL[state]}
          </Badge>
          {state === "active" ? <span>{name} è dentro: ha gli stessi permessi tuoi.</span> : null}
          {state === "pending_code" && invitation ? (
            <span>
              L&apos;accesso per {invitation.email} è pronto: aspetta che entri con il codice che
              gli hai dato.
            </span>
          ) : null}
          {state === "pending_email" && invitation?.expiresAt ? (
            <span>
              Invito a {invitation.email}: vale fino al {formatDay(invitation.expiresAt)}.
            </span>
          ) : null}
          {state === "expired" && invitation ? (
            <span>
              L&apos;invito a {invitation.email} è scaduto (valeva 7 giorni). Mandane uno nuovo.
            </span>
          ) : null}
          {state === "revoked" ? <span>L&apos;ultimo invito è stato annullato.</span> : null}
          {state === "none" ? <span>Nessun invito: invita {name}.</span> : null}
        </p>
      </section>

      {canInvite ? (
        <>
          <section aria-labelledby="invite-section-code" className="flex flex-col gap-4">
            <h2 id="invite-section-code" className="text-xl font-semibold">
              Con un codice che gli dai di persona
            </h2>
            <CreateWithCodeForm defaults={defaults} />
          </section>

          <section aria-labelledby="invite-section-email" className="flex flex-col gap-4">
            <h2 id="invite-section-email" className="text-xl font-semibold">
              Con un invito via email
            </h2>
            {emailOn ? (
              <InviteByEmailForm defaults={defaults} />
            ) : (
              <p className="text-muted-foreground" data-testid="invite-email-off">
                Le email sono disattivate, quindi l&apos;invito via email non c&apos;è. Usa il
                codice qui sopra: lo consegni tu di persona.
              </p>
            )}
          </section>
        </>
      ) : null}

      {pending && invitation ? (
        <>
          {state !== "pending_code" && emailOn ? (
            <section aria-labelledby="invite-section-resend" className="flex flex-col gap-4">
              <h2 id="invite-section-resend" className="text-xl font-semibold">
                Invia di nuovo
              </h2>
              <ResendForm invitationId={invitation.id} />
            </section>
          ) : null}
          <section aria-labelledby="invite-section-email-change" className="flex flex-col gap-4">
            <h2 id="invite-section-email-change" className="text-xl font-semibold">
              Cambia l&apos;email
            </h2>
            <ChangePendingEmailForm currentEmail={invitation.email} />
          </section>
          {state === "pending_code" ? (
            <section aria-labelledby="invite-section-temp-code" className="flex flex-col gap-4">
              <h2 id="invite-section-temp-code" className="text-xl font-semibold">
                Codice dimenticato?
              </h2>
              <TemporaryCodeForm partnerName={name} subject={subject} />
            </section>
          ) : null}
          <section aria-labelledby="invite-section-revoke" className="flex flex-col gap-4">
            <h2 id="invite-section-revoke" className="text-xl font-semibold">
              Revoca
            </h2>
            <RevokeForm invitationId={invitation.id} partnerName={name} />
          </section>
        </>
      ) : null}

      {state === "active" && partner ? (
        <section aria-labelledby="invite-section-temp-code" className="flex flex-col gap-4">
          <h2 id="invite-section-temp-code" className="text-xl font-semibold">
            Codice dimenticato?
          </h2>
          <p className="text-muted-foreground">
            Se {name} non ricorda il suo codice, gliene imposti uno temporaneo e glielo dici di
            persona. Lo vedrà tra le novità e dovrà cambiarlo appena entra.
          </p>
          <TemporaryCodeForm partnerName={name} subject={subject} />
        </section>
      ) : null}

      <p>
        <Link href="/altro" className="text-primary underline underline-offset-4">
          Torna ad Altro
        </Link>
      </p>
    </div>
  );
}
