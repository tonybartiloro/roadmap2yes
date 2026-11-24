"use client";

import { ErrorState } from "@/components/ErrorState";
import { ServiceDownPage } from "@/components/ServiceDownPage";
import { PublicShell } from "@/components/PublicShell";
import { classifyDbError } from "@/lib/supabase/errors";

/**
 * Error boundary of the route tree. An infrastructure outage that surfaced while rendering shows
 * the service page (no data); anything else a generic error with "Riprova".
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const outage = classifyDbError(error);
  if (outage) {
    return (
      <PublicShell>
        <ServiceDownPage reason={outage} />
      </PublicShell>
    );
  }
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <ErrorState
        title="Qualcosa non è andato come doveva"
        description="Non hai perso nulla di quello che era già salvato. Riprova."
        onRetry={reset}
      />
    </main>
  );
}
