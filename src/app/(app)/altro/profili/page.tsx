import type { Metadata } from "next";
import Link from "next/link";
import { pageContext } from "@/features/onboarding/server";
import { loadProfiles } from "@/features/settings/data";
import { ProfilesView } from "@/features/settings/ProfilesView";

export const metadata: Metadata = { title: "Profili" };

/**
 * Altro > Profili (AC46, AC58): the data of both partners. Names and labels: either partner edits
 * both. Emails: your own is your login (change it in "Il tuo accesso"); the partner's only until
 * they have entered.
 */
export default async function ProfilesPage() {
  const { db, userId } = await pageContext();
  const view = await loadProfiles(db, userId);
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="font-heading text-[28px] leading-9">Profili</h1>
      <ProfilesView view={view} scope={`${userId}:${view.me.id}`} />
      <p>
        <Link href="/altro" className="text-primary underline underline-offset-4">
          Torna ad Altro
        </Link>
      </p>
    </div>
  );
}
