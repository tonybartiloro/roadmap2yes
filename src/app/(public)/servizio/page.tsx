import type { Metadata } from "next";
import { PublicShell } from "@/components/PublicShell";
import { ServiceDownPage } from "@/components/ServiceDownPage";
import type { DbErrorKind } from "@/lib/supabase/errors";

/**
 * Service paused / unreachable (design §7.3, DES-16). Renders without touching the database:
 * `?motivo=paused|unreachable` (the proxy rewrites here), anything else means "unreachable".
 */
type SearchParams = Promise<{ motivo?: string | string[] }>;

function reasonOf(value: string | string[] | undefined): DbErrorKind {
  return value === "paused" ? "paused" : "unreachable";
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const reason = reasonOf((await searchParams).motivo);
  return {
    title: reason === "paused" ? "L'app è in pausa" : "Servizio non raggiungibile",
    robots: { index: false, follow: false },
  };
}

export default async function ServicePage({ searchParams }: { searchParams: SearchParams }) {
  const reason = reasonOf((await searchParams).motivo);
  return (
    <PublicShell>
      <ServiceDownPage reason={reason} />
    </PublicShell>
  );
}
