import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadDecisionDetail } from "@/features/decisions/data";
import { DecisionDetail } from "@/features/decisions/DecisionDetail";
import { pageContext } from "@/features/decisions/server";

export const metadata: Metadata = { title: "Scelta" };

export default async function DecisionRoute({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { db, userId, today } = await pageContext();
  const view = await loadDecisionDetail(db, key, { userId, today });
  if (!view) notFound();
  return <DecisionDetail view={view} />;
}
