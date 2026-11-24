"use client";

import { PublicShell } from "@/components/PublicShell";
import { ErrorState } from "@/components/ErrorState";
import { classifyDbError } from "@/lib/supabase/errors";

/**
 * Inline error of the onboarding with "Riprova". A service outage goes to the root boundary, which
 * shows the "in pausa" / "non raggiungibile" page. What was already confirmed is saved.
 */
export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (classifyDbError(error)) throw error;
  return (
    <PublicShell>
      <ErrorState
        title="Non riesco a mostrarti l'onboarding"
        description="Quello che avevi già confermato è salvato. Riprova."
        onRetry={reset}
      />
    </PublicShell>
  );
}
