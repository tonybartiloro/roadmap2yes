import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ServiceDownPage } from "@/components/ServiceDownPage";
import { clientIp } from "@/features/auth/limiter-keys";
import { rsvpLoadPage } from "@/features/rsvp/public-rpc";
import { submitRsvp } from "@/features/rsvp/public-actions";
import { LinkUnavailable } from "@/features/rsvp/public/LinkUnavailable";
import { RsvpForm } from "@/features/rsvp/public/RsvpForm";
import { RsvpShell } from "@/features/rsvp/public/RsvpShell";
import { dateText, locationText } from "@/features/rsvp/public/format";
import { isRsvpTokenShape } from "@/features/rsvp/token";
import { getNow } from "@/lib/clock";

/**
 * Static on purpose: the preview and the tab never carry names (design §1.1), and there is no image.
 * There is no `not-found.tsx` and no `notFound()` here: the 404 of a dead link is answered by the
 * proxy with a script-free body (Arbitrato S3).
 */
export const metadata: Metadata = {
  title: { absolute: "Conferma la tua presenza" },
  description: "Ci vuole un minuto",
  robots: { index: false, follow: false },
  openGraph: { title: "Conferma la tua presenza", description: "Ci vuole un minuto" },
};

/**
 * Guest page (ADR-0003). The token is shape-checked before any DB call. A link that does not work
 * normally never gets here (the proxy answers the neutral 404); if it does (the proxy gate timed
 * out, or a race), the same neutral view is rendered with status 200. `rsvp_page` never writes
 * except a failed lookup, which the DB counts per IP. The proxy sets `Referrer-Policy:
 * no-referrer`, `no-store` and, for a working link, the theme header.
 */
export default async function RsvpPage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const neutral = (
    <RsvpShell>
      <LinkUnavailable />
    </RsvpShell>
  );
  if (!isRsvpTokenShape(token)) return neutral;

  const result = await rsvpLoadPage({
    token,
    ip: clientIp(await headers()),
    now: await getNow(),
  });
  if (result.state === "neutral") return neutral;
  if (result.state === "retry") {
    return (
      <RsvpShell>
        <ServiceDownPage reason="unreachable" />
      </RsvpShell>
    );
  }

  const { page } = result;
  return (
    <RsvpShell>
      <RsvpForm
        action={submitRsvp.bind(null, token)}
        couple={page.couple}
        dateLabel={dateText(page.date)}
        locationLabel={locationText(page.location)}
        people={page.people}
      />
    </RsvpShell>
  );
}
