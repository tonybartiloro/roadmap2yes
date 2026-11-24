"use client";

import { ErrorState } from "@/components/ErrorState";
import { classifyDbError } from "@/lib/supabase/errors";

/** Inline error of Profili, inside the shell, with "Riprova". Outages go to the root boundary. */
export default function ProfilesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (classifyDbError(error)) throw error;
  return (
    <ErrorState
      title="Non riesco a mostrarti i profili"
      description="Quello che avevi salvato non è andato perso. Riprova."
      onRetry={reset}
    />
  );
}
