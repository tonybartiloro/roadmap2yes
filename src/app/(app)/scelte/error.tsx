"use client";

import { ErrorState } from "@/components/ErrorState";
import { classifyDbError } from "@/lib/supabase/errors";

/**
 * Inline error of Scelte, inside the app shell, with "Riprova". A service outage is handed to the
 * root boundary, which shows the "L'app è in pausa" / "non raggiungibile" page.
 */
export default function ScelteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (classifyDbError(error)) throw error;
  return (
    <ErrorState
      title="Non riesco a mostrarti le scelte"
      description="Quello che avevi salvato non è andato perso. Riprova."
      onRetry={reset}
    />
  );
}
