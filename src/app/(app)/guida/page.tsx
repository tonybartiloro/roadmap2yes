import type { Metadata } from "next";
import { FocusHeading } from "@/features/guide/FocusHeading";
import { GUIDE_TITLE_ID } from "@/features/guide/GuideMarkdown";
import { GuideIndex } from "@/features/guide/GuideIndex";
import { loadGuide } from "@/features/guide/source";

export const metadata: Metadata = { title: "Guida" };

/** Guida: one card per row of the README table in docs/functional, in its order. */
export default async function GuidePage() {
  const { index } = await loadGuide();
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <FocusHeading targetId={GUIDE_TITLE_ID} />
      <div className="flex flex-col gap-2">
        <h1
          id={GUIDE_TITLE_ID}
          tabIndex={-1}
          className="font-heading text-[28px] leading-9 focus:outline-none"
        >
          Guida
        </h1>
        <p className="text-muted-foreground">Come si usa roadmap2yes, pagina per pagina.</p>
      </div>
      <GuideIndex entries={index} />
    </div>
  );
}
