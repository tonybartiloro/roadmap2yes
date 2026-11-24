"use client";

import { ErrorState } from "@/components/ErrorState";
import { classifyDbError } from "@/lib/supabase/errors";

/** Inline error of Esportazione ("Non riesco a preparare il file"). Outages go to the root boundary. */
export default function EsportaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (classifyDbError(error)) throw error;
  return (
    <ErrorState
      title="Non riesco a preparare il file"
      description="I tuoi dati sono al sicuro. Riprova tra un attimo."
      onRetry={reset}
    />
  );
}
