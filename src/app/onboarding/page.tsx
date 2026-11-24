import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { loadOnboarding } from "@/features/onboarding/data";
import { OnboardingWizard } from "@/features/onboarding/OnboardingWizard";
import { pageContext } from "@/features/onboarding/server";
import { emailEnabled } from "@/lib/email";

export const metadata: Metadata = { title: "Iniziamo" };

/**
 * Onboarding (AC12-AC15): only the first partner, only while it is not completed. Anyone else goes
 * Home (the proxy has already handled "no membership"). The wizard resumes from the last confirmed
 * step; whether emails are on is read per request.
 */
export default async function OnboardingPage() {
  const { db, userId, today } = await pageContext();
  const state = await loadOnboarding(db, userId);
  if (!state) redirect("/auth/avanti");
  if (state.selfSlot !== "A") redirect("/");
  // A completed onboarding is NOT redirected here: the revalidation after "finish" re-renders this
  // page and a server redirect would tear down the summary. The wizard sends a fresh visit Home.
  return (
    <PublicShell>
      <OnboardingWizard
        initial={state}
        scope={`${userId}:${state.weddingId}`}
        emailOn={emailEnabled()}
        today={today}
      />
    </PublicShell>
  );
}
