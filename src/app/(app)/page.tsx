import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { classifyDbError } from "@/lib/supabase/errors";
import { loadHomeData } from "@/features/home/data";
import { HomeScreen } from "@/features/home/HomeScreen";
import { LoadFailed } from "@/features/home/LoadFailed";
import { pageContext } from "@/features/home/server";

export const metadata: Metadata = { title: "Home" };

/**
 * Home (design §3.3). Dynamic server component: session and clock from the request, data with the
 * user's JWT (RLS is the only authorization). Opening it registers the visit once per session.
 * A paused/unreachable service goes to the root boundary; any other failure shows "Riprova".
 */
export default async function HomePage() {
  const { db, userId, today } = await pageContext();

  let data;
  try {
    data = await loadHomeData(db, userId, { today });
  } catch (error) {
    if (classifyDbError(error)) throw error;
    return <LoadFailed />;
  }
  if (!data) {
    return (
      <EmptyState
        title="Il tuo spazio non è ancora pronto."
        description="Finisci prima i passi iniziali: poi qui compare la tua home."
      />
    );
  }
  return <HomeScreen data={data} />;
}
