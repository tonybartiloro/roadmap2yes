import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ServiceDownPage } from "@/components/ServiceDownPage";
import { clientIp } from "@/features/auth/limiter-keys";
import { rsvpLoadPage } from "@/features/rsvp/public-rpc";
import { submitRsvp } from "@/features/rsvp/public-actions";
import { RsvpForm } from "@/features/rsvp/public/RsvpForm";
import { RsvpShell } from "@/features/rsvp/public/RsvpShell";
import { dateText, locationText } from "@/features/rsvp/public/format";
import { isRsvpTokenShape } from "@/features/rsvp/token";
import { getNow } from "@/lib/clock";

/**
 * Static on purpose: the preview and the tab never carry names (design §1.1), and there is no image.
 * No `loading.tsx` in this segment: it would turn the 404 into a 200 (Next 16, `notFound()`).
 */
export const metadata: Metadata = {
  title: { absolute: "Conferma la tua presenza" },
  description: "Ci vuole un minuto",
  robots: { index: false, follow: false },
  openGraph: { title: "Conferma la tua presenza", description: "Ci vuole un minuto" },
};

/**
 * Guest page (ADR-0003). The token is shape-checked before any DB call; every link that does not
 * work (unknown, revoked, expired, no recipient) is the same `notFound()`: 404 and the neutral view.
 * `rsvp_page` never writes except a failed lookup, which the DB counts per IP. The proxy sets
 * `Referrer-Policy: no-referrer`, `no-store` and, for a working link, the theme header.
 */
export default async function RsvpPage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  if (!isRsvpTokenShape(token)) notFound();

  const result = await rsvpLoadPage({
    token,
    ip: clientIp(await headers()),
    now: await getNow(),
  });
  if (result.state === "neutral") notFound();
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
