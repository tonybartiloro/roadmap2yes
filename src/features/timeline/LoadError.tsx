"use client";

import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ErrorState";

/** Percorso failed to load: the error card with "Riprova" (design §4). */
export function LoadError() {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-6" data-testid="percorso-error">
      <h1 className="text-[28px] leading-[34px]">Percorso</h1>
      <ErrorState
        title="Non riesco a caricare il Percorso"
        description="Controlla la connessione e riprova tra un attimo."
        onRetry={() => router.refresh()}
      />
    </div>
  );
}
