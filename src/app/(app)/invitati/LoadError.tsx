"use client";

import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ErrorState";
import { HelpLink } from "@/components/HelpLink";

/** Invitati failed to load (also: schema not migrated yet): the error card with "Riprova". */
export function LoadError({ notMigrated = false }: { notMigrated?: boolean }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4" data-testid="guests-error">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl leading-8 font-semibold">Invitati</h1>
        <HelpLink route="/invitati" />
      </div>
      <ErrorState
        title="Non riesco a caricare gli invitati"
        description={
          notMigrated
            ? "Gli invitati non sono ancora pronti: riprova tra un minuto."
            : "Quello che avevi salvato non è andato perso. Riprova."
        }
        onRetry={() => router.refresh()}
      />
    </div>
  );
}
