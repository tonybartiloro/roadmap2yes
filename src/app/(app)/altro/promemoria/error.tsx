"use client";

import { ErrorState } from "@/components/ErrorState";
import { classifyDbError } from "@/lib/supabase/errors";

/** Inline error of Promemoria. A service outage goes to the root boundary. */
export default function PromemoriaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (classifyDbError(error)) throw error;
  return (
    <ErrorState
      title="Non riesco a mostrarti le preferenze"
      description="Le tue scelte non sono andate perse. Riprova."
      onRetry={reset}
    />
  );
}
