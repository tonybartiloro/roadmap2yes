import type { Metadata } from "next";
import { HelpLink } from "@/components/HelpLink";
import { loadDecisionList } from "@/features/decisions/data";
import { DecisionList } from "@/features/decisions/DecisionList";
import { pageContext } from "@/features/decisions/server";

export const metadata: Metadata = { title: "Scelte" };

export default async function ScelteRoute() {
  const { db } = await pageContext();
  const items = await loadDecisionList(db);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl leading-8 font-semibold">Scelte</h1>
          <HelpLink route="/scelte" />
        </div>
        <p className="text-muted-foreground">
          Le decisioni grandi, una alla volta: confronta le opzioni, scegli e, se serve, riapri.
        </p>
      </div>
      <DecisionList items={items} />
    </div>
  );
}
