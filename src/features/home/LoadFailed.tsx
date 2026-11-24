"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ErrorState } from "@/components/ErrorState";

/** The Home could not even start loading (not an outage: that goes to the service page). */
export function LoadFailed() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <ErrorState
      title="Non riesco a mostrarti la home"
      description="Quello che avevi salvato non è andato perso. Riprova."
      onRetry={() => startTransition(() => router.refresh())}
    />
  );
}
