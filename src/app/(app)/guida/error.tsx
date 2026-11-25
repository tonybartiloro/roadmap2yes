"use client";

import { ErrorState } from "@/components/ErrorState";

/** Inline error of the Guida (e.g. docs/functional missing from the deploy), with "Riprova". */
export default function GuideError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState title="Non riesco a caricare la Guida." onRetry={reset} />;
}
