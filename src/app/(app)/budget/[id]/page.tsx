import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CategoryDetail } from "@/features/budget/CategoryDetail";
import { loadBudget } from "@/features/budget/data";
import { pageContext } from "@/features/budget/server";

export const metadata: Metadata = { title: "Categoria del budget" };

export default async function BudgetCategoryRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A malformed id is just "not found": it never reaches the database.
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { db, userId, today } = await pageContext();
  const snapshot = await loadBudget(db, { userId });
  if (!snapshot.categories.some((c) => c.id === id)) notFound();
  return <CategoryDetail snapshot={snapshot} categoryId={id} today={today} />;
}
