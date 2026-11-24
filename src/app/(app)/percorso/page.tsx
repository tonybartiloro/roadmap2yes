import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EmptyState } from "@/components/EmptyState";
import { readEmailConfig } from "@/lib/app-config";
import { getNow } from "@/lib/clock";
import { todayInRome } from "@/lib/dates/plain-date";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { LoadError } from "@/features/timeline/LoadError";
import { PercorsoScreen } from "@/features/timeline/PercorsoScreen";
import { loadPercorsoData } from "@/features/timeline/queries";

export const metadata: Metadata = { title: "Percorso" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Percorso (design §3.4). Dynamic server component: it reads the session and the clock, loads the
 * data with the user's JWT (RLS is the only authorization) and hands it to the client screen.
 * `?anteprima=<option id>` is the preview state (design §3.8); it never writes anything.
 */
export default async function PercorsoPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const raw = params["anteprima"];
  const previewId = typeof raw === "string" && raw.length > 0 && raw.length <= 64 ? raw : null;

  const supabase = (await createClient()) as unknown as SupabaseClient<Database>;
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) redirect("/accesso");

  let data;
  try {
    data = await loadPercorsoData(supabase, userId);
  } catch {
    return <LoadError />;
  }
  if (!data) {
    return (
      <EmptyState
        title="Il tuo spazio non è ancora pronto."
        description="Finisci prima i passi iniziali: poi qui compare il tuo Percorso."
      />
    );
  }

  const today = todayInRome(await getNow());
  return (
    <PercorsoScreen
      data={data}
      today={today}
      previewId={previewId}
      emailEnabled={readEmailConfig().enabled}
    />
  );
}
