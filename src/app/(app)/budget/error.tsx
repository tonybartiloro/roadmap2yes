"use client";

import { ErrorState } from "@/components/ErrorState";
import { classifyDbError } from "@/lib/supabase/errors";

/**
 * Inline error of Budget, inside the app shell, with "Riprova". A service outage is handed to the
 * root boundary, which shows the "L'app è in pausa" / "non raggiungibile" page.
 */
export default function BudgetError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (classifyDbError(error)) throw error;
  return (
    <ErrorState
      title="Non riesco a mostrarti il budget"
      description="Quello che avevi salvato non è andato perso. Riprova."
      onRetry={reset}
    />
  );
}
