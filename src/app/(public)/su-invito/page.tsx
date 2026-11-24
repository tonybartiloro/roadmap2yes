import type { Metadata } from "next";
import { connection } from "next/server";
import { PublicShell } from "@/components/PublicShell";
import { SignOutButton } from "@/features/auth/SignOutButton";

export const metadata: Metadata = {
  title: "Su invito",
  robots: { index: false, follow: false },
};

/**
 * "Questo spazio è su invito" (AC3): the screen of a signed-in person without a space. It shows no
 * data and offers no creation. The proxy sends members to the Home and the founder never gets here
 * (the post-login steps create their space).
 */
export default async function InviteOnlyPage() {
  await connection();
  return (
    <PublicShell>
      <h1 className="font-heading mb-4 text-[28px] leading-9">Questo spazio è su invito</h1>
      <p className="text-muted-foreground mb-8 text-lg" data-testid="invite-only-message">
        Chiedi a chi te l&apos;ha condiviso di mandarti un invito.
      </p>
      <SignOutButton>Esci</SignOutButton>
    </PublicShell>
  );
}
