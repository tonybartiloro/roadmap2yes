import type { Metadata } from "next";
import { LinkUnavailable } from "@/features/rsvp/public/LinkUnavailable";
import { RsvpShell } from "@/features/rsvp/public/RsvpShell";

/** The same tab title as the live page: nothing tells a dead link from a working one. */
export const metadata: Metadata = {
  title: { absolute: "Conferma la tua presenza" },
  robots: { index: false, follow: false },
};

/**
 * The neutral page (AC6): the same for every link that does not work, default theme, no name, date
 * or brand, no button, no link to the login. Next sends it with status 404 and `noindex`.
 */
export default function RsvpNotFound() {
  return (
    <RsvpShell>
      <LinkUnavailable />
    </RsvpShell>
  );
}
