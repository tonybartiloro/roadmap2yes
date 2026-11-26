"use client";

import { ErrorState } from "@/components/ErrorState";
import { classifyDbError } from "@/lib/supabase/errors";

/** Unexpected failure inside the app shell, with "Riprova". A service outage goes to the root boundary. */
export default function GuestsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (classifyDbError(error)) throw error;
  return (
    <ErrorState
      title="Non riesco a mostrarti gli invitati"
      description="Quello che avevi salvato non è andato perso. Riprova."
      onRetry={reset}
    />
  );
}
