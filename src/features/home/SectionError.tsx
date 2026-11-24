"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ErrorState } from "@/components/ErrorState";

/** One block of the Home failed to load: a calm card with "Riprova", the rest stays visible. */
export function SectionError({ title }: { title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <ErrorState
      title={title}
      description={
        pending
          ? "Ci riprovo…"
          : "Quello che avevi salvato non è andato perso. Riprova tra un attimo."
      }
      onRetry={() => startTransition(() => router.refresh())}
    />
  );
}
