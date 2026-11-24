"use client";

import { ErrorState } from "@/components/ErrorState";
import { classifyDbError } from "@/lib/supabase/errors";

/** Inline error of Impostazioni, inside the shell, with "Riprova". Outages go to the root boundary. */
export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (classifyDbError(error)) throw error;
  return (
    <ErrorState
      title="Non riesco a mostrarti le impostazioni"
      description="Quello che avevi salvato non è andato perso. Riprova."
      onRetry={reset}
    />
  );
}
